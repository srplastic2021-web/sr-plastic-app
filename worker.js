const JSON_HEADERS = {"content-type":"application/json; charset=utf-8","cache-control":"no-store"};
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:JSON_HEADERS});}
function auth(req,env){const h=req.headers.get("Authorization")||""; return !!env.ADMIN_PASSWORD && h === `Bearer ${env.ADMIN_PASSWORD}`;}

async function ensureColumns(env){
  const {results}=await env.DB.prepare("PRAGMA table_info(products)").all();
  const cols=new Set(results.map(x=>x.name));
  if(!cols.has("stock")) await env.DB.prepare("ALTER TABLE products ADD COLUMN stock INTEGER NOT NULL DEFAULT 1").run();
  if(!cols.has("images")) await env.DB.prepare("ALTER TABLE products ADD COLUMN images TEXT NOT NULL DEFAULT ''").run();
}
function parseImages(p){
  let arr=[];
  try{ if(p.images) arr=JSON.parse(p.images); }catch(e){}
  if(!Array.isArray(arr)) arr=[];
  if(!arr.length && p.image) arr=[p.image];
  return arr.filter(Boolean);
}

export default {async fetch(request,env){
  const url=new URL(request.url);
  if(url.pathname==="/api/products"){
    try{ await ensureColumns(env); }catch(e){ return json({error:"Database setup failed",detail:String(e)},500); }
    if(request.method==="GET"){
      const {results}=await env.DB.prepare("SELECT id,category,name,detail,rate,page,image,images,stock FROM products ORDER BY id").all();
      return json({products:results.map(p=>({...p,stock:Number(p.stock)!==0,images:parseImages(p)}))});
    }
    if(!auth(request,env)) return json({error:"Unauthorized"},401);
    if(request.method==="PUT"){
      const b=await request.json();
      const imgs=Array.isArray(b.images)?b.images.filter(Boolean).map(String):[];
      const primary=String(b.image||imgs[0]||"");
      await env.DB.prepare("UPDATE products SET name=?, detail=?, rate=?, category=?, image=?, images=?, stock=? WHERE id=?")
        .bind(String(b.name||""),String(b.detail||""),Number(b.rate||0),String(b.category||"Other"),primary,JSON.stringify(imgs),b.stock===false?0:1,Number(b.id)).run();
      return json({ok:true});
    }
    if(request.method==="POST"){
      const b=await request.json();
      const max=await env.DB.prepare("SELECT COALESCE(MAX(id),0) AS m FROM products").first();
      const id=Number(max.m)+1;
      const imgs=Array.isArray(b.images)?b.images.filter(Boolean).map(String):[];
      const primary=String(b.image||imgs[0]||"assets/product-1.jpg");
      if(!imgs.length) imgs.push(primary);
      await env.DB.prepare("INSERT INTO products(id,category,name,detail,rate,page,image,images,stock) VALUES(?,?,?,?,?,?,?,?,?)")
        .bind(id,String(b.category||"Other"),String(b.name||"New Product"),String(b.detail||""),Number(b.rate||0),0,primary,JSON.stringify(imgs),b.stock===false?0:1).run();
      return json({ok:true,id});
    }
    if(request.method==="DELETE"){
      const b=await request.json();
      await env.DB.prepare("DELETE FROM products WHERE id=?").bind(Number(b.id)).run();
      return json({ok:true});
    }
    return json({error:"Method not allowed"},405);
  }
  return env.ASSETS.fetch(request);
}};
