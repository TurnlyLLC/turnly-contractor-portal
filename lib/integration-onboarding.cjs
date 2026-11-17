const S=require('./residential-server.cjs'),{uuid}=require('./agent-referrals.cjs');
const training=require('./contractor-training.cjs');
function state(item,sub,today=new Date().toISOString().slice(0,10)){
 if(!sub)return 'todo';
 if(item.kind==='background')return sub.status==='rejected'?'rejected':sub.source==='admin'&&sub.status==='approved'?'done':'todo';
 if(sub.status==='rejected')return 'rejected';
 if(item.kind==='sign'&&sub.source!=='admin'&&sub.version<item.min_version)return 'resign';
 if(sub.expirationDate&&sub.expirationDate<today)return 'expired';
 if(sub.status==='pending')return 'in_review';
 return 'done';
}
function checklist(raw){
 const items=raw.items.map(i=>{
  let current=state(i,i.submission);
  if(i.kind==='background'&&current!=='done'&&i.grandfathered)current='done';
  return {...i,state:current};
 });
 return require('./mobile-contractor-review.cjs').safeFile({items,complete:items.filter(i=>i.required).every(i=>i.state==='done')});
}
async function run(db,actor,action,input,key){
 if(!uuid(input.profile_id))throw S.fail('Choose a contractor.');
 if(!['read','academy','training_requirement'].includes(action))throw S.fail('Unknown onboarding operation.');
 const allowed=action==='training_requirement'?['profile_id','required','expected_revision','reason']:['profile_id'];
 if(Object.keys(input).some(k=>!allowed.includes(k)))throw S.fail('Unsupported onboarding field.');
 const profile=S.checked(await db.from('profiles').select('id,full_name,email,role,status,contractor_approved').eq('id',input.profile_id).maybeSingle());
 if(!profile||profile.role!=='contractor')throw S.fail('Contractor not found.',404);
 if(action==='training_requirement'){
  if(typeof input.reason!=='string'||input.reason.trim().length<5||input.reason.length>300)throw S.fail('Explain the requirement change (5–300 characters).');
  await training.requirement(db,actor,profile.id,{...input,item_id:'academy-training'});
 }
 const rows=await training.rows(db,profile.id),academy={...require('./contractor-directory-progress.cjs').academy(rows,profile.id),revisions:Object.fromEntries(rows.map(r=>[r.module_number,r.revision||null]))};
 if(action!=='read')return {profile,academy,as_of:new Date().toISOString()};
 const result=await db.rpc('integration_onboarding_snapshot',{p_key:key,p_profile:profile.id});
 if(result.error)throw S.fail('Onboarding details are unavailable.',503);
 let file=checklist(result.data);
 file=await require('./contractor-background.cjs').attach(db,profile.id,file,true);
 file=training.merge(file,training.items(rows,profile.id));
 file=await require('./contractor-draft-status.cjs').attach(db,profile.id,file);
 return {profile,onboarding:file,academy,as_of:new Date().toISOString(),note:'Drafts are not signatures. Waived training is not completed coursework.'};
}
module.exports={run,state,checklist};
