const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=value=>value?new Date(value).toLocaleDateString():'Not recorded';
const label=value=>String(value||'uploaded').replace(/_/g,' ').replace(/^./,c=>c.toUpperCase());
const pendingDoc=d=>!['approved','rejected','expired','archived'].includes(d.status);

export function createContractorReview({supabase,getPeople,onSaved}) {
  const state={documents:[],profiles:[],mobile:[],mobileError:'',deletionReviews:[],tab:'signups',error:'',loading:true,person:null,busy:false};
  let dialog,previousFocus;
  async function api(input){
    const session=await supabase.auth.getSession();
    const token=session.data?.session?.access_token;
    if(!token)throw new Error('Sign in to the admin portal again.');
    const response=await fetch('/api/contractor-review',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(input)});
    const result=await response.json();if(!response.ok)throw new Error(result.error||'Unable to save this review.');return result;
  }
  function documents(person){return state.documents.filter(d=>d.profile_id===person.profileId||d.contractor_id===person.profileId||d.contractor_key===person.key||(!d.profile_id&&!d.contractor_id&&d.contractor_email?.toLowerCase()===person.email.toLowerCase()));}
  function profile(person){return state.profiles.find(p=>p.id===person.profileId)||person.raw;}
  function people(){return getPeople().filter(p=>p.team==='contractor');}
  function signupQueue(){return people().filter(p=>p.status==='pending_approval');}
  function decision(p){return state.deletionReviews.find(d=>d.profile_id===p.userId&&Date.parse(d.requested_at)===Date.parse(p.deletionRequested));}
  function deletions(){return state.mobile.filter(p=>p.deletionRequested&&!['approved','declined'].includes(decision(p)?.status));}
  function documentOwner(doc){return people().find(p=>documents(p).some(d=>d.id===doc.id));}
  function markup(){return `<section class="cr-center" aria-labelledby="crHeading"><div class="cr-heading"><div><span class="cr-eyebrow">CONTRACTOR ACCOUNTS</span><h2 id="crHeading">Review center</h2><p>Manage signup approvals, review uploads, and approve established staff for work.</p></div><button type="button" class="secondary-action" data-cr-refresh>Refresh reviews</button></div><div class="cr-tabs" role="group" aria-label="Review queues"></div><div class="cr-queue" aria-live="polite"></div></section>`;}
  function render(){
    const root=document.querySelector('.cr-center');if(!root)return;
    root.querySelector('.cr-tabs').innerHTML=[['signups','Pending signups',signupQueue().length],['documents','Onboarding reviews',state.mobileError?'!':state.mobile.filter(p=>!p.complete).length+state.documents.filter(pendingDoc).length],['overrides','Staff overrides',state.profiles.filter(p=>p.onboarding_override).length],['deletions','Deletion requests',state.mobileError?'!':deletions().length]].map(([key,text,count])=>`<button type="button" data-cr-tab="${key}" aria-pressed="${state.tab===key}">${text}<span>${count}</span></button>`).join('');
    const queue=root.querySelector('.cr-queue');
    if(state.loading){queue.innerHTML='<p>Loading reviews…</p>';return;}
    if(state.error){queue.innerHTML=`<p role="alert" class="cr-error">${esc(state.error)}</p>`;return;}
    if(state.tab==='deletions'){
      const rows=deletions();
      queue.innerHTML=rows.length?rows.map(p=>`<article class="cr-queue-row"><div><strong>${esc(p.name||p.email||'Contractor')}</strong><small>Requested ${esc(date(p.deletionRequested))}${decision(p)?.status==='processing'?' · Needs retry to finish deletion':''}</small></div><button class="secondary-action" data-cr-deletion="${esc(p.userId)}">Review deletion</button></article>`).join(''):'<div class="cr-empty">No account deletions are waiting for review.</div>';
      const history=state.deletionReviews.filter(d=>d.status!=='processing');
      if(history.length)queue.innerHTML+=`<details><summary>Previous decisions (${history.length})</summary>${history.map(d=>`<p>${esc(state.profiles.find(p=>p.id===d.profile_id)?.full_name||'Contractor')} · ${esc(label(d.status))} · ${esc(date(d.reviewed_at))}</p>`).join('')}</details>`;
    }else if(state.tab==='documents'){
      const docs=state.documents.filter(pendingDoc);
      queue.innerHTML=docs.length?docs.map(d=>{const owner=documentOwner(d);return `<article class="cr-queue-row"><div><strong>${esc(d.title||d.file_name||label(d.document_type))}</strong><small>${esc(owner?.name||d.contractor_name||d.contractor_email||'Unlinked upload')} · ${esc(label(d.document_type))} · Uploaded ${esc(date(d.uploaded_at))}</small></div><button class="secondary-action" data-cr-document="${esc(d.id)}">Review document</button></article>`;}).join(''):'<div class="cr-empty">No documents are waiting for review.</div>';
      const mobileRows=state.mobile.filter(p=>!p.complete);
      if(mobileRows.length)queue.innerHTML=mobileRows.map(p=>`<article class="cr-queue-row"><div><strong>${esc(p.name||p.email||'Contractor')}</strong><small>${p.doneCount} of ${p.requiredCount} requirements complete · ${p.needsReview} awaiting review</small></div><button class="secondary-action" data-cr-mobile="${esc(p.userId)}">Review onboarding</button></article>`).join('')+(docs.length?queue.innerHTML:'');
    }else{
      const rows=state.tab==='signups'?signupQueue():people().filter(p=>profile(p).onboarding_override);
      queue.innerHTML=rows.length?rows.map(p=>`<article class="cr-queue-row"><div><strong>${esc(p.name)}</strong><small>${esc(p.email)} · ${state.tab==='signups'?`${documents(p).filter(d=>d.status==='approved').length} documents approved`:esc(profile(p).onboarding_override_reason)}</small></div><button class="secondary-action" data-cr-person="${esc(p.key)}">Review account</button></article>`).join(''):`<div class="cr-empty">${state.tab==='signups'?'No signups are waiting for approval.':'No established-staff overrides have been granted.'}</div>`;
    }
    if(state.mobileError)queue.insertAdjacentHTML('afterbegin',`<p class="cr-error" role="alert">Mobile requests could not load: ${esc(state.mobileError)} Refresh reviews to retry.</p>`);
  }
  async function load(){state.loading=true;render();try{const data=await api({action:'list'});state.documents=data.documents.filter(d=>!d.storage_path?.includes('/onboarding/'));state.profiles=data.profiles;state.mobile=data.mobile||[];state.mobileError=data.mobile_error||'';state.deletionReviews=data.deletion_reviews||[];state.error='';}catch(e){state.error=e.message;}finally{state.loading=false;render();}}
  function documentMarkup(d){return `<article class="cr-document"><div class="cr-document-title"><div><h4>${esc(d.title||d.file_name||label(d.document_type))}</h4><p>${esc(label(d.document_type))} · ${esc(label(d.status))}</p></div><button type="button" class="secondary-action" data-cr-file="${esc(d.id)}" ${d.storage_path?'':'disabled'}>Open upload</button></div><p class="cr-muted">Uploaded ${esc(date(d.uploaded_at))}${d.expiration_date?` · Expires ${esc(date(d.expiration_date))}`:''}${d.reviewed_at?` · Reviewed ${esc(date(d.reviewed_at))}`:''}</p>${d.review_notes?`<p>Last review: ${esc(d.review_notes)}</p>`:''}<form data-cr-review-document="${esc(d.id)}"><label>Review note <span class="cr-muted">Required when requesting a correction</span><textarea name="reason" maxlength="1000" rows="2"></textarea></label><div class="cr-actions"><button type="submit" name="decision" value="approved" class="primary-action">Approve document</button><button type="submit" name="decision" value="rejected" class="secondary-action">Request correction</button></div></form></article>`;}
  function show(title,html){
    previousFocus=document.activeElement;
    if(!dialog){dialog=document.createElement('dialog');dialog.className='cr-dialog';dialog.setAttribute('aria-labelledby','crDialogTitle');document.body.append(dialog);dialog.addEventListener('close',()=>previousFocus?.focus());dialog.addEventListener('cancel',e=>{if(state.busy)e.preventDefault();});dialog.addEventListener('click',click);dialog.addEventListener('submit',submit);}
    dialog.innerHTML=`<div class="cr-dialog-heading"><h2 id="crDialogTitle">${esc(title)}</h2><button type="button" class="secondary-action" data-cr-close aria-label="Close review">Close</button></div><div class="cr-dialog-body">${html}<p class="cr-result" role="status"></p></div>`;
    if(!dialog.open)dialog.showModal();
  }
  function nativeMarkup(item){
    const sub=item.submission;
    return `<article class="cr-document"><div class="cr-document-title"><div><h4>${esc(item.title)}</h4><p>${item.required?'Required':'Optional'} · ${esc(label(item.state))}</p></div>${sub?.hasFile?`<button class="secondary-action" data-cr-native-file="${esc(sub.id)}">Open upload</button>`:''}</div>${sub?`<p>${esc(sub.fileName||'Submitted in mobile app')} · ${esc(date(sub.createdAt))}</p>${sub.expirationDate?`<p>Expires ${esc(date(sub.expirationDate))}</p>`:''}${sub.reviewerNote?`<p>Last review: ${esc(sub.reviewerNote)}</p>`:''}<form data-cr-native-review="${esc(sub.id)}"><label>Review note <span class="cr-muted">Required for corrections</span><textarea name="reason" maxlength="300" rows="2"></textarea></label><div class="cr-actions"><button class="primary-action" name="decision" value="approved" ${item.state==='expired'?'disabled':''}>Approve document</button><button class="secondary-action" name="decision" value="rejected">Request correction</button></div></form>`:'<p>Not submitted yet. The contractor can complete this requirement in the mobile app.</p>'}</article>`;
  }
  async function openPerson(person){
    if(!person)return;state.person=person;
    show(person.name,'<p class="cr-muted">Loading mobile onboarding…</p>');
    let mobileFile;
    try{if(person.profileId)mobileFile=await api({action:'mobile_account',id:person.profileId});}
    catch(error){if(dialog.open&&state.person===person)result(error.message,true);return;}
    if(!dialog.open||state.person!==person)return;
    const p=profile(person),docs=documents(person),hasWaivers=!!p.onboarding_override||mobileFile?.items?.some(i=>i.submission?.source==='admin'&&i.submission?.reviewerNote?.startsWith('[Portal onboarding override] ')),blocked=['deleted','deletion_pending','disabled','suspended'].includes(p.status);
    show(person.name,`<p class="cr-muted">${esc(person.email)} · ${esc(label(person.status))}</p><section class="cr-section"><h3>Mobile onboarding</h3>${mobileFile?.items?.length?mobileFile.items.map(nativeMarkup).join(''):'<p>No mobile checklist is available for this account.</p>'}</section>${docs.length?`<section class="cr-section"><h3>Other portal uploads</h3>${docs.map(documentMarkup).join('')}</section>`:''}<section class="cr-section"><h3>Account approval</h3><p>${mobileFile?.complete?'All required mobile onboarding items are complete.':'Review the required items above, or grant an established-employee override.'}</p>${person.profileId?`<button class="primary-action" type="button" data-cr-account="approve" ${p.contractor_approved||!mobileFile?.complete||blocked?'disabled':''}>${p.contractor_approved?'Account approved':'Approve account'}</button>`:'<p>Account approval becomes available after signup.</p>'}</section>${person.profileId&&!blocked?`<section class="cr-section"><h3>Established employee override</h3><p>${p.onboarding_override?`Override enabled on ${esc(date(p.onboarding_override_at))}. ${esc(p.onboarding_override_reason)}`:hasWaivers?'Some mobile waivers remain. Remove the override again to finish resetting these requirements.':'Mark unfinished requirements as on file for an established employee and enable jobs in the mobile app. Original submissions remain in their history.'}</p><form data-cr-override><label>Reason<textarea name="reason" rows="2" minlength="5" maxlength="250" required placeholder="Explain this onboarding decision"></textarea></label><p class="cr-muted">${hasWaivers?'Removing the override resets waived requirements and pauses job access.':'This records your decision in both the app and portal.'}</p><button class="${hasWaivers?'secondary':'primary'}-action" name="decision" value="${hasWaivers?'remove_override':'override'}">${hasWaivers?'Remove override':'Grant override and job access'}</button></form></section>`:''}`);
  }
  function openDeletion(id){
    const request=deletions().find(p=>p.userId===id);if(!request)return;
    state.deletion=request;
    show('Review account deletion',`<section class="cr-section"><h3>${esc(request.name||request.email||'Contractor')}</h3><p>Requested from the mobile app on ${esc(date(request.deletionRequested))}.</p><p>Approval removes sign-in access and stops job access. Existing assignments, payments, and document history are retained.</p><form data-cr-deletion-review><label>Decision note<textarea name="reason" minlength="5" maxlength="1000" required rows="3"></textarea></label><label class="cr-confirm"><input type="checkbox" name="confirm">I confirm approval of this contractor’s requested account deletion.</label><div class="cr-actions"><button class="primary-action" name="decision" value="approve_deletion">Approve deletion</button><button class="secondary-action" name="decision" value="decline_deletion" ${decision(request)?.status==='processing'?'disabled':''}>Decline request</button></div></form></section>`);
  }
  function result(message,error=false){const el=dialog?.querySelector('.cr-result');if(el){el.textContent=message;el.classList.toggle('cr-error',error);}}
  async function save(input){
    if(state.busy)return;state.busy=true;dialog.querySelectorAll('button').forEach(b=>b.disabled=true);result('Saving review…');
    try{
      await api(input);await onSaved();await load();dialog.close();
      const message=document.createElement('p');message.className='cr-feedback';message.setAttribute('role','status');
      message.textContent=['review_document','mobile_review'].includes(input.action)?(input.status==='approved'?'Document approved.':'Correction requested. Review notes saved.'):input.action==='override'?'Established-employee override saved. Job access enabled.':input.action==='remove_override'?'Override removed. Account returned to pending approval.':input.action==='approve_deletion'?'Account deletion approved. Sign-in removed; work history retained.':input.action==='decline_deletion'?'Deletion request declined. Review note saved.':'Contractor approved for job access.';
      document.querySelector('.cr-feedback')?.remove();document.querySelector('.cr-center')?.append(message);
    }catch(e){result(e.message,true);dialog.querySelectorAll('button').forEach(b=>b.disabled=false);}finally{state.busy=false;}
  }
  function submit(event){
    const form=event.target;if(!form.matches('[data-cr-review-document],[data-cr-override],[data-cr-native-review],[data-cr-deletion-review]'))return;event.preventDefault();
    const reason=new FormData(form).get('reason'),decision=event.submitter?.value;
    if(form.hasAttribute('data-cr-deletion-review')){const confirm=form.elements.confirm.checked;if(decision==='approve_deletion'&&!confirm){result('Confirm the requested account deletion before approving it.',true);return;}void save({action:decision,id:state.deletion.userId,requested_at:state.deletion.deletionRequested,reason,confirm});}
    else if(form.hasAttribute('data-cr-native-review'))void save({action:'mobile_review',id:state.person.profileId,submission_id:form.dataset.crNativeReview,status:decision,reason});
    else if(form.hasAttribute('data-cr-review-document')){const d=state.documents.find(d=>d.id===form.dataset.crReviewDocument);void save({action:'review_document',id:d.id,status:decision,reason,updated_at:d.updated_at});}
    else void save({action:decision,id:state.person.profileId,reason});
  }
  async function click(event){
    const button=event.target.closest('button');if(!button)return;
    if(button.hasAttribute('data-cr-close')){if(!state.busy)dialog.close();return;}
    if(button.dataset.crTab){state.tab=button.dataset.crTab;render();}
    if(button.hasAttribute('data-cr-refresh')){await onSaved();await load();}
    if(button.dataset.crDeletion)openDeletion(button.dataset.crDeletion);
    if(button.dataset.crMobile)openPerson(people().find(p=>p.profileId===button.dataset.crMobile));
    if(button.dataset.crPerson)openPerson(people().find(p=>p.key===button.dataset.crPerson));
    if(button.dataset.crDocument){const d=state.documents.find(d=>d.id===button.dataset.crDocument);state.person=null;show('Review document',documentMarkup(d));}
    if(button.dataset.crAccount)void save({action:button.dataset.crAccount,id:state.person.profileId});
    if(button.dataset.crFile||button.dataset.crNativeFile){
      const win=window.open('about:blank','_blank');if(win)win.opener=null;
      try{const {url}=await api(button.dataset.crNativeFile?{action:'mobile_file',id:state.person.profileId,submission_id:button.dataset.crNativeFile}:{action:'document_file',id:button.dataset.crFile});if(win)win.location=url;else result('Allow pop-ups to open the uploaded document.',true);}catch(e){win?.close();result(e.message,true);}
    }
  }
  return {markup,render,load,openPerson,bind(root){root.addEventListener('click',click);}};
}
