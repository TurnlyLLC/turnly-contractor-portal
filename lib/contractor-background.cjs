const mobile=require('./mobile-contractor-review.cjs');
const labels={needs_invitation:'Needs invitation',invited:'Invitation sent',in_progress:'Screening in progress',awaiting_review:'Awaiting Turnly review',approved:'Approved by Turnly',on_hold:'Contact Turnly'};
const fail=(m,s=409)=>Object.assign(new Error(m),{status:s});
const isBackground=i=>i.kind==='background'||/background\s*(check|screen)/i.test(i.title||'');
async function get(db,id){const r=await db.from('contractor_background_checks').select('*').eq('profile_id',id).maybeSingle();if(r.error)throw fail('Background-check status is unavailable. Please retry.',503);return r.data;}
function merge(file,row,admin=false){
 const items=(file.items||[]).map(i=>{if(!isBackground(i))return i;const b=row||{status:i.state==='done'?'existing_complete':'needs_invitation',version:0};return {...i,...(row?{state:row.status==='approved'&&row.sync_state==='synced'&&i.state==='done'?'done':row.status==='needs_invitation'?'todo':'in_review',waived:false}:{}),background:admin?b:{status:b.status,contractor_note:b.contractor_note||'',sync_state:b.sync_state,approved_at:b.approved_at},description:'Turnly sends a Verified First invitation by email. Complete its secure consent and applicant-paid screening steps. Turnly must review and approve your check before you can accept jobs.'};});
 const required=items.filter(i=>i.required);return {...file,items,requiredCount:required.length,doneCount:required.filter(i=>i.state==='done').length,complete:file.complete!==false&&required.every(i=>i.state==='done')&&(!row||row.status==='approved'&&row.sync_state==='synced')};
}
async function attach(db,id,file,admin=false){if(!(file.items||[]).some(isBackground))return file;return merge(file,await get(db,id),admin);}
async function save(db,actor,id,input,call){
 const file=await mobile.file(call,id),item=file.items.find(i=>i.id===input.item_id&&isBackground(i));if(!item||!item.required)throw fail('The existing required background-check item could not be found.');
 if(!Object.hasOwn(labels,input.status)||!Number.isInteger(input.version)||input.version<0)throw fail('Choose a valid background-check status.');
 const reference=String(input.reference||'').trim(),note=String(input.contractor_note||'').trim();if(reference.length>120||note.length>180)throw fail('Keep the reference under 120 characters and contractor message under 180.');
 if(input.status==='approved'&&(input.confirm!==true||!reference))throw fail('Enter the report reference and confirm that you reviewed the report.');
 const start=await db.rpc('begin_contractor_background_review',{p_actor:actor,p_profile:id,p_item:item.id,p_status:input.status,p_reference:reference,p_note:note,p_version:input.version,p_confirm:input.confirm===true});if(start.error)throw fail(start.error.code==='P0001'?start.error.message:'Unable to record this review.');const row=start.data;
 const marker=`[Background review ${row.operation_id}]`,prior=item.previousSubmissionId||(item.submission?.hasFile?item.submission.id:null);
 const message=`${marker} ${labels[input.status]}. ${note}${prior?` [Previous submission: ${prior}]`:''}`.slice(0,300);
 try{
  await call(`contractors/${id}/items/${item.id}/${input.status==='approved'?'mark':'reset'}`,{note:message});
  const updated=await mobile.file(call,id),saved=updated.items.find(i=>i.id===item.id);
  if(!saved||(input.status==='approved'?(saved.state!=='done'||!saved.submission?.reviewerNote?.includes(marker)):saved.state==='done'))throw fail('The app checklist did not confirm the change.');
  const end=await db.rpc('finish_contractor_background_review',{p_profile:id,p_operation:row.operation_id});if(end.error)throw fail('The review could not be finalized.');
 }catch{throw fail('Your review was recorded, but app checklist synchronization needs a retry. Job access remains paused. Refresh in two minutes and save again.',503);}
 return {ok:true};
}
async function assertApproved(db,id){const row=await get(db,id);if(row&&(row.status!=='approved'||row.sync_state!=='synced'))throw fail('Review and approve the background check before enabling job access.');}
module.exports={labels,isBackground,get,merge,attach,save,assertApproved};
