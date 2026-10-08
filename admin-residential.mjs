import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.0/+esm';
const env=window.__ENV||{},client=env.SUPABASE_URL&&env.SUPABASE_ANON_KEY?createClient(env.SUPABASE_URL,env.SUPABASE_ANON_KEY):null;
const $=s=>document.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format((v||0)/100);
let page=1,view='jobs',customerId='',busy=false;
async function api(action,values={}){const auth=await client?.auth.getSession();if(!auth?.data?.session)throw new Error('Sign in to the admin portal to view residential clients and jobs.');const r=await fetch('/api/residential-booking',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+auth.data.session.access_token},body:JSON.stringify({action,...values})});const result=await r.json();if(!r.ok)throw new Error(result.error||'Unable to complete request.');return result;}
function message(text,error=false){$('#message').textContent=text;$('#message').className='notice'+(error?' error':'');}
function jobCard(b){
 const job=b.job;
 return `<article class="lead-card"><div class="detail-head"><div><h3>${esc(b.name)}</h3><p class="muted">${esc(b.id.slice(0,8).toUpperCase())} · ${esc(b.status.replaceAll('_',' '))}</p></div><strong>${money(b.amount_cents)}</strong></div>
 <p>${esc(b.quote.service_label)} · ${esc(b.quote.frequency_label)}</p><p>${esc(b.property_address)}<br>${esc(b.city)}, ${esc(b.state)} ${esc(b.zip)}<br>${Number(b.sqft).toLocaleString()} sq ft · ${b.beds} bed · ${b.baths} bath</p>
 <p><strong>${esc(b.service_date)}</strong> · ${esc(b.arrival_start.slice(0,5))}–${esc(b.arrival_end.slice(0,5))} Eastern</p><p>${esc(b.email)}<br>${esc(b.phone)}</p><p class="footnote">Profile address: ${esc(b.profile_address)}</p>
 <p>Agent: <strong>${esc(b.agent_name)}</strong><br><small>${esc(b.referral_code)}</small></p><p>Customer payment: <strong>${esc(b.payment_status.replaceAll('_',' '))}</strong></p>
 ${job?`<section class="message-preview"><h3>Assignment workflow</h3><p>Status: <strong>${esc(job.status.replaceAll('_',' '))}</strong><br>Cleaner: ${esc(job.assigned_to_name||job.claimed_by_name||'Unassigned')}<br>Contractor pay: ${money(Number(job.pay_amount)*100)}</p><a class="button" href="assignments.html?residential_job=${esc(job.id)}">Open job in Assignments</a>
 ${job.status==='pending'&&b.status==='scheduled'?`<form data-approve-job="${b.id}" class="row-form"><label>Agreed contractor pay ($)<input name="pay_amount" type="number" min="0.01" step="0.01" max="100000" required></label><button class="primary">Approve and release job</button><p class="footnote">Sets contractor pay and moves the job to Open for the normal claim, schedule, checklist, and completion workflow.</p></form>`:''}</section>`:`<p class="notice">${esc(b.job_error||(['awaiting_card','requested','review_required','needs_reschedule'].includes(b.status)?'Review this request and complete card booking before it is released as a contractor job.':'No assignment linked.'))}</p>`}
 ${b.notes?`<p class="footnote">${esc(b.notes)}</p>`:''}${['action_required','uncertain','adjusted','processing'].includes(b.payment_status)?'<p class="notice">Payment needs attention. Review Stripe and contact the customer before service. Check an uncertain payment before retrying.</p>':''}
 <div class="actions">${b.stripe_session||b.stripe_payment_intent?`<button data-action="admin_sync" data-id="${b.id}">Refresh Stripe status</button>`:''}${!['completed','cancelled'].includes(b.status)&&!['paid','charging','processing','uncertain','adjusted'].includes(b.payment_status)?`<button data-action="admin_cancel" data-id="${b.id}">Cancel booking</button>`:''}</div></article>`;
}
function clientCard(c){const b=c.latest_booking,a=c.referral_agents;return `<article class="lead-card"><h3>${esc(c.name)}</h3><p>${esc(c.email)}<br>${esc(c.phone)}</p>${b?`<p class="footnote">Profile address</p><p>${esc(b.profile_address)}</p><p class="footnote">Latest service property</p><p>${esc(b.property_address)}<br>${esc([b.city,b.state,b.zip].filter(Boolean).join(', '))}</p>`:'<p class="muted">Registered lead · no booking submitted yet.</p>'}<p>Referring agent: ${esc(a?.name||'—')}</p><p>${c.booking_count} submitted booking${c.booking_count===1?'':'s'}</p><button class="primary" data-customer="${c.id}">View client jobs</button></article>`;}
async function load(){
 try{
  const r=await api(view==='jobs'?'admin_list':'admin_clients',{page,status:$('#status').value,customer_id:customerId||undefined,search:$('#clientSearch').value});
  $('#config').textContent=view==='clients'?'Customer profiles and their submitted bookings are stored securely in Turnly’s database. Select a client to see their jobs.':r.payments_ready?'Confirmed card bookings enter Assignments as pending jobs. Set contractor pay and approve them here.':'Online card booking is not enabled yet. Submitted requests remain visible here for follow-up.';
  $('#bookings').innerHTML=(view==='jobs'?r.bookings.map(jobCard):r.clients.map(clientCard)).join('')||'<p class="panel">No matching records.</p>';
  $('#page').textContent=`Page ${page} · ${r.total} ${view==='jobs'?'bookings':'clients'}`;$('#previous').disabled=page===1;$('#next').disabled=page*25>=r.total;
 }catch(e){message(e.message,true);$('#bookings').textContent='Residential records could not be loaded.';}
}
function switchView(next){view=next;page=1;customerId='';$('#clientFilter').hidden=true;$('#jobFilters').hidden=view!=='jobs';$('#clientFilters').hidden=view!=='clients';$('#jobsView').setAttribute('aria-pressed',view==='jobs');$('#clientsView').setAttribute('aria-pressed',view==='clients');load();}
$('#jobsView').onclick=()=>switchView('jobs');$('#clientsView').onclick=()=>switchView('clients');$('#status').onchange=()=>{page=1;load();};$('#refresh').onclick=load;
$('#searchClients').onsubmit=e=>{e.preventDefault();page=1;load();};$('#clearClient').onclick=()=>switchView('jobs');$('#previous').onclick=()=>{page--;load();};$('#next').onclick=()=>{page++;load();};
$('#bookings').onclick=async e=>{
 const c=e.target.closest('[data-customer]');if(c){view='jobs';customerId=c.dataset.customer;page=1;$('#status').value='';$('#clientFilter').hidden=false;$('#jobFilters').hidden=false;$('#clientFilters').hidden=true;$('#jobsView').setAttribute('aria-pressed','true');$('#clientsView').setAttribute('aria-pressed','false');return load();}
 const b=e.target.closest('[data-action]');if(!b||busy)return;if(b.dataset.action==='admin_cancel'&&!confirm('Cancel this booking and its assignment, and prevent its scheduled charge?'))return;
 busy=true;b.disabled=true;try{await api(b.dataset.action,{id:b.dataset.id});message('Booking updated.');await load();}catch(e){message(e.message,true);}finally{busy=false;b.disabled=false;}
};
$('#bookings').onsubmit=async e=>{const form=e.target.closest('[data-approve-job]');if(!form)return;e.preventDefault();if(busy)return;busy=true;const button=e.submitter;button.disabled=true;try{await api('admin_approve_job',{id:form.dataset.approveJob,pay_amount:form.elements.pay_amount.value});message('Job approved and released to the assignment board.');await load();}catch(error){message(error.message,true);}finally{busy=false;button.disabled=false;}};
load();
