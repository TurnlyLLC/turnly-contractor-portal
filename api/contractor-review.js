const {createClient} = require('@supabase/supabase-js');
const {uuid} = require('../lib/agent-referrals.cjs');

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
async function run(db,actor,input) {
  if(input.action==='list'){
    const [documents,profiles]=await Promise.all([
      allRows(db,'contractor_documents','*','id'),
      allRows(db,'profiles','id,role,status,contractor_approved,onboarding_override,onboarding_override_reason,onboarding_override_at,onboarding_override_by','id')
    ]);
    return {documents,profiles:profiles.filter(p=>p.role==='contractor')};
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
  let result;
  if(input.action==='review_document'){
    if(!['approved','rejected'].includes(input.status)) throw fail('Choose an approval decision.');
    if(!input.updated_at||!Number.isFinite(Date.parse(input.updated_at))) throw fail('Refresh this document before reviewing it.');
    result=await db.rpc('review_contractor_document',{p_actor:actor,p_document:input.id,p_status:input.status,p_reason:reason,p_expected_updated_at:input.updated_at});
  } else if(['approve','override','remove_override'].includes(input.action)) {
    if(['override','remove_override'].includes(input.action)&&reason.length<5) throw fail('Enter a reason for this override decision.');
    result=await db.rpc('review_contractor_account',{p_actor:actor,p_profile:input.id,p_action:input.action,p_reason:reason});
  } else throw fail('Unknown review action.');
  if(result.error) {
    if(result.error.code==='P0001') throw fail(result.error.message,409);
    throw fail('The review could not be saved. Refresh and try again.',503);
  }
  return result.data;
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
    return json(res,200,await run(db,actor,input));
  }catch(error){return json(res,error.status||500,{error:error.status?error.message:'Unable to process this review. Please try again.'});}
}
module.exports=handler;
module.exports.access=access;
module.exports.run=run;
