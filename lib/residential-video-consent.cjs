const S = require('./residential-server.cjs');
const {uuid} = require('./agent-referrals.cjs');
const CONSENT = 'I am the customer or an adult authorized by the customer for this cleaning. I decline before-clean and after-clean video recording for this visit. This choice applies to both videos for this assignment only. I understand that Turnly will retain this signed choice with the cleaning record and make it available in my customer account. This choice does not waive my right to report a service concern.';
function signature(input) {
  const name=String(input.customer_name||'').trim();
  if(name.length<2||name.length>160||input.agreed!==true)throw S.fail('The customer must enter their name and agree to the video opt-out.');
  const strokes=input.signature;
  if(!Array.isArray(strokes)||!strokes.length||strokes.length>40)throw S.fail('Ask the customer to draw their signature.');
  let points=0,distance=0;
  for(const stroke of strokes){
    if(!Array.isArray(stroke)||stroke.length<2||stroke.length>500)throw S.fail('Please draw the signature again.');
    points+=stroke.length;
    for(let i=0;i<stroke.length;i++){
      const p=stroke[i];if(!Array.isArray(p)||p.length!==2||p.some(n=>typeof n!=='number'||!Number.isFinite(n)||n<0||n>1))throw S.fail('Invalid signature.');
      if(i)distance+=Math.hypot(p[0]-stroke[i-1][0],p[1]-stroke[i-1][1]);
    }
  }
  if(points<8||points>2000||distance<.15)throw S.fail('Ask the customer to draw a complete signature.');
  return {customer_name:name,signature:strokes,consent_text:CONSENT,consent_version:'residential-video-v1'};
}
async function run(db,req,input){
  const token=String(req.headers.authorization||'').match(/^Bearer (.+)$/i)?.[1];
  if(!token)throw S.fail('Sign in to view this assignment.',401);
  const auth=await db.auth.getUser(token);if(auth.error||!auth.data?.user)throw S.fail('Please sign in again.',401);
  const actor=auth.data.user.id;
  const profile=S.checked(await db.from('profiles').select('role,status').eq('id',actor).maybeSingle());
  if(profile?.status!=='active'||!['admin','contractor'].includes(profile.role))throw S.fail('Active contractor or admin access required.',403);
  if(!uuid(input.id))throw S.fail('Choose an assignment.');
  const job=S.checked(await db.from('assignment_blocks').select('id,claimed_by,assigned_to,metadata').eq('id',input.id).maybeSingle());
  if(!job||(profile.role!=='admin'&&(job.claimed_by||job.assigned_to)!==actor))throw S.fail('Assignment unavailable.',403);
  if(input.action==='get')return {customer_name:job.metadata?.customer_name||'',consent:S.checked(await db.from('assignment_video_consents').select('*').eq('assignment_id',job.id).maybeSingle()),consent_text:CONSENT};
  if(input.action!=='sign'||profile.role!=='contractor')throw S.fail('Only the assigned contractor can collect the customer signature.',403);
  const data=signature(input);
  const result=await db.rpc('record_residential_video_consent',{p_actor:actor,p_assignment:job.id,p_record:data});
  if(result.error)throw S.fail(result.error.code==='P0001'?result.error.message:'Unable to save the signed opt-out. Try again.',409);
  return {consent:result.data};
}
module.exports={CONSENT,signature,run};
