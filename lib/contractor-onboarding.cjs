const crypto=require('node:crypto');
const training=require('./contractor-training.cjs');
const ORIGIN='https://turnly-contractor-app-backend.rork.app';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const checked=r=>{if(r.error)throw fail('Unable to save or load progress. Please retry.',503);return r.data;};
function seal(value,secret,context){
 const key=crypto.hkdfSync('sha256',secret,'turnly-contractor-drafts','v1',32),iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key,iv);
 c.setAAD(Buffer.from(context));const bytes=Buffer.concat([c.update(JSON.stringify(value),'utf8'),c.final()]);
 return [iv,c.getAuthTag(),bytes].map(b=>b.toString('base64')).join('.');
}
function open(value,secret,context){
 try{const [iv,tag,bytes]=value.split('.').map(s=>Buffer.from(s,'base64')),key=crypto.hkdfSync('sha256',secret,'turnly-contractor-drafts','v1',32),c=crypto.createDecipheriv('aes-256-gcm',key,iv);c.setAAD(Buffer.from(context));c.setAuthTag(tag);return JSON.parse(Buffer.concat([c.update(bytes),c.final()]).toString('utf8'));}
 catch{throw fail('This saved draft cannot be opened. Contact Turnly support; do not overwrite it.',503);}
}
async function access(db,token){
 if(!token)throw fail('Sign in to continue.',401);
 const auth=await db.auth.getUser(token);if(auth.error||!auth.data?.user||auth.data.user.deleted_at)throw fail('Sign in again to continue.',401);
 const profile=checked(await db.from('profiles').select('id,role,status,full_name,email').eq('id',auth.data.user.id).maybeSingle());
 if(profile?.role!=='contractor'||['deleted','deletion_pending','disabled','suspended','inactive','deactivated','rejected'].includes(profile.status))throw fail('This contractor account cannot access onboarding. Contact Turnly.',403);
 return profile;
}
function remote(token,transport=fetch){return async(path,body,headers={})=>{
 const r=await transport(ORIGIN+'/onboarding/'+path,{method:body===undefined?'GET':'POST',redirect:'error',signal:AbortSignal.timeout(45000),headers:{'X-Supabase-Auth':token,...(body===undefined?{}:{'Content-Type':'application/json'}),...headers},...(body===undefined?{}:{body:Buffer.isBuffer(body)?body:JSON.stringify(body)})});
 const data=await r.json().catch(()=>null);if(!r.ok||!data||data.ok===false)throw fail(data?.error||'The document service is unavailable. Please retry.',r.status>=400&&r.status<500?r.status:503);return data;
};}
function safeLink(data){const u=new URL(data.url);if(u.origin!==ORIGIN||!u.pathname.startsWith('/onboarding/f/'))throw fail('The document link is unavailable.',503);return {url:u.href};}
async function run(db,profile,input,token,secret,transport){
 if(input.action==='file_content'){
   if(!['document','signed_file'].includes(input.kind))throw fail('Choose a document.');
   const {url}=await run(db,profile,{...input,action:input.kind},token,secret,transport);
   const response=await (transport||fetch)(url,{redirect:'error',signal:AbortSignal.timeout(30000)});
   if(!response.ok)throw fail('Unable to open this document. Try again.',503);
   const mime=(response.headers.get('content-type')||'').split(';')[0];
   if(!['application/pdf','image/png','image/jpeg'].includes(mime))throw fail('This file cannot be previewed.',400);
   const bytes=Buffer.from(await response.arrayBuffer());
   if(bytes.length>3*1024*1024)throw fail('Use the full-size document link to view this larger file.',413);
   return {mime,data:bytes.toString('base64')};
 }
 const call=remote(token,transport),id=String(input.item_id||''),context=profile.id+':'+id;
 if(input.action==='status')return {...await training.withTraining(db,profile.id,await require('./contractor-background.cjs').attach(db,profile.id,await call('status'))),identity:{name:profile.full_name,email:profile.email}};
 if(input.action==='signed_file'){
   if(!/^[\w-]{1,120}$/.test(input.submission_id||''))throw fail('Choose a signed document.');
   return safeLink(await call('submissions/'+input.submission_id+'/link',{}));
 }
 if(!/^[\w-]{1,120}$/.test(id))throw fail('Choose an onboarding item.');
 const status=await call('status'),item=status.items?.find(i=>i.id===id);if(!item)throw fail('This onboarding item is no longer available.',404);
 if(input.action==='document')return safeLink(await call('items/'+id+'/document'));
 if(input.action==='draft'){
   const row=checked(await db.from('contractor_onboarding_drafts').select('*').eq('profile_id',profile.id).eq('item_id',id).maybeSingle());
   return row?{revision:row.revision,draft:open(row.ciphertext,secret,context)}:{revision:0,draft:null};
 }
 if(['save','sign'].includes(input.action)){
   if(!['sign','form'].includes(item.kind))throw fail('This item is not a form.');
   if(input.version!==item.version)throw fail('This document was updated. Reopen it to review the latest version.',409);
 }
 if(input.action==='save'){
   if(!Number.isInteger(input.revision)||input.revision<0)throw fail('Reopen the form before saving.');
   const draft=input.draft;if(!draft||typeof draft!=='object'||JSON.stringify(draft).length>100000)throw fail('Draft is too large or invalid.');
   const r=await db.rpc('save_contractor_onboarding_draft',{p_profile:profile.id,p_item:id,p_revision:input.revision,p_ciphertext:seal({...draft,version:item.version},secret,context)});
   if(r.error)throw fail(r.error.code==='P0001'?'Progress changed in another window. Reopen this form before editing.':'Your progress could not be saved. Retry before leaving.',r.error.code==='P0001'?409:503);
   return {revision:r.data};
 }
 if(input.action==='sign'){
   if(input.consent!==true)throw fail('Agree to sign electronically first.');
   const row=checked(await db.from('contractor_onboarding_drafts').select('*').eq('profile_id',profile.id).eq('item_id',id).maybeSingle());
   if(!row||row.revision!==input.revision)throw fail('Save your latest answers before signing.',409);
   const draft=open(row.ciphertext,secret,context);if(draft.version!==item.version)throw fail('Review the updated document before signing.',409);
   const result=await call('items/'+id+'/sign',{signerName:draft.signerName,fields:draft.fields,consent:true});
   // Delete only the draft that was signed, never a newer edit from another tab.
   checked(await db.from('contractor_onboarding_drafts').delete().eq('profile_id',profile.id).eq('item_id',id).eq('revision',row.revision));
   return result;
 }
 if(input.action==='upload'){
   if(!['upload','background'].includes(item.kind))throw fail('This item does not accept files.');
   if(!['application/pdf','image/jpeg','image/png'].includes(input.mime))throw fail('Choose a PDF, JPG or PNG.');
   const bytes=Buffer.from(String(input.file||''),'base64');if(!bytes.length||bytes.length>3*1024*1024)throw fail('Choose a file up to 3 MB.');
   return call('items/'+id+'/upload',bytes,{'Content-Type':input.mime,'X-File-Name':encodeURIComponent(String(input.name||'document').slice(0,150)),'X-Expiration-Date':String(input.expiration||'')});
 }
 if(input.action==='watched'&&item.kind==='video')return call('items/'+id+'/watched',{});
 throw fail('Unknown onboarding action.');
}
module.exports={access,run,seal,open,remote,safeLink};
