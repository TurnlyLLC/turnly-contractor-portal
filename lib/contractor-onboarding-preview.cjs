const mobile=require('./mobile-contractor-review.cjs');
const {uuid}=require('./agent-referrals.cjs');
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
async function run(db,input,token,secret,transport){
 if(!['status','draft','signed_file'].includes(input.action))throw fail('Admin preview is read-only. Saving, signing, and uploads are disabled.',403);
 if(!uuid(input.profile_id))throw fail('Choose a contractor to preview.');
 const p=await db.from('profiles').select('id,full_name,email,role,status').eq('id',input.profile_id).maybeSingle();
 if(p.error||p.data?.role!=='contractor')throw fail('Contractor not found.',404);
 const profile=p.data,call=mobile.client(token,transport);
 const raw=await call(`contractors/${profile.id}`);
 if(input.action==='signed_file')return mobile.review(call,profile.id,{action:'mobile_file',submission_id:input.submission_id});
 if(input.action==='draft'){
  if(!raw.items?.some(i=>i.id===input.item_id&&['form','sign'].includes(i.kind)))throw fail('Form not found.',404);
  const r=await db.from('contractor_onboarding_drafts').select('ciphertext,revision,updated_at').eq('profile_id',profile.id).eq('item_id',input.item_id).maybeSingle();
  if(r.error)throw fail('Unable to read saved draft.',503);
  return r.data?{revision:r.data.revision,updatedAt:r.data.updated_at,draft:require('./contractor-onboarding.cjs').open(r.data.ciphertext,secret,profile.id+':'+input.item_id)}:{revision:0,draft:null};
 }
 const templates=(await call('items')).items||[];
 const file=mobile.safeFile(raw);
 file.items=file.items.map(i=>{const t=templates.find(t=>t.id===i.id)||{};return {...i,description:t.description||'',version:t.version,fields:t.fields||[],questionCount:t.fields?.length||0,hasDocument:false};});
 const status=await require('./contractor-draft-status.cjs').attach(db,profile.id,await require('./contractor-training.cjs').withTraining(db,profile.id,await require('./contractor-background.cjs').attach(db,profile.id,file)));
 return {...status,identity:{name:profile.full_name,email:profile.email},profile:{full_name:profile.full_name,email:profile.email},preview:true,consent:raw.consent||'Preview only. The contractor must review and agree to electronic signing in their own session.'};
}
module.exports={run};
