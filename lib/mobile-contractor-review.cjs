const {uuid}=require('./agent-referrals.cjs');
const ORIGIN='https://turnly-contractor-app-backend.rork.app';
const OVERRIDE_NOTE='[Portal onboarding override] ';
const REQUIREMENT_NOTE='[Portal requirement override] ';
function matchingRequirement(items,doc){
 const text=String((doc.document_type||'')+' '+(doc.title||'')+' '+(doc.file_name||'')).toLowerCase();
 const pairs=[[/w[ -]?9/,/w[ -]?9/i],[/insurance|\bcoi\b/,/insurance/i],[/direct.deposit/,/direct.deposit/i],[/bank.verification|voided.check/,/bank.verification/i],[/intake/,/intake/i],[/tax.information/,/tax.information/i],[/master.contractor|contractor.agreement/,/master.*agreement/i],[/background/,/background/i]];
 const matches=items.filter(i=>pairs.some(([a,b])=>a.test(text)&&b.test(i.title)));
 return matches.length===1?matches[0]:null;
}
function waived(item){return item.submission?.source==='admin'&&item.state==='done'&&[OVERRIDE_NOTE,REQUIREMENT_NOTE].some(p=>item.submission.reviewerNote?.startsWith(p));}
function previous(item){return item.submission?.source==='admin'?item.submission.reviewerNote?.match(/\[Previous submission: ([\w-]{1,120})\]/)?.[1]||null:null;}
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
function client(token,transport=fetch){
  if(!token)throw fail('Sign in to review mobile onboarding.',401);
  return async(path,body)=>{
    const response=await transport(`${ORIGIN}/onboarding/admin/${path}`,{
      method:body===undefined?'GET':'POST',redirect:'error',signal:AbortSignal.timeout(25000),
      headers:{'X-Supabase-Auth':token,'Content-Type':'application/json'},
      ...(body===undefined?{}:{body:JSON.stringify(body)})
    }).catch(()=>{throw fail('The mobile onboarding service is unavailable. Refresh to check the latest state before retrying.',503);});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||data.ok===false)throw fail(data.error||'The mobile onboarding service could not complete this request.',response.status===401||response.status===403?403:503);
    return data;
  };
}
function safeFile(file){
  return {complete:!!file.complete,items:(file.items||[]).map(i=>({
    id:i.id,title:i.title,kind:i.kind,required:!!i.required,state:i.state,waived:waived(i),previousSubmissionId:previous(i),portalDocumentId:i.submission?.source==='admin'?i.submission.reviewerNote?.match(/\[Portal approved document: ([0-9a-f-]{36})\]/i)?.[1]||null:null,
    submission:i.submission?{id:i.submission.id,status:i.submission.status,hasFile:!!i.submission.hasFile,fileName:i.submission.fileName,createdAt:i.submission.createdAt,reviewedAt:i.submission.reviewedAt,reviewerNote:i.submission.reviewerNote,expirationDate:i.submission.expirationDate,source:i.submission.source}:null
  }))};
}
async function file(call,id){if(!uuid(id))throw fail('Choose a contractor.');return safeFile(await call(`contractors/${id}`));}
async function review(call,profileId,input){
  const current=await file(call,profileId);
  const item=current.items.find(i=>i.submission?.id===input.submission_id||(input.action==='mobile_file'&&i.previousSubmissionId===input.submission_id));
  if(!item)throw fail('This submission changed. Refresh and review the latest upload.',409);
  if(input.action==='mobile_file'){
    const result=await call(`submissions/${input.submission_id}/link`,{});
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
    ?i.waived
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
async function requirement(call,profileId,input,beforeRestore=async()=>{}){
  const current=await file(call,profileId),item=current.items.find(i=>i.id===input.item_id);
  if(!item||!item.required)throw fail('Choose a required onboarding item.',400);
  if(typeof input.required!=='boolean')throw fail('Choose whether this requirement is enabled.');
  if((item.submission?.id||null)!==input.expected_submission_id)throw fail('This requirement changed. Refresh the contractor before changing it.',409);
  if(input.required===!item.waived)return {ok:true,unchanged:true};
  const prior=item.previousSubmissionId||(item.submission?.hasFile?item.submission.id:null);
  const ref=prior?` [Previous submission: ${prior}]`:'';
  const reason=String(input.reason|| (input.required?'Requirement restored by administrator.':'Requirement waived for this contractor by administrator.')).trim().slice(0,140);
  if(input.required)await beforeRestore();
  await call(`contractors/${profileId}/items/${item.id}/${input.required?'reset':'mark'}`,{note:(input.required?'[Portal requirement restored] ':REQUIREMENT_NOTE)+reason+ref});
  const updated=await file(call,profileId),changed=updated.items.find(i=>i.id===item.id);
  if(!changed||changed.waived===input.required)throw fail('The requirement could not be confirmed. Refresh before retrying.',503);
  return {ok:true,complete:updated.complete};
}
async function approvePortalUpload(call,profileId,doc,itemId,reason){
  const current=await file(call,profileId),item=current.items.find(i=>i.id===itemId);
  if(!item)throw fail('Choose the matching onboarding requirement.',409);
  if(item.state==='done'&&!item.waived)return {ok:true,complete:current.complete};
  const prior=item.previousSubmissionId||(item.submission?.hasFile?item.submission.id:null);
  await call(`contractors/${profileId}/items/${item.id}/mark`,{
    note:`[Portal approved document: ${doc.id}] Approved uploaded document. ${String(reason||'').slice(0,100)}${prior?` [Previous submission: ${prior}]`:''}`,
    ...(doc.expiration_date?{expirationDate:doc.expiration_date}:{})
  });
  const updated=await file(call,profileId),changed=updated.items.find(i=>i.id===item.id);
  if(changed?.state!=='done'||changed.waived)throw fail('Document approved, but checklist sync needs a retry. Refresh and approve the document again.',503);
  return {ok:true,complete:updated.complete};
}
module.exports={client,file,review,override,requirement,approvePortalUpload,matchingRequirement,waived,ORIGIN,OVERRIDE_NOTE,REQUIREMENT_NOTE};
