const $=s=>document.querySelector(s),form=$('#authForm');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(v/100);
const fragment=new URLSearchParams(location.hash.slice(1));
let mode=fragment.has('setup')?'verify':fragment.has('reset')?'reset':'login',token=fragment.get('setup')||fragment.get('reset'),page=1;
history.replaceState(null,'',location.pathname);
function message(text,error=false){$('#message').hidden=!text;$('#message').textContent=text;$('#message').className='notice'+(error?' error':'');}
async function api(action,data={}){const r=await fetch('/api/residential-account',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...data}),signal:AbortSignal.timeout(30000)});const body=await r.json();if(!r.ok)throw Object.assign(new Error(body.error||'Please try again.'),{status:r.status});return body;}
function showAuth(){
 $('#auth').hidden=false;$('#dashboard').hidden=true;
 const verification=mode==='verify',reset=mode==='reset',forgot=mode==='forgot';
 $('#authTitle').textContent=verification?'Confirm your account.':reset?'A fresh password.':forgot?'Let’s get you back in.':'Welcome home.';
 $('#authIntro').textContent=verification?'Enter the password you chose after booking to verify your email and open your account.':reset?'Choose a new password with 12–128 characters.':forgot?'Enter your email and we’ll send a password reset link if you have an account.':'Sign in to see your upcoming cleans and service history.';
 $('#emailLabel').hidden=verification||reset;form.elements.email.required=!verification&&!reset;
 $('#passwordLabel').hidden=forgot;form.elements.password.required=!forgot;form.elements.password.minLength=reset?12:1;form.elements.password.autocomplete=reset?'new-password':'current-password';
 $('#authButton').textContent=verification?'Confirm and view my cleans →':reset?'Save password →':forgot?'Send reset link →':'Sign in →';$('#forgot').hidden=mode!=='login';$('#backLogin').hidden=mode==='login';$('#accountHelp').hidden=mode!=='login';
}
const statusText=b=>b.status==='cancelled'?'Cancelled':b.job?.status==='completed'||b.status==='completed'?'Clean completed':b.job?.status==='in_progress'?'Cleaning in progress':['claimed','scheduled'].includes(b.job?.status)?'Cleaner assigned':b.status==='scheduled'?'Booked · awaiting team assignment':b.status==='awaiting_card'?'Card setup incomplete':b.status==='needs_reschedule'?'New date needed':'Request under review';
const paymentText={not_collected:'No charge collected',card_saved:'Card saved · charge on service morning',paid:'Paid',action_required:'Payment needs attention',processing:'Payment processing',charging:'Payment processing',uncertain:'Payment under review',adjusted:'Payment adjusted'};
function card(b){const d=new Date(b.service_date+'T12:00:00Z').toLocaleDateString('en-US',{weekday:'short',month:'long',day:'numeric',year:'numeric',timeZone:'UTC'});return `<article class="clean-card"><span class="status-chip">${esc(statusText(b))}</span><h2>${esc(b.quote.service_label)}</h2><p><strong>${esc(d)}</strong><br>${esc(b.arrival_start.slice(0,5))}–${esc(b.arrival_end.slice(0,5))} Eastern</p><p>${esc(b.property_address)}<br>${esc(b.city)}, ${esc(b.state)} ${esc(b.zip)}</p><dl><div><dt>Visit total</dt><dd>${money(b.amount_cents)}</dd></div><div><dt>Payment</dt><dd>${esc(paymentText[b.payment_status]||'Under review')}</dd></div><div><dt>Cleaner</dt><dd>${esc(b.job?.assigned_to_name||b.job?.claimed_by_name||'We’ll assign your cleaner')}</dd></div><div><dt>Referral</dt><dd>${esc(b.agent_name)}</dd></div><div><dt>Reference</dt><dd>${esc(b.id.slice(0,8).toUpperCase())}</dd></div></dl></article>`;}
async function load(){try{const r=await api('list',{page});$('#auth').hidden=true;$('#dashboard').hidden=false;$('#profile').textContent=`${r.account.name} · ${r.account.email}`;$('#cleans').innerHTML=r.bookings.map(card).join('')||'<p>No cleans are linked to this email yet. Book using the same email address to see your visits here.</p>';$('#previous').disabled=page===1;$('#next').disabled=page*20>=r.total;$('#page').textContent=`Page ${page} · ${r.total} visit${r.total===1?'':'s'}`;}catch(e){if(e.status===401){mode='login';showAuth();}else message(e.message,true);}}
form.onsubmit=async e=>{e.preventDefault();const button=$('#authButton');button.disabled=true;message('');try{const r=await api(mode,{email:form.elements.email.value,password:form.elements.password.value,token});form.elements.password.value='';if(mode==='forgot')message(r.message);else{token=null;message('');await load();}}catch(e){message(e.message,true);}finally{button.disabled=false;}};
$('#forgot').onclick=()=>{mode='forgot';message('');showAuth();};$('#backLogin').onclick=()=>{mode='login';token=null;message('');showAuth();};
$('#logout').onclick=async()=>{try{await api('logout');$('#cleans').replaceChildren();form.reset();mode='login';message('');showAuth();}catch(e){message(e.message,true);}};
$('#previous').onclick=()=>{page--;load();};$('#next').onclick=()=>{page++;load();};
if(mode==='login')load();else showAuth();
addEventListener('hashchange',()=>{
 const link=new URLSearchParams(location.hash.slice(1));
 if(!link.has('setup')&&!link.has('reset'))return;
 mode=link.has('setup')?'verify':'reset';token=link.get('setup')||link.get('reset');
 history.replaceState(null,'',location.pathname);form.reset();message('');showAuth();
});

addEventListener('focus',()=>{if(!$('#dashboard').hidden)load();});
