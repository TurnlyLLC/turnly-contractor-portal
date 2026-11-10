const S=require('../lib/residential-server.cjs');
const onboarding=require('../lib/contractor-onboarding.cjs');
const training=require('../lib/contractor-training.cjs');
const {uuid}=require('../lib/agent-referrals.cjs');
async function claim(db,req,input,transport){
  const token=String(req.headers.authorization||'').match(/^Bearer (.+)$/i)?.[1];
  const profile=await onboarding.access(db,token);
  const [trainingRows,file] = await Promise.all([
    training.rows(db,profile.id),
    onboarding.remote(token,transport)('status')
  ]);
  const status=training.merge(await require('../lib/contractor-background.cjs').attach(db,profile.id,file),training.items(trainingRows,profile.id));
  const complete=require('../lib/contractor-auto-approval.cjs').complete(status);
  const activation=complete?await require('../lib/contractor-auto-approval.cjs').reconcile(db,profile.id,status):null;
  const eligible=complete&&activation?.approved===true;
  if(input.action==='eligibility'&&eligible){
    const rating=S.checked(await db.rpc('contractor_rating_summary',{p_contractor:profile.id}));
    if(rating?.status==='paused')return {eligible:false,complete,reason:'New claims are paused. Open Performance to review the reason and request another review.'};
  }
  if(input.action==='eligibility')return {eligible,complete,reason:!complete?'Complete all required onboarding items before accepting jobs.':!eligible?'Your onboarding is awaiting Turnly approval.':''};
  if(!eligible)throw S.fail(!complete?'Complete all required onboarding items before accepting jobs.':'Your onboarding is awaiting Turnly approval.',403);
  if(!uuid(input.id))throw S.fail('Choose a job.');
  await require('../lib/contractor-background.cjs').assertApproved(db,profile.id);
  const result=await db.rpc('claim_onboarded_contractor_job',{p_actor:profile.id,p_job:input.id});
  if(result.error)throw S.fail(result.error.code==='P0001'?result.error.message:'Unable to claim this job. Please retry.',409);
  return {claimed:true};
}
module.exports=async(req,res)=>{
  if(req.method!=='POST')return S.json(res,405,{error:'Use POST.'});
  try{return S.json(res,200,await claim(S.database(),req,await S.body(req)));}
  catch(e){return S.json(res,e.status||503,{error:e.status?e.message:'Unable to verify onboarding. Please try again.'});}
};
module.exports.claim=claim;
