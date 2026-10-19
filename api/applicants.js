const {database,body,json,admin,rate,fail,hash}=require('../lib/residential-server.cjs');
const {validate,review,ROLES,STATUSES}=require('../lib/applicants.cjs');
const checked=r=>{if(r.error)throw fail('Applications are temporarily unavailable. Please try again.',503);return r.data;};
const origins=new Set(['https://portal.turnlypros.com','https://turnlypros.com','https://www.turnlypros.com','https://res.turnlypros.com']);
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 const origin=req.headers.origin;
 if(origin&&!origins.has(origin)&&origin!==`https://${process.env.VERCEL_URL}`)return json(res,403,{error:'Use the Turnly application page.'});
 if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
 res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
 if(req.method==='OPTIONS'){res.statusCode=204;return res.end();}
 if(req.method!=='POST')return json(res,405,{error:'Method not allowed.'});
 try{
  const input=await body(req),db=database();
  if(input.action==='submit'){
   if(input.website)return json(res,200,{ok:true});
   const row=validate(input);await rate(db,req,'applicants');
   const fingerprint=hash(JSON.stringify(row));
   const saved=await db.from('recruiting_applications').insert({...row,payload_hash:fingerprint}).select('id').single();
   if(saved.error?.code==='23505'){
    const existing=checked(await db.from('recruiting_applications').select('payload_hash').eq('id',row.id).maybeSingle());
    if(existing?.payload_hash!==fingerprint)throw fail('This application has changed. Reload the page before submitting again.',409);
   }else checked(saved);
   return json(res,200,{ok:true,reference:row.id});
  }
  const actor=await admin(db,req);
  if(input.action==='list'){
   const role=input.role||'cleaner';if(!ROLES.includes(role))throw fail('Choose cleaner or brand ambassador applications.');
   const page=Math.max(1,Math.min(10000,parseInt(input.page)||1));
   let q=db.from('recruiting_applications').select('id,role,name,email,phone,city,state,service_city,status,created_at,version',{count:'exact'}).order('created_at',{ascending:false});
   q=q.eq('role',role);
   if(STATUSES.includes(input.status))q=q.eq('status',input.status);
   if(input.city)q=q.eq('service_city',String(input.city).slice(0,30));
   const search=String(input.search||'').replace(/[^a-zA-Z0-9@. +_-]/g,'').slice(0,100);
   if(search)q=q.or(`name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);
   const result=await q.range((page-1)*30,page*30-1);checked(result);
   const totals=await Promise.all(ROLES.map(async r=>{const result=await db.from('recruiting_applications').select('id',{count:'exact',head:true}).eq('role',r);checked(result);return [r,result.count];}));
   return json(res,200,{rows:result.data,count:result.count,page,counts:Object.fromEntries(totals)});
  }
  if(!/^[0-9a-f-]{36}$/i.test(input.id||''))throw fail('Choose an application.');
  if(input.action==='detail')return json(res,200,{application:checked(await db.from('recruiting_applications').select('*').eq('id',input.id).single()),events:checked(await db.from('recruiting_application_events').select('status,note,created_at').eq('application_id',input.id).order('created_at',{ascending:false}))});
  if(input.action==='review'){
   const change=review(input);
   const result=checked(await db.from('recruiting_applications').update({status:change.status,review_note:change.note,reviewed_by:actor,version:input.version+1,updated_at:new Date().toISOString()}).eq('id',input.id).eq('version',input.version).select('id'));
   if(!result.length)throw fail('Another admin updated this application. Reload it before saving.',409);
   return json(res,200,{ok:true});
  }
  throw fail('Unknown action.');
 }catch(e){return json(res,e.status||500,{error:e.status?e.message:'Unable to process the application. Please try again.'});}
};
