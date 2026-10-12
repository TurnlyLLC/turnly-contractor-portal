const {uuid}=require('./agent-referrals.cjs');
const ORIGIN='https://turnly-contractor-app-backend.rork.app';
const OVERRIDE_NOTE='[Portal onboarding override] ';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
function client(token,transport=fetch){
  if(!token)throw fail('Sign in to review mobile onboarding.',401);
  return async(path,body)=>{
    const response=await transport(`${ORIGIN}/onboarding/admin/${path}`,{
      method:body===undefined?'GET':'POST',redirect:'error',signal:AbortSignal.timeout(25000),
      headers:{'X-Supabase-Auth':token,'Content-Type':'application/json'},
      ...(body===undefined?{}:{body:JSON.stringify(body)})
    }).catch(()=>{throw fail('The mobile onboarding service is unavailable. No approval was recorded; refresh and retry.',503);});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||data.ok===false)throw fail(data.error||'The mobile onboarding service could not complete this request.',response.status===401||response.status===403?403:503);
    return data;
  };
}
function safeFile(file){
  return {complete:!!file.complete,items:(file.items||[]).map(i=>({
    id:i.id,title:i.title,kind:i.kind,required:!!i.required,state:i.state,
    submission:i.submission?{id:i.submission.id,status:i.submission.status,hasFile:!!i.submission.hasFile,fileName:i.submission.fileName,createdAt:i.submission.createdAt,reviewedAt:i.submission.reviewedAt,reviewerNote:i.submission.reviewerNote,expirationDate:i.submission.expirationDate,source:i.submission.source}:null
  }))};
}
async function file(call,id){if(!uuid(id))throw fail('Choose a contractor.');return safeFile(await call(`contractors/${id}`));}
async function review(call,profileId,input){
  const current=await file(call,profileId);
  const item=current.items.find(i=>i.submission?.id===input.submission_id);
  if(!item)throw fail('This submission changed. Refresh and review the latest upload.',409);
  if(input.action==='mobile_file'){
    const result=await call(`submissions/${item.submission.id}/link`,{});
    const url=new URL(result.url);
    if(url.origin!==ORIGIN||!url.pathname.startsWith('/onboarding/f/'))throw fail('Invalid document link.',503);
    return {url:url.href};
  }
  if(!['approved','rejected'].includes(input.status))throw fail('Choose a review decision.');
  const note=String(input.reason||'').trim();
  if(note.length>300)throw fail('Keep the mobile review note under 300 characters.');
  if(input.status==='rejected'&&note.length<5)throw fail('Explain what the contractor needs to correct.');
  if(input.status==='approved'&&item.state==='expired')throw fail('Request an updated document before approving this expired upload.');
  await call(`submissions/${item.submission.id}/review`,{decision:input.status,note});
  return {ok:true};
}
async function override(call,profileId,reason,remove=false){
  let current=await file(call,profileId);
  const selected=current.items.filter(i=>remove
    ?i.submission?.source==='admin'&&i.submission?.reviewerNote?.startsWith(OVERRIDE_NOTE)
    :i.required&&i.state!=='done');
  for(const item of selected){
    await call(`contractors/${profileId}/items/${item.id}/${remove?'reset':'mark'}`,{
      note:remove?`Portal override removed: ${reason}`.slice(0,300):(OVERRIDE_NOTE+reason).slice(0,300)
    });
  }
  current=await file(call,profileId);
  if(!remove&&!current.complete)throw fail('Some requirements still need attention. Refresh and retry the override.',409);
  return current;
}
module.exports={client,file,review,override,ORIGIN,OVERRIDE_NOTE};
