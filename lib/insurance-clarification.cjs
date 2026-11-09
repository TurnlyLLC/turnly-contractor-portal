const {createHash}=require('node:crypto');
const mobile=require('./mobile-contractor-review.cjs');
const COI='item_3f09e5a2fdb441ba9283';
const targets={
 'e65a4e8d-d209-436f-bcb3-9c82cd016a97':{name:'Donna',submission:'sub_88e8902cbb8945b590e1',status:'approved',
  note:'Approved: your updated COI meets the $1M occurrence/$2M general aggregate/$2M products-completed operations limits and lists Turnly LLC as certificate holder. Sorry, the earlier endorsement request was sent in error. No additional endorsements are needed. This approval applies to the COI only.',
  detail:'Thank you for uploading your updated certificate. It now shows $1,000,000 per occurrence, $2,000,000 general aggregate and $2,000,000 products/completed operations aggregate, and already lists Turnly LLC as certificate holder. We have approved your updated COI and cleared the insurance correction request. No further insurance documents or endorsements are needed for this review. This approves your insurance document only; any other onboarding requirements still apply.'},
 'd1879964-a8ca-4c38-9490-cfe95f51d67e':{name:'Jezabel',submission:'sub_23cc86981c934134ab93',status:'approved',
  note:'Approved: GL limits meet Turnly requirements and Turnly LLC is listed as certificate holder. Our earlier correction email was sent in error; sorry for the confusion. No additional-insured or primary/noncontributory endorsements are required. This approval applies to the COI only.',
  detail:'Your submitted COI already meets the coverage limits and lists Turnly LLC as certificate holder. We have approved your COI and cleared the insurance correction request. You do not need to buy additional coverage or upload endorsements for this review. This approves your insurance document only; any other onboarding requirements still apply.'},
 '17540504-00cb-4255-869d-c1ab959004ff':{name:'Maury',submission:'sub_65278a951ff04c6b8b6c',status:'rejected',
  note:'Sorry, our earlier email was sent in error. Your GL limits meet the requirements. Please upload a COI listing Turnly LLC as certificate holder. No additional-insured or primary/noncontributory endorsements are required. This replaces our previous correction instructions.',
  detail:'Your general liability limits already meet our minimums. Please ask your insurance agent to issue an updated COI listing Turnly LLC as certificate holder and upload it to your portal. You do not need higher limits or additional-insured or primary/noncontributory endorsements. Your insurance document remains marked Correction needed until the updated certificate is submitted and reviewed.'}
};
function message(target){
 const text=`Hi ${target.name},\n\nWe apologize for the previous insurance correction email. It was sent in error and included requirements Turnly is not asking you to meet. Please disregard the earlier request for additional-insured and primary/noncontributory endorsements. These updated instructions replace that email.\n\n${target.detail}\n\nTurnly requires a current general liability certificate showing:\n- At least $1,000,000 per occurrence\n- At least $2,000,000 general aggregate\n- At least $2,000,000 products/completed operations aggregate\n- Turnly LLC listed as certificate holder\n\nCertificate-holder details: Turnly LLC, 144 E King St, STE 303, Hillsborough, NC 27278.\n\nNo additional-insured, primary/noncontributory, workers' compensation, or vehicle-insurance documentation is required for Turnly onboarding.\n\nOpen your contractor portal: https://portal.turnlypros.com/contractor-onboarding.html\n\nAgain, we apologize for the confusion and unnecessary inconvenience. If you have questions, reply to this email.\n\nThank you,\nTurnly\nadmin@turnlypros.com`;
 return {subject:'Correction and apology: your Turnly insurance requirements',text,html:'<div style="font-family:Arial,sans-serif;color:#073b60;max-width:640px;margin:auto"><h1>Turnly</h1>'+text.split('\n\n').map(p=>'<p>'+p.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])).replace(/\n/g,'<br>')+'</p>').join('')+'</div>'};
}
const fail=message=>Object.assign(new Error(message),{status:409});
function checked(r){if(r.error)throw fail('Unable to verify the contractor or email audit record.');return r.data;}
async function apply(db,actor,id,token,transport=fetch,env=process.env){
 const target=targets[id];if(!target)throw fail('Choose one of the three reviewed insurance submissions.');
 const profile=checked(await db.from('profiles').select('id,email,full_name,role,status').eq('id',id).maybeSingle());
 if(!profile||profile.role!=='contractor'||['deleted','disabled','deletion_pending'].includes(profile.status)||!profile.email)throw fail('A current contractor email is required.');
 const call=mobile.client(token,transport);
 const verify=async()=>{const f=await mobile.file(call,id);const i=f.items.find(i=>i.id===COI);if(!i||i.submission?.id!==target.submission||!i.submission.hasFile||i.state==='expired')throw fail('The reviewed COI changed or expired. Review the current upload before continuing.');return i;};
 let item=await verify();
 if(item.submission.status!==target.status||item.submission.reviewerNote!==target.note){
  await mobile.review(call,id,{action:'mobile_review',submission_id:target.submission,status:target.status,reason:target.note});
  item=await verify();
 }
 if(item.submission.status!==target.status||item.submission.reviewerNote!==target.note)throw fail('The updated insurance decision could not be verified. No email was sent.');
 const key=createHash('sha256').update('insurance-clarification-20261109-r3:'+id+':'+target.submission).digest('hex');
 const existing=checked(await db.from('admin_audit_log').select('id').eq('action','insurance_clarification_sent').eq('entity_id',key).limit(1));
 if(existing.length)return {name:target.name,status:target.status,sent:true,already_sent:true,recipient:profile.email};
 if(!env.RESEND_API_KEY||!env.REFERRAL_FROM_EMAIL)throw fail('Insurance review saved, but email service is not configured.');
 const r=await transport('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY.trim(),'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify({from:env.REFERRAL_FROM_EMAIL.trim(),to:[profile.email],reply_to:'admin@turnlypros.com',...message(target)}),signal:AbortSignal.timeout(15000)});
 const receipt=await r.json();if(!r.ok||!receipt.id)throw fail('Insurance review saved, but the email service did not confirm sending. Retry this notice.');
 const audit=await db.from('admin_audit_log').insert({actor_id:actor,action:'insurance_clarification_sent',entity:'contractor_insurance',entity_id:key,source:'contractor_directory',after_value:JSON.stringify({profile_id:id,submission_id:target.submission,status:target.status,note:target.note,recipient:profile.email,provider_id:receipt.id,agreement_revision:'20261109 R3'})});
 return {name:target.name,status:target.status,sent:true,recipient:profile.email,...(audit.error?{warning:'Email sent; audit recording failed. Do not resend.'}:{})};
}
module.exports={apply,targets,message};
