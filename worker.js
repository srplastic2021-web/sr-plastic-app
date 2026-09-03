const JSON_HEADERS={"content-type":"application/json; charset=utf-8","cache-control":"no-store"};
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:JSON_HEADERS});}
function auth(req,env){const h=req.headers.get('Authorization')||'';return !!env.ADMIN_PASSWORD&&h===`Bearer ${env.ADMIN_PASSWORD}`;}
async function ensureColumns(env){
  const t=await env.DB.prepare("PRAGMA table_info(products)").all();
  const cols=new Set((t.results||[]).map(x=>x.name));
  if(!cols.has('stock')) await env.DB.prepare("ALTER TABLE products ADD COLUMN stock INTEGER NOT NULL DEFAULT 1").run();
  if(!cols.has('images')) await env.DB.prepare("ALTER TABLE products ADD COLUMN images TEXT NOT NULL DEFAULT ''").run();
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS image_store (id TEXT PRIMARY KEY, mime TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
}
function parseImages(p){let a=[];try{a=p.images?JSON.parse(p.images):[]}catch(e){}if(!Array.isArray(a))a=[];if(!a.length&&p.image)a=[p.image];return a.filter(Boolean);}
function imageIdFromUrl(u){try{const x=new URL(u);const m=x.pathname.match(/^\/media\/([^/]+)$/);return m?decodeURIComponent(m[1]):null}catch(e){return null}}
function bytesToBase64(buf){let binary='';const bytes=new Uint8Array(buf);const chunk=0x8000;for(let i=0;i<bytes.length;i+=chunk)binary+=String.fromCharCode(...bytes.subarray(i,i+chunk));return btoa(binary);}
export default {async fetch(request,env){
  const url=new URL(request.url);
  try{await ensureColumns(env)}catch(e){return json({error:'Database setup failed',detail:String(e)},500)}
  if(url.pathname.startsWith('/media/')){
    const id=decodeURIComponent(url.pathname.slice(7));
    const obj=await env.DB.prepare('SELECT mime,data FROM image_store WHERE id=?').bind(id).first();
    if(!obj)return new Response('Not found',{status:404});
    const binary=atob(obj.data);const bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
    return new Response(bytes,{headers:{'content-type':obj.mime,'cache-control':'public, max-age=31536000, immutable'}});
  }
  if(url.pathname==='/api/upload'&&request.method==='POST'){
    if(!auth(request,env))return json({error:'Unauthorized'},401);
    const b=await request.json().catch(()=>null);
    if(!b||!b.data||!b.mime)return json({error:'Image data missing'},400);
    if(!String(b.mime).startsWith('image/'))return json({error:'Only image files are allowed'},400);
    const data=String(b.data);if(data.length>700000)return json({error:'Image is too large after compression. Please choose a smaller photo.'},400);
    const id=`${Date.now()}-${crypto.randomUUID()}`;
    await env.DB.prepare('INSERT INTO image_store(id,mime,data) VALUES(?,?,?)').bind(id,String(b.mime),data).run();
    return json({ok:true,url:`${url.origin}/media/${encodeURIComponent(id)}`,id});
  }
  if(url.pathname==='/api/images'&&request.method==='DELETE'){
    if(!auth(request,env))return json({error:'Unauthorized'},401);
    const b=await request.json();const id=imageIdFromUrl(String(b.url||''));if(id)await env.DB.prepare('DELETE FROM image_store WHERE id=?').bind(id).run();return json({ok:true});
  }
  if(url.pathname==='/api/products'){
    if(request.method==='GET'){
      const {results}=await env.DB.prepare('SELECT id,category,name,detail,rate,page,image,images,stock FROM products ORDER BY id').all();
      return json({products:(results||[]).map(p=>({...p,stock:Number(p.stock)!==0,images:parseImages(p)}))});
    }
    if(!auth(request,env))return json({error:'Unauthorized'},401);
    if(request.method==='PUT'){
      const b=await request.json();const imgs=Array.isArray(b.images)?b.images.filter(Boolean).map(String):[];const primary=String(b.image||imgs[0]||'');
      await env.DB.prepare('UPDATE products SET name=?,detail=?,rate=?,category=?,image=?,images=?,stock=? WHERE id=?').bind(String(b.name||''),String(b.detail||''),Number(b.rate||0),String(b.category||'Other'),primary,JSON.stringify(imgs),b.stock===false?0:1,Number(b.id)).run();return json({ok:true});
    }
    if(request.method==='POST'){
      const b=await request.json();const max=await env.DB.prepare('SELECT COALESCE(MAX(id),0) AS m FROM products').first();const id=Number(max.m)+1;
      const imgs=Array.isArray(b.images)?b.images.filter(Boolean).map(String):[];const primary=String(b.image||imgs[0]||'');
      await env.DB.prepare('INSERT INTO products(id,category,name,detail,rate,page,image,images,stock) VALUES(?,?,?,?,?,?,?,?,?)').bind(id,String(b.category||'Other'),String(b.name||'New Product'),String(b.detail||''),Number(b.rate||0),0,primary,JSON.stringify(imgs),b.stock===false?0:1).run();return json({ok:true,id});
    }
    if(request.method==='DELETE'){
      const b=await request.json();const old=await env.DB.prepare('SELECT images,image FROM products WHERE id=?').bind(Number(b.id)).first();
      await env.DB.prepare('DELETE FROM products WHERE id=?').bind(Number(b.id)).run();
      if(old){for(const u of parseImages(old)){const id=imageIdFromUrl(u);if(id)await env.DB.prepare('DELETE FROM image_store WHERE id=?').bind(id).run();}}
      return json({ok:true});
    }
    return json({error:'Method not allowed'},405);
  }
  return env.ASSETS.fetch(request);
}};
