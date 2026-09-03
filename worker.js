const JSON_HEADERS = {"content-type":"application/json; charset=utf-8","cache-control":"no-store"};
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:JSON_HEADERS});}
function auth(req,env){const h=req.headers.get("Authorization")||""; return env.ADMIN_PASSWORD && h === `Bearer ${env.ADMIN_PASSWORD}`;}
export default {async fetch(request,env){
 const url=new URL(request.url);
 if(url.pathname==="/api/products"){
   if(request.method==="GET"){
     const {results}=await env.DB.prepare("SELECT id,category,name,detail,rate,page,image FROM products ORDER BY id").all();
     return json({products:results});
   }
   if(!auth(request,env)) return json({error:"Unauthorized"},401);
   if(request.method==="PUT"){
     const b=await request.json();
     await env.DB.prepare("UPDATE products SET name=?, detail=?, rate=? WHERE id=?").bind(String(b.name||""),String(b.detail||""),Number(b.rate||0),Number(b.id)).run();
     return json({ok:true});
   }
   if(request.method==="POST"){
     const b=await request.json();
     const max=await env.DB.prepare("SELECT COALESCE(MAX(id),0) AS m FROM products").first();
     const id=Number(max.m)+1;
     await env.DB.prepare("INSERT INTO products(id,category,name,detail,rate,page,image) VALUES(?,?,?,?,?,?,?)").bind(id,String(b.category||"Other"),String(b.name||"New Product"),String(b.detail||""),Number(b.rate||0),0,String(b.image||"assets/product-1.jpg")).run();
     return json({ok:true,id});
   }
 }
 return env.ASSETS.fetch(request);
}};