import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.0/+esm';
import {parseAgentCsv} from './agent-import.mjs';
const app=document.querySelector('#agentApp');
const env=window.__ENV||{};
const client=env.SUPABASE_URL&&env.SUPABASE_ANON_KEY?createClient(env.SUPABASE_URL,env.SUPABASE_ANON_KEY):null;
const state={page:1,status:'all',search:'',data:null,detail:null};
const labels={new:'New',follow_up:'Follow up',not_interested:'Not interested',interested:'Interested',active:'Active'};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(v||0);
const date=v=>v?new Date(v).toLocaleString('en-US',{timeZone:'America/New_York',dateStyle:'medium',timeStyle:'short'}):'—';
const pill=v=>`<span class="pill ${esc(v)}">${esc(labels[v]||String(v).replace(/_/g,' '))}</span>`;
async function api(body){
  const session=await client.auth.getSession();if(!session.data?.session)throw new Error('Sign in to the sales portal to continue.');
  const response=await fetch('/api/agent-referrals',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.data.session.access_token}`},body:JSON.stringify(body)});
  const result=await response.json();if(!response.ok)throw new Error(result.error||'Unable to complete request.');return result;
}
function message(text,error=false){const box=document.querySelector('#message');if(box){box.textContent=text;box.className='notice'+(error?' error':'');}}
function settingsMarkup(){
  const s=state.data.settings,c=state.data.sending;
  return `<details class="panel"><summary>Flyer template & sending setup</summary><div><p class="muted">Email: <strong>${c.email?'Connected':'Needs setup'}</strong> · Text: <strong>${c.sms?'Connected':'Needs setup'}</strong></p>
  <p class="muted">Upload your one-page PDF flyer. QR placement uses percentages from the top-left corner. Preview an active agent’s flyer before sending.</p>
  <form id="templateForm" class="grid"><label class="full">Flyer PDF (up to 2.5 MB)<input type="file" name="pdf" accept="application/pdf"><span>${esc(s.template_name||'No flyer uploaded')}</span></label>
  <label>Left edge (%)<input name="qr_x" type="number" min="0" max="88" step="0.5" value="${esc(s.qr_x)}" required></label>
  <label>Top edge (%)<input name="qr_y" type="number" min="0" max="82" step="0.5" value="${esc(s.qr_y)}" required></label>
  <label>QR width (% of page)<input name="qr_size" type="number" min="12" max="35" step="0.5" value="${esc(s.qr_size)}" required></label><div class="actions"><button class="primary">Save flyer template</button></div></form>
  <p class="footnote">Sending requires a verified Turnly email sender and a connected texting service. Texts include a link to the personalized PDF flyer. Setup status is checked on the server.</p></div></details>`;
}
function render(){
  const d=state.data;
  app.innerHTML=`<div class="layout"><aside class="sidebar"><a href="sales.html" class="brand">Turnly<span style="color:var(--accent)">.</span></a><small>Sales Platform</small><nav><a href="sales.html">Dashboard</a><a href="sales-leads.html">Leads</a><a class="active" href="sales-agents.html">Agents</a><a href="sales-walkthroughs.html">Walkthroughs</a><a href="sales-tasks.html">Tasks & Follow-ups</a></nav></aside>
  <main class="main"><p class="eyebrow">Residential referrals</p><h1>Agent partners</h1><p class="muted">Build relationships with local agents. Give each partner a flyer that brings clients back to them.</p><div id="message" role="status" aria-live="polite"></div>
  <div class="toolbar"><form id="searchForm" class="toolbar" style="margin:0;flex:1"><input class="search" name="search" type="search" aria-label="Search agent names" placeholder="Search agent names" value="${esc(state.search)}"><select id="statusFilter" aria-label="Agent status"><option value="all">All statuses</option>${Object.entries(labels).map(([k,v])=>`<option value="${k}" ${state.status===k?'selected':''}>${v}</option>`).join('')}</select><button>Search</button></form>${d.admin?'<button data-action="import">Upload leads</button><button class="primary" data-action="add">+ Add agent</button>':''}</div>
  <div class="panel"><div class="detail-head"><h2>Agent outreach</h2><span class="muted">${d.total} matching agents</span></div><div class="scroll"><table><thead><tr><th>Agent</th><th>Contact</th><th>Status</th><th>Follow up</th><th></th></tr></thead><tbody>${d.agents.map(a=>`<tr><td><span class="name">${esc(a.name)}</span><small>${esc(a.brokerage)}</small></td><td>${esc(a.email||'No email')}<small>${esc(a.phone||'No phone')}</small></td><td>${pill(a.status)}</td><td>${esc(a.follow_up_on||'—')}</td><td><button data-action="detail" data-id="${a.id}">Open agent</button></td></tr>`).join('')||'<tr><td colspan="5" class="empty">No agents yet. Add an agent or upload your lead list to begin.</td></tr>'}</tbody></table></div><div class="actions"><button data-action="previous" ${state.page===1?'disabled':''}>Previous</button><span class="muted">Page ${state.page}</span><button data-action="next" ${state.page*25>=d.total?'disabled':''}>Next</button></div></div>
  <div id="agentDetail">${state.detail?detailMarkup():''}</div>${d.admin?settingsMarkup():''}<p class="footnote">Referral bonus: 10% of the first clean’s eligible subtotal, excluding taxes and tips. Payable after completion and customer payment. All activity times shown in Eastern Time.</p></main></div><dialog id="editor"></dialog>`;
}
function detailMarkup(){
  const d=state.detail,a=d.agent,admin=state.data.admin;
  return `<section class="panel"><div class="detail-head"><div><p class="eyebrow">Partner profile</p><h2>${esc(a.name)}</h2><p class="muted">${esc(a.brokerage)}</p></div><div><button data-action="edit">Edit agent</button> <button data-action="close">Close</button></div></div>
  ${pill(a.status)}<p class="muted" style="white-space:pre-wrap;margin-top:15px">${esc(a.notes)}</p>
  ${d.link?`<div class="referral-assets"><img src="${esc(d.qr)}" alt="${esc(a.name)} referral QR code"><div><h3>Referral kit</h3><code>${esc(a.referral_code)}</code><input readonly aria-label="Agent referral link" value="${esc(d.link)}"><div class="actions"><button data-action="copy">Copy link</button><a class="button" href="${esc(d.qr)}" download="Turnly-${esc(a.referral_code)}.png">Download QR</a><button data-action="flyer" ${a.status!=='active'?'disabled':''}>Preview flyer</button><button class="primary" data-action="send" ${a.status!=='active'?'disabled':''}>Send email + text</button></div><p class="footnote">${a.status==='active'?'This link attributes customer requests to this agent.':'The referral ID is retained. Reactivate this agent to accept new signups or send flyers.'}</p></div></div>`:'<p class="notice">Set this agent to Active to create their permanent referral ID, QR code, and signup link.</p>'}
  <div id="flyerPreview"></div><div class="stats"><div><strong>${d.ledger.length}</strong><span>Referred customers shown</span></div><div><strong>${money(d.ledger.filter(r=>r.bonus_status==='earned').reduce((s,r)=>s+Number(r.bonus_amount),0))}</strong><span>Bonuses ready to pay</span></div><div><strong>${money(d.ledger.filter(r=>r.bonus_status==='paid').reduce((s,r)=>s+Number(r.payout_amount),0))}</strong><span>Bonuses paid</span></div></div>
  <h3>Customers & referral bonuses</h3><p class="muted">Link each new customer’s first clean once. Completion and QuickBooks customer payment then determine eligibility automatically. An admin can record payment collected outside QuickBooks.</p>
  <div class="scroll"><table><thead><tr><th>Customer</th><th>First clean</th><th>Customer payment</th><th>Bonus</th>${admin?'<th>Manage</th>':''}</tr></thead><tbody>${d.ledger.map(r=>`<tr><td>${esc(r.name)}<small>${esc(r.email)}</small><small>${esc(r.phone)}</small></td><td>${esc(r.clean_status||'Not linked')}<small>Subtotal: ${r.eligible_subtotal==null?'—':money(r.eligible_subtotal)}</small>${r.first_assignment_id?`<small>${esc(r.first_assignment_id)}</small>`:''}</td><td>${r.customer_paid?'Paid':'Awaiting payment'}<small>${esc(r.payment_reference||'')}</small></td><td>${money(r.bonus_status==='paid'?r.payout_amount:r.bonus_amount)}<small>${pill(r.bonus_status)}</small>${r.payout_reference?`<small>${esc(r.payout_reference)}</small>`:''}</td>${admin?`<td><div class="table-actions">${!r.first_assignment_id?`<button data-action="link" data-id="${r.id}">Link first clean</button>`:''}${r.first_assignment_id&&!r.customer_paid&&r.bonus_status!=='paid'?`<button data-action="payment" data-id="${r.id}">Record customer payment</button>`:''}${r.bonus_status==='earned'?`<button data-action="payout" data-id="${r.id}">Record bonus paid</button>`:''}</div></td>`:''}</tr>`).join('')||`<tr><td colspan="5" class="empty">Customer requests from this agent’s QR code or link will appear here.</td></tr>`}</tbody></table></div>
  <h3 style="margin-top:25px">Delivery history</h3><div class="scroll"><table><thead><tr><th>Channel</th><th>Recipient</th><th>Status</th><th>Sent/requested</th><th></th></tr></thead><tbody>${d.deliveries.map(r=>`<tr><td>${r.channel==='sms'?'Text':'Email'}</td><td>${esc(r.recipient)}</td><td>${pill(r.status)}<small>${esc(r.error||'')}</small></td><td>${date(r.created_at)}</td><td>${r.provider_id?`<button data-action="delivery" data-id="${r.id}">Check delivery</button>`:''}</td></tr>`).join('')||'<tr><td colspan="5" class="empty">No messages sent yet.</td></tr>'}</tbody></table></div><p class="footnote">Accepted or queued means the sending service received the request. Delivered appears only when the service reports delivery.</p></section>`;
}
async function load(){state.data=await api({action:'list',page:state.page,status:state.status,search:state.search});render();}
async function detail(id){state.detail=await api({action:'detail',id});document.querySelector('#agentDetail').innerHTML=detailMarkup();}
function dialog(html){const d=document.querySelector('#editor');d.innerHTML=`<button class="close" type="button" data-action="dismiss" aria-label="Close dialog">×</button>${html}<p id="dialogMessage" class="notice error" role="alert"></p>`;d.showModal();return d;}
function edit(a={}){dialog(`<h2>${a.id?'Edit':'Add'} agent</h2><form id="agentForm" data-id="${a.id||''}" class="grid"><label>Name<input name="name" required maxlength="160" value="${esc(a.name)}"></label><label>Brokerage<input name="brokerage" maxlength="180" value="${esc(a.brokerage)}"></label><label>Email<input name="email" type="email" value="${esc(a.email)}"></label><label>Phone<input name="phone" type="tel" value="${esc(a.phone)}"></label><label>Status<select name="status">${Object.entries(labels).map(([k,v])=>`<option value="${k}" ${a.status===k?'selected':''}>${v}</option>`).join('')}</select></label><label>Follow-up date<input name="follow_up_on" type="date" value="${esc(a.follow_up_on)}"></label><label class="full">Notes<textarea name="notes" maxlength="5000">${esc(a.notes)}</textarea></label><label class="check full"><input name="sms_consent" type="checkbox" ${a.sms_consent?'checked':''}>Agent has agreed to receive Turnly referral messages by text.</label><div class="actions full"><button class="primary">Save agent</button></div></form>`);}
async function handleAction(button){
  const action=button.dataset.action,id=button.dataset.id;
  if(action==='dismiss'){document.querySelector('#editor').close();return;}
  if(action==='add'){edit();return;}
  if(action==='edit'){edit(state.detail.agent);return;}
  if(action==='close'){state.detail=null;document.querySelector('#agentDetail').innerHTML='';return;}
  if(action==='detail'){await detail(id);document.querySelector('#agentDetail').scrollIntoView({behavior:'smooth',block:'start'});return;}
  if(action==='previous'||action==='next'){state.page+=action==='next'?1:-1;await load();return;}
  if(action==='copy'){await navigator.clipboard.writeText(state.detail.link);message('Referral link copied.');return;}
  if(action==='import'){dialog(`<h2>Upload agent leads</h2><p class="muted">Upload a CSV with Name, Brokerage, Email, Phone, Notes, and Follow Up On. All imported agents start as New. Existing email or phone matches are skipped.</p><a href="agent-leads-template.csv" download>Download CSV template</a><form id="importForm" class="row-form"><label>Lead list (up to 500 rows)<input type="file" name="csv" accept=".csv,text/csv" required></label><button class="primary">Review import</button></form><div id="importReview"></div>`);return;}
  if(action==='flyer'){const result=await api({action:'flyer',id:state.detail.agent.id});document.querySelector('#flyerPreview').innerHTML=`<div class="actions"><a href="${esc(result.url)}" target="_blank" rel="noopener" class="button">Open / download personalized flyer</a></div><iframe class="preview-frame" title="Personalized agent flyer" src="${esc(result.url)}"></iframe>`;return;}
  if(action==='send'){
    const a=state.detail.agent;
    const result=await api({action:'send',id:a.id,request_id:crypto.randomUUID()});
    await detail(a.id);
    message(result.results.map(r=>`${r.channel==='sms'?'Text':'Email'}: ${r.status.replace(/_/g,' ')}${r.error?' — '+r.error:''}${r.warning?' — '+r.warning:''}`).join('\n'),result.results.some(r=>['failed','unknown','not_configured'].includes(r.status)));return;
  }
  if(action==='delivery'){await api({action:'delivery_status',id});await detail(state.detail.agent.id);message('Delivery status refreshed.');return;}
  if(action==='link'){dialog(`<h2>Link the customer’s first clean</h2><p class="muted">Choose this customer’s first cleaning assignment. The referral is limited to this clean, even if later cleans occur.</p><form id="assignmentSearch" class="row-form"><label>Find assignment by property name<input name="search" required></label><button>Find assignments</button></form><form id="linkForm" data-id="${id}" class="row-form"><label>Assignment<select name="assignment_id" required><option value="">Search for an assignment above</option></select></label><label>Final cleaning subtotal (before taxes and tips)<input name="subtotal" type="number" min="0.01" max="100000" step="0.01" required></label><label class="check"><input type="checkbox" required>I verified this is the customer’s first completed or scheduled clean and the subtotal is correct.</label><button class="primary">Link first clean</button></form>`);return;}
  if(action==='payment'||action==='payout'){dialog(`<h2>${action==='payment'?'Record customer payment':'Record referral bonus paid'}</h2><p class="muted">${action==='payment'?'Record payment only after the customer has paid the full cleaning charge.':'Use this after paying the agent. This records the payout; it does not transfer money.'}</p><form id="recordForm" data-action="${action==='payment'?'record_customer_payment':'record_payout'}" data-id="${id}" class="row-form"><label>Payment reference<input name="reference" required maxlength="300" placeholder="Invoice, transaction, or check reference"></label><button class="primary">Save payment record</button></form>`);return;}
}
let importRows=[];
app.addEventListener('click',async event=>{
  const button=event.target.closest('[data-action]');if(!button)return;
  button.disabled=true;try{await handleAction(button);}catch(error){const box=document.querySelector('#editor[open] #dialogMessage');if(box)box.textContent=error.message;else message(error.message,true);}finally{button.disabled=false;}
});
app.addEventListener('change',async event=>{if(event.target.id==='statusFilter'){state.status=event.target.value;state.page=1;try{await load();}catch(e){message(e.message,true);}}});
app.addEventListener('submit',async event=>{
  event.preventDefault();const form=event.target,button=event.submitter;const values=Object.fromEntries(new FormData(form));if(button)button.disabled=true;
  try{
    if(form.id==='searchForm'){state.search=values.search;state.page=1;await load();}
    if(form.id==='agentForm'){const result=await api({action:'save',id:form.dataset.id||undefined,agent:{...values,sms_consent:form.elements.sms_consent.checked}});document.querySelector('#editor').close();await load();await detail(result.agent.id);message(result.agent.status==='active'?'Agent activated. Referral ID, link, and QR code are ready.':'Agent saved.');}
    if(form.id==='templateForm'){
      const file=form.elements.pdf.files[0];let pdf;
      if(file){if(file.size>2500000)throw new Error('Choose a PDF under 2.5 MB.');pdf=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=reject;reader.readAsDataURL(file);});}
      await api({action:'template',...values,pdf,name:file?.name});await load();message('Flyer template saved. Open an active agent and preview the placement before sending.');
    }
    if(form.id==='importForm'){
      const file=form.elements.csv.files[0];if(file.size>2000000)throw new Error('CSV must be smaller than 2 MB.');importRows=parseAgentCsv(await file.text());
      document.querySelector('#importReview').innerHTML=`<p class="notice">${importRows.length} rows found. First agents: ${importRows.slice(0,5).map(a=>esc(a.name)).join(', ')}.</p><form id="confirmImport"><button class="primary">Import ${importRows.length} leads as New</button></form>`;
    }
    if(form.id==='confirmImport'){const result=await api({action:'import',rows:importRows});document.querySelector('#editor').close();await load();message(`${result.imported} agents imported. ${result.duplicates} duplicates skipped.${result.errors.length?' Failed rows: '+result.errors.map(r=>r.row).join(', '):''}`,!!result.errors.length);}
    if(form.id==='assignmentSearch'){const result=await api({action:'assignments',search:values.search});document.querySelector('#linkForm select').innerHTML='<option value="">Choose the customer’s first clean</option>'+result.assignments.map(a=>`<option value="${a.id}">${esc(a.property_name)} · ${date(a.start_window)} · ${esc(a.status)}</option>`).join('');if(!result.assignments.length)throw new Error('No matching assignments found.');}
    if(form.id==='linkForm'||form.id==='recordForm'){await api({action:form.id==='linkForm'?'link_clean':form.dataset.action,customer_id:form.dataset.id,...values});document.querySelector('#editor').close();await detail(state.detail.agent.id);message('Referral payment record updated.');}
  }catch(error){const box=document.querySelector('#editor[open] #dialogMessage');if(box)box.textContent=error.message;else message(error.message,true);}finally{if(button)button.disabled=false;}
});
try{if(!client)throw new Error('Portal configuration is missing.');const session=await client.auth.getSession();if(!session.data?.session){location.href='sales-login.html';}else await load();}catch(e){app.innerHTML=`<main class="public"><a class="brand" href="sales.html">Turnly</a><p class="notice error">${esc(e.message)}</p><a href="sales.html">Back to sales portal</a></main>`;}
