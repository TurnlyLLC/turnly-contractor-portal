// Only call with a fresh, server-fetched onboarding file, never request-body data.
const training=require('./contractor-training.cjs');
const background=require('./contractor-background.cjs');
function complete(file){return file?.complete===true&&Array.isArray(file.items)&&file.items.some(i=>i.required)&&file.items.every(i=>!i.required||i.state==='done');}
async function reconcile(db,id,file){
 if(!complete(file))return {approved:false,changed:false};
 await background.assertApproved(db,id);
 const checks=file.items.filter(background.isBackground);
 if(!checks.length||checks.some(i=>i.required&&i.state!=='done'))return {approved:false,changed:false};
 const result=await db.rpc('auto_approve_completed_contractor',{p_profile:id,p_checklist:{complete:true,items:file.items.map(i=>({id:i.id,required:!!i.required,state:i.state,background:background.isBackground(i)}))}});
 if(result.error)throw Object.assign(new Error('Unable to activate completed onboarding. Refresh to retry.'),{status:503});
 return result.data;
}
async function verified(db,id,file){
 const status=await training.withTraining(db,id,await background.attach(db,id,file));
 const approval=await reconcile(db,id,status);
 return {...status,account_approved:approval?.approved===true};
}
module.exports={complete,reconcile,verified};
