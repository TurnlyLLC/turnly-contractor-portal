const {database,body,json,admin,rate,fail,hash}=require('../lib/residential-server.cjs');
const R=require('../lib/recruiting-workflows.cjs');
const {validate,review,ROLES,STATUSES,CITIES}=require('../lib/applicants.cjs');
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
  const input=await R.requestBody(req),db=database();
  if(input.action==='submit'){
   if(input.website)return json(res,200,{ok:true});
   const row=validate(input);await rate(db,req,'applicants');
   if(row.role==='cleaner'&&!input.resume)throw fail('Upload your resume PDF before submitting your application.');
   if(input.resume&&row.role!=='cleaner')throw fail('Resumes are only accepted for cleaner applications.');
   if(input.resume)R.pdf(input.resume);
   if(row.role==='brand_ambassador'&&!/^[a-f0-9]{64}$/.test(input.enrollment_token||''))throw fail('Reload the application before continuing.');
   const enrollment_hash=row.role==='brand_ambassador'?hash(input.enrollment_token):null;
   const fingerprint=hash(JSON.stringify(row)+String(enrollment_hash||'')+(input.resume?hash(input.resume.data):''));
   const saved=await db.from('recruiting_applications').insert({...row,status:row.role==='brand_ambassador'?'onboarding':'new',payload_hash:fingerprint,enrollment_hash}).select('id').single();
   if(saved.error?.code==='23505'){
    const existing=checked(await db.from('recruiting_applications').select('payload_hash').eq('id',row.id).maybeSingle());
    if(existing?.payload_hash!==fingerprint)throw fail('This application has changed. Reload the page before submitting again.',409);
   }else checked(saved);
   if(input.resume){
    const stored=checked(await db.from('recruiting_applications').select('resume_path').eq('id',row.id).single());
    if(!stored.resume_path){const path=await R.upload(db,'resumes/'+row.id+'/'+require('node:crypto').randomUUID()+'.pdf',input.resume);checked(await db.from('recruiting_applications').update({resume_path:path,resume_name:'Resume.pdf'}).eq('id',row.id).is('resume_path',null));}
   }
   await R.queue(db,row);let emailed=false;try{emailed=await R.deliver(db,row.id);}catch{console.warn('Application email queued for retry');}
   return json(res,200,{ok:true,reference:row.id,email_sent:emailed,next:row.role==='brand_ambassador'?'https://ba.turnlypros.com/ba-signup.html#application='+row.id+'&token='+input.enrollment_token:null});
  }
  const actor=await admin(db,req);
  if(input.action==='email_preview'){if(!ROLES.includes(input.role))throw fail('Choose a position.');const email=await R.prepare(db,{role:input.role,name:'Applicant name',email:'applicant@example.com',id:'APPLICATION-REFERENCE'});return json(res,200,{subject:email.subject,text:email.text});}
  if(input.action==='list'){
   const role=input.role||'cleaner';if(!ROLES.includes(role))throw fail('Choose cleaner or brand ambassador applications.');
   const page=Math.max(1,Math.min(10000,parseInt(input.page)||1));
   let q=db.from('recruiting_applications').select('id,role,name,email,phone,city,state,service_city,service_cities:answers->service_cities,status,created_at,version',{count:'exact'}).order('created_at',{ascending:false});
   q=q.eq('role',role).is('deleted_at',null);
   if(input.status!=='hired')q=q.is('hired_at',null);
   else q=q.eq('status','hired');
   if(STATUSES.includes(input.status))q=q.eq('status',input.status);
   if(input.city){if(!CITIES.includes(input.city))throw fail('Choose a valid service zone.');q=q.or(`service_city.eq.${input.city},answers->service_cities.cs.${JSON.stringify([input.city])}`);}
   const search=String(input.search||'').replace(/[^a-zA-Z0-9@. +_-]/g,'').slice(0,100);
   if(search)q=q.or(`name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);
   const result=await q.range((page-1)*30,page*30-1);checked(result);
   const totals=await Promise.all(ROLES.map(async r=>{const result=await db.from('recruiting_applications').select('id',{count:'exact',head:true}).eq('role',r).is('deleted_at',null).is('hired_at',null).is('reviewed_by',null);checked(result);return [r,result.count];}));
   const total=await db.from('recruiting_applications').select('id',{count:'exact',head:true}).eq('role',role).is('deleted_at',null).is('hired_at',null);checked(total);
   return json(res,200,{rows:result.data,count:result.count,total:total.count,page,counts:Object.fromEntries(totals)});
  }
  if(!/^[0-9a-f-]{36}$/i.test(input.id||''))throw fail('Choose an application.');
  if(input.action==='hire')return json(res,200,await require('../lib/applicant-hiring.cjs').hire(db,actor,input.id));
  if(input.action==='delete'){const r=await db.rpc('delete_applicant',{p_id:input.id,p_actor:actor});if(r.error)throw fail('This application cannot be deleted while hiring or after hiring. Manage the account from Directory.',409);return json(res,200,{ok:true});}
  if(input.action==='onboarding'){
   const a=checked(await db.from('recruiting_applications').select('email,role').eq('id',input.id).single());if(a.role!=='brand_ambassador')throw fail('Choose an ambassador application.');
   const m=checked(await db.from('ba_members').select('user_id,onboarding_completed_at').eq('email',a.email).maybeSingle());
   const record=m?checked(await db.from('ba_onboarding').select('agreement_version,agreement_text,signature_name,signed_at,w9_received_at,completed_at').eq('user_id',m.user_id).maybeSingle()):null;
   const delivery=checked(await db.from('recruiting_delivery').select('sent_at,last_error').eq('application_id',input.id).maybeSingle());
   return json(res,200,{member_id:m?.user_id,record,delivery});
  }
  if(input.action==='resume'){const a=checked(await db.from('recruiting_applications').select('resume_path').eq('id',input.id).single());if(!a.resume_path)throw fail('No resume is attached.',404);return json(res,200,{url:await R.signedDownload(db,a.resume_path)});}
  if(input.action==='detail')return json(res,200,{welcome:checked(await db.from('recruiting_hires').select('sent_at,last_error').eq('application_id',input.id).maybeSingle()),application:checked(await db.from('recruiting_applications').select('*').eq('id',input.id).is('deleted_at',null).single()),events:checked(await db.from('recruiting_application_events').select('status,note,created_at').eq('application_id',input.id).order('created_at',{ascending:false}))});
  if(input.action==='review'){
   const change=review(input);
   const result=checked(await db.from('recruiting_applications').update({status:change.status,review_note:change.note,reviewed_by:actor,version:input.version+1,updated_at:new Date().toISOString()}).eq('id',input.id).eq('version',input.version).is('deleted_at',null).is('hired_at',null).select('id'));
   if(!result.length)throw fail('Another admin updated this application. Reload it before saving.',409);
   return json(res,200,{ok:true});
  }
  throw fail('Unknown action.');
 }catch(e){return json(res,e.status||500,{error:e.status?e.message:'Unable to process the application. Please try again.'});}
};
