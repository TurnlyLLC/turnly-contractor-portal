const {createClient} = require('@supabase/supabase-js');
const {uuid} = require('../lib/agent-referrals.cjs');
const mobile = require('../lib/mobile-contractor-review.cjs');
const background = require('../lib/contractor-background.cjs');
const training = require('../lib/contractor-training.cjs');

const fail = (message,status=400) => Object.assign(new Error(message),{status});
function checked(result) {
  if(result.error) throw fail('Unable to load contractor reviews. Please refresh and try again.',503);
  return result.data;
}
function json(res,status,data) {
  res.statusCode=status;
  res.setHeader('Content-Type','application/json');
  res.setHeader('Cache-Control','no-store');
  res.end(JSON.stringify(data));
}
async function access(db,req) {
  const token=String(req.headers.authorization||'').match(/^Bearer (.+)$/i)?.[1];
  if(!token) throw fail('Sign in to the admin portal.',401);
  const auth=await db.auth.getUser(token);
  if(auth.error||!auth.data?.user) throw fail('Your session expired. Sign in again.',401);
  const profile=checked(await db.from('profiles').select('id,role,status').eq('id',auth.data.user.id).maybeSingle());
  if(profile?.role!=='admin'||profile.status!=='active') throw fail('Active admin access is required.',403);
  return profile.id;
}
async function allRows(db,table,select,order) {
  const rows=[];
  for(let start=0;;start+=500){
    const page=checked(await db.from(table).select(select).order(order).range(start,start+499));
    rows.push(...page);
    if(page.length<500) return rows;
  }
}
async function run(db,actor,input,token,transport) {
  if(input.action==='list'){
    const [documents,profiles]=await Promise.all([
      allRows(db,'contractor_documents','*','id'),
      allRows(db,'profiles','id,full_name,email,role,status,contractor_approved,onboarding_override,onboarding_override_reason,onboarding_override_at,onboarding_override_by','id')
    ]);
    const contractors=profiles.filter(p=>p.role==='contractor');
    let remote=[],mobile_error='';
    try{remote=(await mobile.client(token,transport)('contractors',{profiles:contractors.map(p=>({id:p.id,full_name:p.full_name,email:p.email,status:p.status}))})).contractors||[];}
    catch(error){mobile_error=error.message;}
    try {const progress=await training.rows(db);remote=remote.map(p=>{const items=training.items(progress,p.userId);return {...p,complete:p.complete&&items.every(i=>i.state==='done'),doneCount:(p.doneCount||0)+items.filter(i=>i.state==='done').length,requiredCount:(p.requiredCount||0)+items.length};});}catch(error){mobile_error=error.message;remote=[];}
    const deletion_reviews=await allRows(db,'contractor_deletion_reviews','*','profile_id');
    return {documents,profiles:contractors,mobile:remote,mobile_error,deletion_reviews};
  }
  if(input.action==='document_file'){
    if(!uuid(input.id)) throw fail('Choose a document.');
    const doc=checked(await db.from('contractor_documents').select('storage_bucket,storage_path').eq('id',input.id).maybeSingle());
    if(!doc?.storage_path||doc.storage_bucket!=='contractor-documents') throw fail('This record does not have an onboarding file.');
    const result=await db.storage.from(doc.storage_bucket).createSignedUrl(doc.storage_path,120);
    return {url:checked(result).signedUrl};
  }
  if(!uuid(input.id)) throw fail('Choose a contractor or document.');
  const reason=String(input.reason||'').trim();
  if(reason.length>1000) throw fail('Keep the review note under 1,000 characters.');
  if(['override','remove_override'].includes(input.action)&&reason.length<5)throw fail('Enter a reason for this override decision.');
  if(['background_save','mobile_requirement','mobile_account','mobile_file','mobile_review','approve','override','remove_override','approve_deletion','decline_deletion'].includes(input.action)){
    const profile=checked(await db.from('profiles').select('id,role,status').eq('id',input.id).maybeSingle());
    if(profile?.role!=='contractor')throw fail('Contractor account not found.',404);
    const call=mobile.client(token,transport);
    if(input.action==='background_save')return background.save(db,actor,input.id,input,call);
    if(input.action==='mobile_requirement'){
      const tracked=await background.get(db,input.id);if(tracked?.item_id===input.item_id)throw fail('Use the background-check review controls for this tracked requirement.',409);
      if(['deleted','deletion_pending','disabled','suspended','inactive','deactivated','rejected'].includes(profile.status))throw fail('Requirements cannot be changed on this inactive account.',409);
      if(String(input.item_id).startsWith('academy-'))return training.requirement(db,actor,input.id,input);
      return mobile.requirement(call,input.id,input,async()=>{
        const pause=await db.rpc('review_contractor_account',{p_actor:actor,p_profile:input.id,p_action:'remove_override',p_reason:'Onboarding requirement restored: '+String(input.item_id).slice(0,120)});
        if(pause.error)throw fail('Unable to pause job access. The requirement was not changed.',503);
      });
    }
    if(input.action==='mobile_account')return training.withTraining(db,input.id,await background.attach(db,input.id,await mobile.file(call,input.id),true));
    if(input.action==='mobile_review'){const file=await mobile.file(call,input.id);if(file.items.some(i=>background.isBackground(i)&&i.submission?.id===input.submission_id))throw fail('Use Background check → Review and approve to record this decision.',409);}
    if(input.action==='mobile_file'||input.action==='mobile_review')return await mobile.review(call,input.id,input);
    if(['approve','override'].includes(input.action))await background.assertApproved(db,input.id);
    if(input.action==='approve'&&!(await training.withTraining(db,input.id,await mobile.file(call,input.id))).complete)throw fail('Review all required onboarding items first, or grant an established-employee override.',409);
    if(['override','remove_override'].includes(input.action)){
      if(reason.length<5)throw fail('Enter a reason for this override decision.');
      if(['deleted','deletion_pending','disabled','suspended'].includes(profile.status))throw fail('This account cannot receive an override.',409);
      // Revoke portal access first when removing a waiver. If the mobile service
      // fails, a retry finishes the remaining resets without reopening jobs.
      if(input.action==='remove_override')checked(await db.rpc('review_contractor_account',{p_actor:actor,p_profile:input.id,p_action:input.action,p_reason:reason}));
      await mobile.override(call,input.id,reason,input.action==='remove_override');
      const modules=training.items(await training.rows(db,input.id),input.id);
      for(const item of modules){if(input.action==='remove_override'?item.waived:item.state!=='done')await training.requirement(db,actor,input.id,{item_id:item.id,required:input.action==='remove_override',expected_revision:item.revision});}
      if(input.action==='remove_override')return {ok:true};
    }
    if(['approve_deletion','decline_deletion'].includes(input.action))return await deletion(db,actor,input,call);
  }
  let result,portalSync;
  if(input.action==='review_document'){
    const doc=checked(await db.from('contractor_documents').select('*').eq('id',input.id).maybeSingle());
    if(doc?.storage_path?.includes('/onboarding/'))throw fail('Review this upload in the mobile onboarding checklist so the app receives the decision.',409);
    if(!['approved','rejected'].includes(input.status)) throw fail('Choose an approval decision.');
    if(!input.updated_at||!Number.isFinite(Date.parse(input.updated_at))) throw fail('Refresh this document before reviewing it.');
    if(((input.item_id||input.auto_match)&&input.status==='approved')||input.status==='rejected'){
      if(!doc?.storage_path)throw fail('Upload a document before approving this requirement.');
      const ownerId=doc.profile_id||doc.contractor_id;
      let owner;
      if(ownerId)owner=checked(await db.from('profiles').select('id,role').eq('id',ownerId).maybeSingle());
      else if(doc.contractor_email)owner=checked(await db.from('profiles').select('id,role').eq('email',doc.contractor_email).maybeSingle());
      if(owner?.role!=='contractor'&&input.status==='approved'&&input.item_id)throw fail('Link this upload to a contractor account before completing a requirement.',409);
      if(owner?.role==='contractor'){
        const call=mobile.client(token,transport),current=await mobile.file(call,owner.id);
        if(input.status==='approved'){
          const itemId=input.item_id||(input.auto_match?mobile.matchingRequirement(current.items,doc)?.id:null);
          if(input.item_id&&!current.items.some(i=>i.id===itemId))throw fail('Choose a current onboarding requirement.',409);
          if(itemId&&current.items.some(i=>i.id===itemId&&background.isBackground(i)))throw fail('Use the background-check controls to approve screening. File approval alone does not approve a background check.',409);
          if(itemId)portalSync=()=>mobile.approvePortalUpload(call,owner.id,doc,itemId,reason);
        }else{
          const linked=current.items.filter(i=>i.portalDocumentId===doc.id);
          if(linked.length){
            checked(await db.rpc('review_contractor_account',{p_actor:actor,p_profile:owner.id,p_action:'remove_override',p_reason:'Correction requested for an approved onboarding upload.'}));
            portalSync=async()=>{for(const item of linked)await call(`contractors/${owner.id}/items/${item.id}/reset`,{note:`[Portal approved document: ${doc.id}] Correction required: ${reason.slice(0,150)}`});};
          }
        }
      }
    }
    result=await db.rpc('review_contractor_document',{p_actor:actor,p_document:input.id,p_status:input.status,p_reason:reason,p_expected_updated_at:input.updated_at});
  } else if(['approve','override','remove_override'].includes(input.action)) {
    if(['override','remove_override'].includes(input.action)&&reason.length<5) throw fail('Enter a reason for this override decision.');
    result=await db.rpc('review_contractor_account',{p_actor:actor,p_profile:input.id,p_action:input.action,p_reason:reason});
  } else throw fail('Unknown review action.');
  if(result.error) {
    if(result.error.code==='P0001') throw fail(result.error.message,409);
    throw fail('The review could not be saved. Refresh and try again.',503);
  }
  if(portalSync)await portalSync();
  return result.data;
}
async function deletion(db,actor,input,call){
  const rows=(await call('contractors',{profiles:[]})).contractors||[];
  const request=rows.find(p=>p.userId===input.id);
  if(!request?.deletionRequested||request.deletionRequested!==input.requested_at)throw fail('The mobile deletion request changed. Refresh before reviewing it.',409);
  const note=String(input.reason||'').trim();
  if(note.length<5||note.length>1000)throw fail('Enter a review note between 5 and 1,000 characters.');
  if(input.action==='approve_deletion'&&input.confirm!==true)throw fail('Confirm this account deletion before approving it.');
  const review=async action=>{
    const r=await db.rpc('review_contractor_deletion',{p_actor:actor,p_profile:input.id,p_requested_at:request.deletionRequested,p_action:action,p_note:note});
    if(r.error)throw fail(r.error.code==='P0001'?r.error.message:'Unable to record the deletion decision. Retry from the request.',409);
    return r.data;
  };
  if(input.action==='decline_deletion')return review('decline');
  const start=await review('begin');if(start.status==='approved')return start;
  const existing=await db.auth.admin.getUserById(input.id);
  if(existing.error&&existing.error.status!==404)throw fail('Job access is paused, but account deletion could not be checked. Retry approval.',503);
  if(existing.data?.user&&!existing.data.user.deleted_at){
    // Supabase soft deletion removes login credentials without cascading through
    // the retained profile, assignment, document, or payment records.
    const result=await db.auth.admin.deleteUser(input.id,true);
    if(result.error)throw fail('Job access is paused, but account deletion did not finish. Retry approval.',503);
  }
  return review('complete');
}
async function handler(req,res) {
  if(req.method!=='POST'){res.setHeader('Allow','POST');return json(res,405,{error:'Use POST.'});}
  try{
    const key=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SERVICE_KEY||process.env.SUPABASE_SERVICE_ROLE||process.env.SUPABASE_SECRET_KEY;
    if(!key) throw fail('Contractor review is not configured.',503);
    const db=createClient(process.env.SUPABASE_URL||'https://nwnzdoveskthebfyndcs.supabase.co',key,{auth:{persistSession:false,autoRefreshToken:false}});
    const actor=await access(db,req);
    let raw=req.body||'';
    if(!raw) for await(const chunk of req){raw+=chunk.toString();if(raw.length>6000)throw fail('Request is too large.');}
    if(typeof raw==='string'&&raw.length>6000)throw fail('Request is too large.');
    const input=typeof raw==='object'?raw:JSON.parse(raw||'{}');
    const token=String(req.headers.authorization||'').match(/^Bearer (.+)$/i)?.[1];
    return json(res,200,await run(db,actor,input,token));
  }catch(error){return json(res,error.status||500,{error:error.status?error.message:'Unable to process this review. Please try again.'});}
}
module.exports=handler;
module.exports.access=access;
module.exports.run=run;
module.exports.deletion=deletion;
