const S=require('../lib/residential-server.cjs');
const onboarding=require('../lib/contractor-onboarding.cjs');
const {uuid}=require('../lib/agent-referrals.cjs');
async function claim(db,req,input,transport){
  const token=String(req.headers.authorization||'').match(/^Bearer (.+)$/i)?.[1];
  const profile=await onboarding.access(db,token);
  const {data:approval,error}=await db.from('profiles').select('contractor_approved,status').eq('id',profile.id).single();
  if(error)throw S.fail('Unable to verify job access. Please retry.',503);
  const status=await onboarding.remote(token,transport)('status');
  const complete=Array.isArray(status.items)&&status.items.length>0&&status.complete!==false&&status.items.every(i=>!i.required||i.state==='done');
  const eligible=complete&&approval?.contractor_approved===true&&approval.status==='active';
  if(input.action==='eligibility')return {eligible,complete,reason:!complete?'Complete all required onboarding items before accepting jobs.':!eligible?'Your onboarding is awaiting Turnly approval.':''};
  if(!eligible)throw S.fail(!complete?'Complete all required onboarding items before accepting jobs.':'Your onboarding is awaiting Turnly approval.',403);
  if(!uuid(input.id))throw S.fail('Choose a job.');
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
