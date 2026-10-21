const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=value=>value?new Date(value).toLocaleDateString():'Not recorded';
const label=value=>String(value||'uploaded').replace(/_/g,' ').replace(/^./,c=>c.toUpperCase());
const pendingDoc=d=>!['approved','rejected','expired','archived'].includes(d.status);

export function createContractorReview({supabase,getPeople,onSaved}) {
  const state={documents:[],profiles:[],mobile:[],mobileError:'',deletionReviews:[],tab:'signups',error:'',loading:true,person:null,busy:false,requirementDrafts:new Map()};
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
    root.querySelector('.cr-tabs').innerHTML=[['all','All contractors',people().length],['signups','Pending signups',signupQueue().length],['documents','Onboarding reviews',state.mobileError?'!':state.mobile.filter(p=>!p.complete).length+state.documents.filter(pendingDoc).length],['overrides','Staff overrides',state.profiles.filter(p=>p.onboarding_override).length],['deletions','Deletion requests',state.mobileError?'!':deletions().length]].map(([key,text,count])=>`<button type="button" data-cr-tab="${key}" aria-pressed="${state.tab===key}">${text}<span>${count}</span></button>`).join('');
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
      const rows=state.tab==='all'?people():state.tab==='signups'?signupQueue():people().filter(p=>profile(p).onboarding_override);
      queue.innerHTML=rows.length?rows.map(p=>`<article class="cr-queue-row"><div><strong>${esc(p.name)}</strong><small>${esc(p.email)} · ${state.tab==='all'?esc(label(p.status)):state.tab==='signups'?`${documents(p).filter(d=>d.status==='approved').length} documents approved`:esc(profile(p).onboarding_override_reason)}</small></div><button class="secondary-action" data-cr-person="${esc(p.key)}">Review account</button></article>`).join(''):`<div class="cr-empty">${state.tab==='signups'?'No signups are waiting for approval.':'No established-staff overrides have been granted.'}</div>`;
    }
    if(state.mobileError)queue.insertAdjacentHTML('afterbegin',`<p class="cr-error" role="alert">Onboarding requests could not load: ${esc(state.mobileError)} Refresh reviews to retry.</p>`);
  }
  async function load(){state.loading=true;render();try{const data=await api({action:'list'});state.documents=data.documents.filter(d=>!d.storage_path?.includes('/onboarding/'));state.profiles=data.profiles;state.mobile=data.mobile||[];state.mobileError=data.mobile_error||'';state.deletionReviews=data.deletion_reviews||[];state.error='';}catch(e){state.error=e.message;}finally{state.loading=false;render();}}
  function requirementOptions(d){
    const items=state.mobileFile?.items||[], words=String(d.document_type+' '+d.title+' '+d.file_name).toLowerCase();
    const linked=items.find(i=>i.portalDocumentId===d.id);
    const match=linked||items.find(i=> /w[ -]?9/.test(words)&&/w[ -]?9/i.test(i.title) || /insurance|\bcoi\b/.test(words)&&/insurance/i.test(i.title) || /direct.deposit/.test(words)&&/direct.deposit/i.test(i.title) || /bank.verification|voided.check/.test(words)&&/bank.verification/i.test(i.title) || /intake|authorization.form/.test(words)&&/intake/i.test(i.title) || /tax.information/.test(words)&&/tax.information/i.test(i.title) || /master.contractor|contractor.agreement/.test(words)&&/master.*agreement/i.test(i.title) || /background/.test(words)&&/background/i.test(i.title));
    return items.length?`<label>Completes onboarding requirement<select name="item_id"><option value="">Reference document only</option>${items.map(i=>`<option value="${esc(i.id)}" ${i.id===match?.id?'selected':''}>${esc(i.title)}</option>`).join('')}</select></label><p class="cr-muted">Approving this file also completes the selected requirement. Choose the requirement that this document satisfies.</p>`:'';
  }
  function documentMarkup(d){return `<article class="cr-document"><div class="cr-document-title"><div><h4>${esc(d.title||d.file_name||label(d.document_type))}</h4><p>${esc(label(d.document_type))} · ${esc(label(d.status))}</p></div><button type="button" class="secondary-action" data-cr-file="${esc(d.id)}" ${d.storage_path?'':'disabled'}>Open upload</button></div><p class="cr-muted">Uploaded ${esc(date(d.uploaded_at))}${d.expiration_date?` · Expires ${esc(date(d.expiration_date))}`:''}${d.reviewed_at?` · Reviewed ${esc(date(d.reviewed_at))}`:''}</p>${d.review_notes?`<p>Last review: ${esc(d.review_notes)}</p>`:''}<form data-cr-review-document="${esc(d.id)}">${requirementOptions(d)}<label>Review note <span class="cr-muted">Required when requesting a correction</span><textarea name="reason" maxlength="1000" rows="2"></textarea></label><div class="cr-actions"><button type="submit" name="decision" value="approved" class="primary-action">Approve document</button><button type="submit" name="decision" value="rejected" class="secondary-action">Request correction</button></div></form></article>`;}
  function show(title,html){
    previousFocus=document.activeElement;
    if(!dialog){dialog=document.createElement('dialog');dialog.className='cr-dialog';dialog.setAttribute('aria-labelledby','crDialogTitle');document.body.append(dialog);dialog.addEventListener('close',()=>previousFocus?.focus());dialog.addEventListener('cancel',e=>{if(state.busy||!discardDrafts())e.preventDefault();});dialog.addEventListener('click',click);dialog.addEventListener('submit',submit);}
    dialog.innerHTML=`<div class="cr-dialog-heading"><h2 id="crDialogTitle">${esc(title)}</h2><button type="button" class="secondary-action" data-cr-close aria-label="Close review">Close</button></div><div class="cr-dialog-body">${html}<p class="cr-result" role="status"></p></div>`;
    if(!dialog.open)dialog.showModal();
  }
  function nativeMarkup(item){
    const sub=item.submission,waived=!!item.waived,blocked=['deleted','deletion_pending','disabled','suspended','inactive','deactivated','rejected'].includes(profile(state.person).status);
    const status=waived?'Requirement off':({todo:'Upload / submission needed',in_review:'In review',done:'Complete',rejected:'Correction needed',expired:'Expired',resign:'New signature needed'}[item.state]||label(item.state));
    return `<article class="cr-document"><div class="cr-document-title"><div><h4>${esc(item.title)}</h4><p><span class="cr-status cr-status-${waived?'waived':esc(item.state)}">${esc(status)}</span></p></div>${item.required?`<button type="button" role="switch" aria-checked="${!waived}" aria-label="Require ${esc(item.title)}" class="cr-requirement-switch" data-cr-requirement="${esc(item.id)}" ${blocked?'disabled':''}><span class="cr-switch-track" aria-hidden="true"><span></span></span><span>Required ${waived?'off':'on'}</span></button>`:'<span class="cr-muted">Optional</span>'}</div>
      <ol class="cr-doc-stages" aria-label="Document progress"><li class="${sub?.hasFile||item.portalDocumentId?'reached':''}">1. Uploaded / submitted</li><li class="${item.state==='in_review'?'current':''}">2. In review</li><li class="${item.state==='done'&&!waived?'reached':''}">3. Complete</li></ol>
      ${waived?'<p class="cr-waiver-note">Waived for this contractor only. This is an admin exception, not a signed document. Turning Required back on asks for a new submission and pauses job access until reapproval.</p>':'<p class="cr-muted">Turn Required off to waive this item for this contractor. Other contractors are unaffected.</p>'}
      ${item.portalDocumentId?`<button type="button" class="secondary-action" data-cr-file="${esc(item.portalDocumentId)}">View approved upload</button>`:''}
      ${sub?.hasFile?`<button type="button" class="secondary-action" data-cr-native-file="${esc(sub.id)}">View document</button>`:''}
      ${item.previousSubmissionId?`<button type="button" class="secondary-action" data-cr-native-file="${esc(item.previousSubmissionId)}">View previous submission</button>`:''}
      ${sub?`<p>${esc(sub.fileName||(sub.source==='admin'?'Admin decision':'Submitted in app / PWA'))} · ${esc(date(sub.createdAt))}</p>${sub.expirationDate?`<p>Expires ${esc(date(sub.expirationDate))}</p>`:''}${sub.reviewerNote?`<p>Last review: ${esc(sub.reviewerNote.replace(/ \[Previous submission: [\w-]+\]/,''))}</p>`:''}${sub.source!=='admin'?`<details class="cr-review-decision" ${item.state==='in_review'?'open':''}><summary>Review document</summary><form data-cr-native-review="${esc(sub.id)}"><label>Review note <span class="cr-muted">Required for corrections</span><textarea name="reason" maxlength="300" rows="2"></textarea></label><div class="cr-actions"><button class="primary-action" name="decision" value="approved" ${item.state==='expired'?'disabled':''}>Mark complete</button><button class="secondary-action" name="decision" value="rejected">Request correction</button></div></form></details>`:''}`:'<p>No submission yet. The contractor can fill out, sign, or upload this document in the app or PWA.</p>'}</article>`;
  }
  async function openPerson(person){
    if(!person)return;state.person=person;state.requirementDrafts.clear();
    show(person.name,'<p class="cr-muted">Loading onboarding documents…</p>');
    let mobileFile;
    try{if(person.profileId)mobileFile=await api({action:'mobile_account',id:person.profileId});}
    catch(error){if(dialog.open&&state.person===person)result(error.message,true);return;}
    if(!dialog.open||state.person!==person)return;
    state.mobileFile=mobileFile;
    const p=profile(person),docs=documents(person),hasWaivers=!!p.onboarding_override||mobileFile?.items?.some(i=>i.waived),blocked=['deleted','deletion_pending','disabled','suspended'].includes(p.status);
    show(person.name,`<p class="cr-muted">${esc(person.email)} · ${esc(label(person.status))}</p><section class="cr-section"><h3>Documents & onboarding requirements</h3><p>Toggle any requirements below, then select Save changes. Nothing changes until you save.</p><div class="cr-save-bar"><span data-cr-pending>No unsaved changes</span><button type="button" class="primary-action" data-cr-save-requirements disabled>Save changes</button><button type="button" class="secondary-action" data-cr-discard-requirements disabled>Discard changes</button></div>${mobileFile?.items?.length?mobileFile.items.map(nativeMarkup).join(''):'<p>No mobile checklist is available for this account.</p>'}</section>${docs.length?`<section class="cr-section"><h3>Other portal uploads</h3>${docs.map(documentMarkup).join('')}</section>`:''}<section class="cr-section"><h3>Account approval</h3><p>${mobileFile?.complete?'All required onboarding items are complete or individually waived.':'Review the required items above, or grant an established-employee override.'}</p>${person.profileId?`<button class="primary-action" type="button" data-cr-account="approve" ${p.contractor_approved||!mobileFile?.complete||blocked?'disabled':''}>${p.contractor_approved?'Account approved':'Approve account'}</button>`:'<p>Account approval becomes available after signup.</p>'}</section>${person.profileId&&!blocked?`<section class="cr-section"><h3>Established employee override</h3><p>${p.onboarding_override?`Override enabled on ${esc(date(p.onboarding_override_at))}. ${esc(p.onboarding_override_reason)}`:hasWaivers?'Individual requirements are waived. Restore them with their switches above, or restore all waived requirements below.':'Mark unfinished requirements as on file for an established employee and enable jobs in the mobile app. Original submissions remain in their history.'}</p><form data-cr-override><label>Reason<textarea name="reason" rows="2" minlength="5" maxlength="250" required placeholder="Explain this onboarding decision"></textarea></label><p class="cr-muted">${hasWaivers?'Removing the override resets waived requirements and pauses job access.':'This records your decision in both the app and portal.'}</p><button class="${hasWaivers?'secondary':'primary'}-action" name="decision" value="${hasWaivers?'remove_override':'override'}">${hasWaivers?'Remove override':'Grant override and job access'}</button></form></section>`:''}`);
  }
  function openDeletion(id){
    const request=deletions().find(p=>p.userId===id);if(!request)return;
    state.deletion=request;
    show('Review account deletion',`<section class="cr-section"><h3>${esc(request.name||request.email||'Contractor')}</h3><p>Requested from the mobile app on ${esc(date(request.deletionRequested))}.</p><p>Approval removes sign-in access and stops job access. Existing assignments, payments, and document history are retained.</p><form data-cr-deletion-review><label>Decision note<textarea name="reason" minlength="5" maxlength="1000" required rows="3"></textarea></label><label class="cr-confirm"><input type="checkbox" name="confirm">I confirm approval of this contractor’s requested account deletion.</label><div class="cr-actions"><button class="primary-action" name="decision" value="approve_deletion">Approve deletion</button><button class="secondary-action" name="decision" value="decline_deletion" ${decision(request)?.status==='processing'?'disabled':''}>Decline request</button></div></form></section>`);
  }
  function result(message,error=false){const el=dialog?.querySelector('.cr-result');if(el){el.textContent=message;el.classList.toggle('cr-error',error);}}
  async function save(input){
    if(state.busy)return;if(state.requirementDrafts.size){result('Save or discard your requirement changes before reviewing documents or approving the account.',true);return;}state.busy=true;const person=state.person,scroll=dialog.scrollTop;dialog.querySelectorAll('button').forEach(b=>b.disabled=true);result('Saving review…');
    try{
      await api(input);await onSaved();await load();if(person&&['review_document','mobile_review'].includes(input.action)){await openPerson(people().find(p=>p.profileId===person.profileId)||person);dialog.scrollTop=scroll;result(input.status==='approved'?(input.action==='mobile_review'||input.item_id?'Document approved. The matching onboarding requirement is complete.':'Reference document approved.'):'Correction requested.');return;}dialog.close();
      const message=document.createElement('p');message.className='cr-feedback';message.setAttribute('role','status');
      message.textContent=['review_document','mobile_review'].includes(input.action)?(input.status==='approved'?'Document approved.':'Correction requested. Review notes saved.'):input.action==='override'?'Established-employee override saved. Job access enabled.':input.action==='remove_override'?'Override removed. Account returned to pending approval.':input.action==='approve_deletion'?'Account deletion approved. Sign-in removed; work history retained.':input.action==='decline_deletion'?'Deletion request declined. Review note saved.':'Contractor approved for job access.';
      document.querySelector('.cr-feedback')?.remove();document.querySelector('.cr-center')?.append(message);
    }catch(e){if(person){try{await load();await openPerson(person);dialog.scrollTop=scroll;}catch{}}result(e.message,true);dialog.querySelectorAll('button').forEach(b=>{if(!b.hasAttribute('data-cr-account')&&!b.hasAttribute('data-cr-save-requirements')&&!b.hasAttribute('data-cr-discard-requirements'))b.disabled=false;});}finally{state.busy=false;}
  }
  function discardDrafts(){
    if(!state.requirementDrafts.size)return true;
    if(!window.confirm('Discard your unsaved requirement changes?'))return false;
    state.requirementDrafts.clear();return true;
  }
  function updateDraftControls(){
    for(const button of dialog.querySelectorAll('[data-cr-requirement]')){
      const item=state.mobileFile.items.find(i=>i.id===button.dataset.crRequirement);
      const required=state.requirementDrafts.has(item.id)?state.requirementDrafts.get(item.id):!item.waived;
      button.setAttribute('aria-checked',String(required));button.lastElementChild.textContent='Required '+(required?'on':'off');
      button.closest('.cr-document').classList.toggle('cr-unsaved',state.requirementDrafts.has(item.id));
    }
    const count=state.requirementDrafts.size;
    dialog.querySelector('[data-cr-pending]').textContent=count?`${count} unsaved requirement change${count===1?'':'s'}`:'No unsaved changes';
    dialog.querySelector('[data-cr-save-requirements]').disabled=!count;
    dialog.querySelector('[data-cr-discard-requirements]').disabled=!count;
  }
  function toggleRequirement(itemId){
    if(state.busy)return;
    const item=state.mobileFile?.items.find(i=>i.id===itemId);if(!item)return;
    const required=!(state.requirementDrafts.has(itemId)?state.requirementDrafts.get(itemId):!item.waived);
    if(required===!item.waived)state.requirementDrafts.delete(itemId);else state.requirementDrafts.set(itemId,required);
    updateDraftControls();
  }
  async function saveRequirements(){
    if(state.busy||!state.requirementDrafts.size)return;
    state.busy=true;const person=state.person,scroll=dialog.scrollTop;
    const controls=[...dialog.querySelectorAll('button')].map(b=>[b,b.disabled]);controls.forEach(([b])=>b.disabled=true);
    let saved=0,error='';
    try{
      for(const [id,required] of [...state.requirementDrafts]){
        const item=state.mobileFile.items.find(i=>i.id===id);
        result(`Saving requirement ${saved+1}…`);
        await api({action:'mobile_requirement',id:person.profileId,item_id:id,required,expected_submission_id:item.submission?.id||null});
        state.requirementDrafts.delete(id);saved++;
      }
    }catch(e){error=e.message;}
    const remaining=new Map(state.requirementDrafts);
    try{
      await onSaved();await load();await openPerson(people().find(p=>p.profileId===person.profileId)||person);
      for(const [id,required] of remaining){const item=state.mobileFile?.items.find(i=>i.id===id);if(item&&required!==!item.waived)state.requirementDrafts.set(id,required);}
      updateDraftControls();dialog.scrollTop=scroll;
      result(error?`${saved} saved. ${error} Unsaved changes remain for review and retry.`:'Requirement changes saved. Restored requirements pause job access until reapproval.',!!error);
    }catch(e){state.requirementDrafts=remaining;result(e.message,true);controls.forEach(([b,disabled])=>b.disabled=disabled);}
    finally{state.busy=false;}
  }
  function submit(event){
    const form=event.target;if(!form.matches('[data-cr-review-document],[data-cr-override],[data-cr-native-review],[data-cr-deletion-review]'))return;event.preventDefault();
    const reason=new FormData(form).get('reason'),decision=event.submitter?.value;
    if(form.hasAttribute('data-cr-deletion-review')){const confirm=form.elements.confirm.checked;if(decision==='approve_deletion'&&!confirm){result('Confirm the requested account deletion before approving it.',true);return;}void save({action:decision,id:state.deletion.userId,requested_at:state.deletion.deletionRequested,reason,confirm});}
    else if(form.hasAttribute('data-cr-native-review'))void save({action:'mobile_review',id:state.person.profileId,submission_id:form.dataset.crNativeReview,status:decision,reason});
    else if(form.hasAttribute('data-cr-review-document')){const d=state.documents.find(d=>d.id===form.dataset.crReviewDocument);void save({action:'review_document',id:d.id,status:decision,reason,updated_at:d.updated_at,item_id:new FormData(form).get('item_id')||undefined});}
    else void save({action:decision,id:state.person.profileId,reason});
  }
  async function click(event){
    const button=event.target.closest('button');if(!button)return;
    if(button.hasAttribute('data-cr-close')){if(!state.busy&&discardDrafts())dialog.close();return;}
    if(state.busy)return;
    if(button.hasAttribute('data-cr-save-requirements')){await saveRequirements();return;}
    if(button.hasAttribute('data-cr-discard-requirements')){state.requirementDrafts.clear();updateDraftControls();return;}
    if(button.dataset.crRequirement){await toggleRequirement(button.dataset.crRequirement);return;}
    if(button.dataset.crTab){state.tab=button.dataset.crTab;render();}
    if(button.hasAttribute('data-cr-refresh')){await onSaved();await load();}
    if(button.dataset.crDeletion)openDeletion(button.dataset.crDeletion);
    if(button.dataset.crMobile)openPerson(people().find(p=>p.profileId===button.dataset.crMobile));
    if(button.dataset.crPerson)openPerson(people().find(p=>p.key===button.dataset.crPerson));
    if(button.dataset.crDocument){const d=state.documents.find(d=>d.id===button.dataset.crDocument);const owner=documentOwner(d);if(owner)await openPerson(owner);else{state.person=null;state.mobileFile=null;state.requirementDrafts.clear();show('Review document',documentMarkup(d));}}
    if(button.dataset.crAccount)void save({action:button.dataset.crAccount,id:state.person.profileId});
    if(button.dataset.crFile||button.dataset.crNativeFile){
      const win=window.open('about:blank','_blank');if(win)win.opener=null;
      try{const {url}=await api(button.dataset.crNativeFile?{action:'mobile_file',id:state.person.profileId,submission_id:button.dataset.crNativeFile}:{action:'document_file',id:button.dataset.crFile});if(win)win.location=url;else result('Allow pop-ups to open the uploaded document.',true);}catch(e){win?.close();result(e.message,true);}
    }
  }
  return {markup,render,load,openPerson,bind(root){root.addEventListener('click',click);}};
}
