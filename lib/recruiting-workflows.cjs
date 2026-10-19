const S=require('./residential-server.cjs');
const {randomBytes,randomUUID}=require('node:crypto');
const BUCKET='recruiting-private';
async function requestBody(req){let x;if(req.body&&typeof req.body==='object'&&!Buffer.isBuffer(req.body))x=req.body;else{let raw=req.body||'';if(!raw)for await(const chunk of req){raw+=chunk.toString();if(Buffer.byteLength(raw)>1500000)throw S.fail('Keep the PDF under 1 MB.');}x=JSON.parse(raw||'{}');}if(Buffer.byteLength(JSON.stringify(x))>1500000)throw S.fail('Keep the PDF under 1 MB.');return x;}
function pdf(value){if(!value||typeof value.data!=='string'||value.data.length>1400000||!/^[A-Za-z0-9+/]*={0,2}$/.test(value.data))throw S.fail('Upload a PDF under 1 MB.');const b=Buffer.from(value.data,'base64');if(b.length>1048576||b.length<8||b.subarray(0,5).toString()!=='%PDF-'||!b.subarray(-2048).includes(Buffer.from('%%EOF')))throw S.fail('Upload a valid PDF under 1 MB.');return b;}
async function upload(db,path,value){const bytes=pdf(value);S.checked(await db.storage.from(BUCKET).upload(path,bytes,{contentType:'application/pdf',upsert:false}));return path;}
async function signedDownload(db,path){const r=S.checked(await db.storage.from(BUCKET).createSignedUrl(path,60,{download:true}));return r.signedUrl;}
async function queue(db,row){const r=await db.from('recruiting_delivery').insert({application_id:row.id});if(r.error&&r.error.code!=='23505')S.checked(r);}
async function prepare(db,row){
 const text=row.role==='cleaner'?`Thank you, ${row.name}, for applying to clean with Turnly!\n\nWe received your application and our team will review it. We will contact you about next steps. Your reference is ${row.id}.\n\nQuestions? Reply to admin@turnlypros.com.\n\nTurnly`:
 `Welcome to Turnly, ${row.name}!\n\nYour brand ambassador application is accepted automatically. Create your password and complete your agreement and W-9 in your online workspace: https://ba.turnlypros.com/ba-login.html. If you just applied, continue in the signup page already opened in your browser.\n\nEarn $25 when a qualifying new customer's first booking is confirmed and another $25 when that clean is completed. Complete onboarding before sharing referrals.\n\nReference: ${row.id}\nQuestions? Reply to admin@turnlypros.com.`;
 return {from:process.env.REFERRAL_FROM_EMAIL,to:[row.email],reply_to:'admin@turnlypros.com',subject:row.role==='cleaner'?'Thanks for applying to Turnly':'Welcome to Turnly — complete your ambassador onboarding',text};
}
async function deliver(db,id){
 const rows=S.checked(await db.from('recruiting_delivery').update({processing_at:new Date().toISOString()}).eq('application_id',id).is('sent_at',null).or('processing_at.is.null,processing_at.lt.'+new Date(Date.now()-300000).toISOString()).select('*'));
 if(!rows.length)return false;const delivery=rows[0];
 if(!process.env.RESEND_API_KEY||!process.env.REFERRAL_FROM_EMAIL)throw S.fail('Application email is waiting for delivery configuration.',503);
 // Stop ambiguous retries after Resend's 24-hour idempotency window; admin can investigate.
 if(delivery.attempts>0&&Date.now()-new Date(delivery.created_at).getTime()>23*3600000)throw S.fail('Email delivery needs admin review.',503);
 let payload=delivery.payload;
 if(!payload){const row=S.checked(await db.from('recruiting_applications').select('*').eq('id',id).single());const prepared=await prepare(db,row);const saved=S.checked(await db.from('recruiting_delivery').update({payload:prepared}).eq('application_id',id).is('payload',null).select('payload'));payload=saved[0]?.payload||S.checked(await db.from('recruiting_delivery').select('payload').eq('application_id',id).single()).payload;}
 S.checked(await db.from('recruiting_delivery').update({attempts:delivery.attempts+1}).eq('application_id',id));
 const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'application-thanks-'+id},body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});
 if(!r.ok){await db.from('recruiting_delivery').update({last_error:'Email provider HTTP '+r.status}).eq('application_id',id);throw S.fail('Your application is saved; the email will be retried.',503);}
 const result=await r.json();if(!result.id)throw S.fail('Email delivery pending.',503);
 S.checked(await db.from('recruiting_delivery').update({sent_at:new Date().toISOString(),last_error:null,payload:null}).eq('application_id',id));return true;
}
module.exports={requestBody,pdf,upload,signedDownload,queue,deliver,BUCKET};
