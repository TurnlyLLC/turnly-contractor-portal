const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=value=>value?new Date(value).toLocaleDateString():'Not recorded';
const label=value=>String(value||'uploaded').replace(/_/g,' ').replace(/^./,c=>c.toUpperCase());
const pendingDoc=d=>!['approved','rejected','expired','archived'].includes(d.status);

export function createContractorReview({supabase,getPeople,onSaved}) {
  const state={documents:[],profiles:[],tab:'signups',error:'',loading:true,person:null,busy:false};
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
  function documentOwner(doc){return people().find(p=>documents(p).some(d=>d.id===doc.id));}
  function markup(){return `<section class="cr-center" aria-labelledby="crHeading"><div class="cr-heading"><div><span class="cr-eyebrow">CONTRACTOR ACCOUNTS</span><h2 id="crHeading">Review center</h2><p>Manage signup approvals, review uploads, and approve established staff for work.</p></div><button type="button" class="secondary-action" data-cr-refresh>Refresh reviews</button></div><div class="cr-tabs" role="group" aria-label="Review queues"></div><div class="cr-queue" aria-live="polite"></div></section>`;}
  function render(){
    const root=document.querySelector('.cr-center');if(!root)return;
    root.querySelector('.cr-tabs').innerHTML=[['signups','Pending signups',signupQueue().length],['documents','Documents to review',state.documents.filter(pendingDoc).length],['overrides','Staff overrides',state.profiles.filter(p=>p.onboarding_override).length]].map(([key,text,count])=>`<button type="button" data-cr-tab="${key}" aria-pressed="${state.tab===key}">${text}<span>${count}</span></button>`).join('');
    const queue=root.querySelector('.cr-queue');
    if(state.loading){queue.innerHTML='<p>Loading reviews…</p>';return;}
    if(state.error){queue.innerHTML=`<p role="alert" class="cr-error">${esc(state.error)}</p>`;return;}
    if(state.tab==='documents'){
      const docs=state.documents.filter(pendingDoc);
      queue.innerHTML=docs.length?docs.map(d=>{const owner=documentOwner(d);return `<article class="cr-queue-row"><div><strong>${esc(d.title||d.file_name||label(d.document_type))}</strong><small>${esc(owner?.name||d.contractor_name||d.contractor_email||'Unlinked upload')} · ${esc(label(d.document_type))} · Uploaded ${esc(date(d.uploaded_at))}</small></div><button class="secondary-action" data-cr-document="${esc(d.id)}">Review document</button></article>`;}).join(''):'<div class="cr-empty">No documents are waiting for review.</div>';
    }else{
      const rows=state.tab==='signups'?signupQueue():people().filter(p=>profile(p).onboarding_override);
      queue.innerHTML=rows.length?rows.map(p=>`<article class="cr-queue-row"><div><strong>${esc(p.name)}</strong><small>${esc(p.email)} · ${state.tab==='signups'?`${documents(p).filter(d=>d.status==='approved').length} documents approved`:esc(profile(p).onboarding_override_reason)}</small></div><button class="secondary-action" data-cr-person="${esc(p.key)}">Review account</button></article>`).join(''):`<div class="cr-empty">${state.tab==='signups'?'No signups are waiting for approval.':'No established-staff overrides have been granted.'}</div>`;
    }
  }
  async function load(){state.loading=true;render();try{const data=await api({action:'list'});state.documents=data.documents;state.profiles=data.profiles;state.error='';}catch(e){state.error=e.message;}finally{state.loading=false;render();}}
  function documentMarkup(d){return `<article class="cr-document"><div class="cr-document-title"><div><h4>${esc(d.title||d.file_name||label(d.document_type))}</h4><p>${esc(label(d.document_type))} · ${esc(label(d.status))}</p></div><button type="button" class="secondary-action" data-cr-file="${esc(d.id)}" ${d.storage_path?'':'disabled'}>Open upload</button></div><p class="cr-muted">Uploaded ${esc(date(d.uploaded_at))}${d.expiration_date?` · Expires ${esc(date(d.expiration_date))}`:''}${d.reviewed_at?` · Reviewed ${esc(date(d.reviewed_at))}`:''}</p>${d.review_notes?`<p>Last review: ${esc(d.review_notes)}</p>`:''}<form data-cr-review-document="${esc(d.id)}"><label>Review note <span class="cr-muted">Required when requesting a correction</span><textarea name="reason" maxlength="1000" rows="2"></textarea></label><div class="cr-actions"><button type="submit" name="decision" value="approved" class="primary-action">Approve document</button><button type="submit" name="decision" value="rejected" class="secondary-action">Request correction</button></div></form></article>`;}
  function show(title,html){
    previousFocus=document.activeElement;
    if(!dialog){dialog=document.createElement('dialog');dialog.className='cr-dialog';dialog.setAttribute('aria-labelledby','crDialogTitle');document.body.append(dialog);dialog.addEventListener('close',()=>previousFocus?.focus());dialog.addEventListener('cancel',e=>{if(state.busy)e.preventDefault();});dialog.addEventListener('click',click);dialog.addEventListener('submit',submit);}
    dialog.innerHTML=`<div class="cr-dialog-heading"><h2 id="crDialogTitle">${esc(title)}</h2><button type="button" class="secondary-action" data-cr-close aria-label="Close review">Close</button></div><div class="cr-dialog-body">${html}<p class="cr-result" role="status"></p></div>`;
    if(!dialog.open)dialog.showModal();
  }
  function openPerson(person){
    if(!person)return;state.person=person;
    const p=profile(person),docs=documents(person);
    show(person.name,`<p class="cr-muted">${esc(person.email)} · ${esc(label(person.status))}</p><section class="cr-section"><h3>Onboarding documents</h3>${docs.length?docs.map(documentMarkup).join(''):'<p>No onboarding documents have reached the portal for this account.</p>'}</section><section class="cr-section"><h3>Account approval</h3><p>Review the submitted documents before approving access to jobs.</p>${person.profileId?`<button class="primary-action" type="button" data-cr-account="approve" ${p.contractor_approved?'disabled':''}>${p.contractor_approved?'Account approved':'Approve account'}</button>`:'<p>This is a directory invite. Account approval becomes available after signup.</p>'}</section>${person.profileId?`<section class="cr-section"><h3>Established employee override</h3><p>${p.onboarding_override?`Override enabled on ${esc(date(p.onboarding_override_at))}. ${esc(p.onboarding_override_reason)}`:'Grant job access to an established employee while leaving the original document statuses intact.'}</p><form data-cr-override><label>Reason<textarea name="reason" rows="2" minlength="5" maxlength="1000" required placeholder="Explain why this employee can bypass onboarding"></textarea></label><p class="cr-muted">${p.onboarding_override?'Removing this override returns the account to pending approval and pauses job access.':'This approves the account for jobs and records your decision.'}</p><button class="${p.onboarding_override?'secondary':'primary'}-action" name="decision" value="${p.onboarding_override?'remove_override':'override'}">${p.onboarding_override?'Remove override':'Grant override and job access'}</button></form></section>`:''}`);
  }
  function result(message,error=false){const el=dialog?.querySelector('.cr-result');if(el){el.textContent=message;el.classList.toggle('cr-error',error);}}
  async function save(input){
    if(state.busy)return;state.busy=true;dialog.querySelectorAll('button').forEach(b=>b.disabled=true);result('Saving review…');
    try{
      await api(input);await onSaved();await load();dialog.close();
      const message=document.createElement('p');message.className='cr-feedback';message.setAttribute('role','status');
      message.textContent=input.action==='review_document'?(input.status==='approved'?'Document approved.':'Correction requested. Review notes saved.'):input.action==='override'?'Established-employee override saved. Job access enabled.':input.action==='remove_override'?'Override removed. Account returned to pending approval.':'Contractor approved for job access.';
      document.querySelector('.cr-feedback')?.remove();document.querySelector('.cr-center')?.append(message);
    }catch(e){result(e.message,true);dialog.querySelectorAll('button').forEach(b=>b.disabled=false);}finally{state.busy=false;}
  }
  function submit(event){
    const form=event.target;if(!form.matches('[data-cr-review-document],[data-cr-override]'))return;event.preventDefault();
    const reason=new FormData(form).get('reason'),decision=event.submitter?.value;
    if(form.hasAttribute('data-cr-review-document')){const d=state.documents.find(d=>d.id===form.dataset.crReviewDocument);void save({action:'review_document',id:d.id,status:decision,reason,updated_at:d.updated_at});}
    else void save({action:decision,id:state.person.profileId,reason});
  }
  async function click(event){
    const button=event.target.closest('button');if(!button)return;
    if(button.hasAttribute('data-cr-close')){if(!state.busy)dialog.close();return;}
    if(button.dataset.crTab){state.tab=button.dataset.crTab;render();}
    if(button.hasAttribute('data-cr-refresh')){await onSaved();await load();}
    if(button.dataset.crPerson)openPerson(people().find(p=>p.key===button.dataset.crPerson));
    if(button.dataset.crDocument){const d=state.documents.find(d=>d.id===button.dataset.crDocument);state.person=null;show('Review document',documentMarkup(d));}
    if(button.dataset.crAccount)void save({action:button.dataset.crAccount,id:state.person.profileId});
    if(button.dataset.crFile){
      const win=window.open('about:blank','_blank');if(win)win.opener=null;
      try{const {url}=await api({action:'document_file',id:button.dataset.crFile});if(win)win.location=url;else result('Allow pop-ups to open the uploaded document.',true);}catch(e){win?.close();result(e.message,true);}
    }
  }
  return {markup,render,load,openPerson,bind(root){root.addEventListener('click',click);}};
}
