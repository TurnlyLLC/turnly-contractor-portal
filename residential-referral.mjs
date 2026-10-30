import './booking-calendar-rules.js?v=20261028';
const Calendar=globalThis.TurnlyBookingCalendar;
import {earliestDay,hasNotice} from './residential-notice.mjs?v=20261015-36hours';
import {setupAddress} from './residential-address.mjs?v=20261009-visit';
const $=s=>document.querySelector(s),form=$('#bookingForm'),f=form.elements;
const code=new URL(location.href).searchParams.get('ref')||'';
const ba=new URL(location.href).searchParams.get('ba')||'';
let gift=new URLSearchParams(location.hash.slice(1)).get('gift')||'';
const labels=['YOUR HOME','YOUR DETAILS','YOUR CLEAN','YOUR QUOTE','YOUR TIME','YOUR VISIT','YOUR BOOKING'];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=c=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(c/100);
let scopeReviewed=false,scopeService='',scopeVersion='';
let step=0,context=null,quote=null,busy=false,attempt=null,receiptParams=null,outOfRange=false;
const addressFlow=setupAddress({form,api,enabled:()=>!!context?.property_lookup,onChange:()=>{attempt=null;quote=null;outOfRange=false;$('#rangeNotice').hidden=true;$('#coverageStatus').hidden=true;}});

const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const tomorrow=new Date(earliestDay()+'T12:00:00Z');f.service_date.min=earliestDay();
let month=new Date(tomorrow.getUTCFullYear(),tomorrow.getUTCMonth(),1);
form.noValidate=true;
function notice(text,error=false){const el=$('#notice');el.textContent=text;el.hidden=!text;el.className='notice'+(error?' error':'');}
async function api(action,values={}){const r=await fetch('/api/residential-booking',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,code,ba,gift,...values}),signal:AbortSignal.timeout(30000)});let data;try{data=await r.json();}catch{throw new Error('We couldn’t reach the booking service. Please try again.');}if(!r.ok)throw new Error(data.error||'Please try again.');return data;}
function values(){const data=Object.fromEntries(new FormData(form));data.property_confirmed=f.property_confirmed.checked;data.consent=f.consent.checked;data.scope_accepted=f.scope_accepted.checked;data.scope_reviewed=scopeReviewed;data.scope_service=scopeService;data.scope_version=scopeVersion;data.ba_consent=f.ba_consent.checked;data.out_of_range_consent=f.out_of_range_consent.checked;if(gift&&quote)data.gift_expected_cents=quote.gift_cents;if(!['standard','deep'].includes(data.service))data.frequency='once';return data;}
function humanDate(d){return new Date(d+'T12:00:00Z').toLocaleDateString('en-US',{weekday:'short',month:'long',day:'numeric',year:'numeric',timeZone:'UTC'});}
function humanTime(t){const [h,m]=t.split(':');return `${(+h%12)||12}:${m} ${+h>=12?'PM':'AM'}`;}
function rows(items){return `<dl>${items.map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;}
function requestOnly(){return outOfRange||quote?.review_required||!context?.payments_ready;}
function syncGift(){
 $('#bookingGiftCode').value=gift;$('#removeGift').hidden=!gift;
 $('#consentText').textContent=context.consent;
 $('#referralBadge').textContent=context.ambassador?`Referred by ${context.ambassador.name}`:gift?`Gift card · ${money(context.gift.available_cents)} available`:context.direct?'':`Referred by ${context.agent.name}`;
 $('#referralBadge').hidden=!$('#referralBadge').textContent;
}
async function changeGift(remove=false){
 if(busy)return;
 const candidate=remove?'':$('#bookingGiftCode').value.replace(/[\s-]/g,'').toUpperCase();
 if(!remove&&!/^[A-Z0-9]{24}$/.test(candidate)){$('#bookingGiftMessage').textContent='Enter the 24-character code from your gift card.';return;}
 lock(true);$('#applyGift').disabled=$('#removeGift').disabled=true;
 try{
  const nextContext=await api('context',{gift:candidate});
  if(candidate&&nextContext.gift.available_cents<=0)throw new Error('This card has no available credit. Its balance may be held for another booking.');
  const nextQuote=(await api('quote',{...values(),gift:candidate})).quote;
  gift=candidate;context=nextContext;quote=nextQuote;attempt=null;
  const fragment=new URLSearchParams(location.hash.slice(1));if(gift)fragment.set('gift',gift);else fragment.delete('gift');
  history.replaceState(history.state,'',location.pathname+location.search+(fragment.size?'#'+fragment:''));
  syncGift();renderQuote();$('#bookingGiftMessage').textContent=gift?`${money(quote.gift_cents)} gift credit applied. ${money(quote.card_charge_cents)} due on your service date.`:'Gift card removed. Your quote has been updated.';
 }catch(e){$('#bookingGiftMessage').textContent=e.message;}
 finally{lock(false);$('#applyGift').disabled=$('#removeGift').disabled=false;$('#next').innerHTML='Choose my time <span>→</span>';}
}
$('#applyGift').onclick=()=>changeGift();$('#removeGift').onclick=()=>changeGift(true);
$('#bookingGiftCode').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();changeGift();}};
function renderQuote(){
 $('.gift-entry').hidden=requestOnly();
 if(requestOnly()){delete quote.gift_cents;delete quote.card_charge_cents;}

 $('#quoteReassurance').textContent=outOfRange?'Request only. No card or payment collected.':'◇ Card required to book. No service charge today.';
 $('#quoteCard').innerHTML=`<h3>${esc(quote.service_label)}${(quote.review_required||outOfRange)?' · estimate':''}</h3><div class="price">${money(quote.amount_cents)} <small>first visit</small></div><p class="fine">${(quote.review_required||outOfRange)?'Estimate only — subject to service availability and review':'Your first-visit cleaning price'}</p>${quote.gift_cents?`<p>Gift card credit: -${money(quote.gift_cents)}<br><strong>Charge on service date: ${money(quote.card_charge_cents)}</strong></p>`:''}${rows([['Space to clean',`${quote.sqft.toLocaleString()} sq ft`],['Rate',`${money(quote.rate_cents)} / sq ft`],['Minimum per visit',money(quote.minimum_cents)]])}${quote.maintenance_cents?`<div class="recurring-price"><strong>Then ${money(quote.maintenance_cents)} per maintenance visit</strong><br>${esc(quote.frequency_label)} · standard cleaning<br><span class="fine">Your first ${quote.service==='deep'?'deep':'standard'} clean is priced above. Maintenance visits are arranged separately; this booking reserves the first visit only.</span></div>`:''}${quote.review_required?'<div class="review-warning">Homes over 3,000 sq ft need a custom review. Send your preferred date and we’ll confirm the final quote before collecting a card or booking the clean.</div>':''}`;
}
function resetScope(){scopeReviewed=false;scopeService='';scopeVersion='';f.scope_accepted.checked=false;f.scope_accepted.disabled=true;$('#scopeReview').open=false;}
function renderScope(){
 const service=f.service.value,p=context.scopes[service==='standard'?'standard':'deep'];
 if(scopeService!==service||scopeVersion!==p.version){resetScope();scopeService=service;scopeVersion=p.version;}
 $('#scopeTitle').textContent=`Your ${quote.service_label.toLowerCase()} scope`;
 $('#scopeDescription').textContent=['move','listing'].includes(service)?'This service uses our Deep Cleaning scope. Review everything included and excluded below.':'Review everything included and excluded in your selected service below.';
 $('#selectedScope').innerHTML=p.html;
 $('#scopeAcceptText').textContent=`I have reviewed and accept the included tasks, exclusions, add-on requirements and service guidelines for my ${quote.service_label.toLowerCase()}.`;
 $('#scopeHelp').textContent=scopeReviewed?'You can reopen the scope at any time before submitting.':'Open the scope above to review it before accepting.';
}
$('#scopeReview').addEventListener('toggle',()=>{if($('#scopeReview').open){scopeReviewed=true;f.scope_accepted.disabled=false;$('#scopeHelp').textContent='After reviewing the scope, check the acceptance box below.';}});
function renderReview(){renderScope();const d=values();$('#reviewCard').innerHTML=`<h3>${esc(quote.service_label)}</h3><p>${esc(d.property_address)}, ${esc(d.city)}, ${esc(d.state)} ${esc(d.zip)}</p>${rows([['Preferred date',humanDate(d.service_date)],['Arrival window',`${humanTime(d.arrival_start)}–${humanTime(d.arrival_end)} ET`],['First visit'+((quote.review_required||outOfRange)?' estimate':''),money(quote.amount_cents)],...(quote.gift_cents?[['Gift card credit',money(quote.gift_cents)],['Charge on service date',money(quote.card_charge_cents)]]:[]),['Due today','$0.00'],[context.ambassador?'Referring agent':context.direct?'Booked with':'Agent referral',context.ambassador?.name||context.agent.name]])}`;
 const request=requestOnly();$('#outOfRangeConsent').hidden=!outOfRange;f.out_of_range_consent.required=outOfRange;$('#consentWrap').hidden=request;f.consent.required=!request;$('#stripeNote').hidden=request;
 $('#lastTitle').textContent=request?'Your fresh start is taking shape.':'You’re one step from a cleaner home.';
 $('#lastIntro').textContent=request?'Send your details and preferred time to Turnly.':'Review your visit, then securely add your card with Stripe.';
 $('#paymentNote').innerHTML=request?`<strong>${outOfRange?'This is an out-of-range service request.':quote.review_required?'We’ll review your home’s quote.':'Card booking is being connected.'}</strong><p>Your request will reach Turnly for review. This does not reserve a visit or guarantee service. No card or gift-card credit is collected. We’ll contact you about availability before any booking.</p>`:'<strong>No service charge today.</strong><p>Your card is required to book. We’ll charge it on the morning of your clean at 6am Eastern, or at the start of an earlier arrival window.</p>';
}
function showStep(next,push=true){if(next!==5&&parkingDialog.open)parkingDialog.close();if(push&&next!==step)history.pushState({turnlyStep:next},'',location.href);step=next;document.querySelectorAll('[data-step]').forEach(el=>el.hidden=Number(el.dataset.step)!==step);$('#stepLabel').textContent=labels[step];$('#stepCount').textContent=`Step ${outOfRange&&step===6?6:step+1} of ${outOfRange?6:7}`;$('#progressBar').style.width=`${(step+1)/7*100}%`;$('#back').hidden=step===0;$('#next').innerHTML=step===6?(requestOnly()?'Send my request <span>→</span>':'Securely add my card <span>→</span>'):step===3?'Choose my time <span>→</span>':'Continue <span>→</span>';$('#underButton').textContent=step===6?(requestOnly()?'No card collected. No service booked yet.':'Secure checkout by Stripe · $0 service charge today'):'A fresh home. A schedule that fits your life.';notice('');const heading=$(`[data-step="${step}"] h2`);heading.tabIndex=-1;heading.focus({preventScroll:true});if(matchMedia('(max-width:760px)').matches&&step>0)$('.flow').scrollIntoView({behavior:'auto',block:'start'});}
function renderCalendar(){const y=month.getFullYear(),m=month.getMonth();$('#calendarMonth').textContent=month.toLocaleDateString('en-US',{month:'long',year:'numeric'});const days=new Date(y,m+1,0).getDate(),pad=new Date(y,m,1).getDay();let html='<span></span>'.repeat(pad);for(let n=1;n<=days;n++){const iso=`${y}-${String(m+1).padStart(2,'0')}-${String(n).padStart(2,'0')}`;html+=`<button type="button" data-date="${iso}" ${!context?.calendar||!Calendar.available(context.calendar,iso)?'disabled':''} aria-label="${esc(humanDate(iso))}" aria-pressed="${f.service_date.value===iso}">${n}</button>`;}$('#calendarDays').innerHTML=html;$('#prevMonth').disabled=y===tomorrow.getUTCFullYear()&&m===tomorrow.getUTCMonth();}

function applyCalendar(){const c=context.calendar,next=Calendar.next(c);f.service_date.min=c.first_date>Calendar.day(Date.now())?c.first_date:Calendar.add(Calendar.day(Date.now()),1);f.service_date.max=Calendar.add(Calendar.day(Date.now()),c.horizon_days);if(!f.service_date.value&&next)month=new Date(next+'T12:00:00');$('#calendarHelp').textContent=c.paused?c.pause_message:next?`Choose an arrival window at least ${c.notice_hours} hours ahead. Next available date: ${humanDate(next)}. All times are Eastern.`:'No dates are currently available. Please check back soon.';renderCalendar();renderSlots();}
function renderSlots(){const c=context?.calendar;if(!c)return;$('#arrivalSlots').innerHTML=c.slots.map((x,i)=>`<button type="button" data-slot="${i}" ${!f.service_date.value||Calendar.error(c,f.service_date.value,x.start,x.end)?'disabled':''}>${humanTime(x.start)}–${humanTime(x.end)}</button>`).join('');$('#customWindow').hidden=!c.allow_custom;$('#customWindow').open=c.allow_custom&&c.slots.length===0;f.arrival_start.readOnly=f.arrival_end.readOnly=!c.allow_custom;}
$('#arrivalSlots').onclick=e=>{const b=e.target.closest('[data-slot]');if(!b)return;const x=context.calendar.slots[Number(b.dataset.slot)];f.arrival_start.value=x.start;f.arrival_end.value=x.end;attempt=null;$('#selectedWindow').textContent=`Selected arrival: ${humanTime(x.start)}–${humanTime(x.end)}`;};

const parkingDialog=$('#guestParkingDialog'),parkingInput=$('#guestParkingInput');
function refreshGuestParking(){
 $('#guestParkingDetails').hidden=f.parking.value!=='guest';
 $('#guestParkingSummary').textContent=f.parking_instructions.value||'Add details to help your cleaner find a space.';
 $('#editGuestParking').textContent=f.parking_instructions.value?'Edit instructions':'Add instructions';
}
function openGuestParking(){parkingInput.value=f.parking_instructions.value;parkingInput.setCustomValidity('');if(!parkingDialog.open)parkingDialog.showModal();parkingInput.focus();}
$('#editGuestParking').onclick=openGuestParking;
$('#closeGuestParking').onclick=$('#cancelGuestParking').onclick=()=>parkingDialog.close();
parkingInput.oninput=()=>parkingInput.setCustomValidity('');
$('#guestParkingForm').onsubmit=e=>{e.preventDefault();const instructions=parkingInput.value.trim();if(!instructions){parkingInput.setCustomValidity('Add parking instructions so your cleaner can find a space.');parkingInput.reportValidity();return;}f.parking_instructions.value=instructions;attempt=null;refreshGuestParking();parkingDialog.close();};
form.addEventListener('change',e=>{if(e.target.name==='parking'){refreshGuestParking();if(f.parking.value==='guest')openGuestParking();}});
form.addEventListener('change',e=>{attempt=null;for(const [id,name,show] of [['petDetails','pet_details',f.pets.value==='yes'],['accessCode','access_code',f.access_method.value==='code'],['lockboxCode','lockbox_code',f.access_method.value==='lockbox']]){$('#'+id).hidden=!show;f[name].required=show;}if(e.target.name==='service'){resetScope();const recurring=['standard','deep'].includes(f.service.value);$('#frequencyGroup').hidden=!recurring;if(!recurring)f.frequency.value='once';}if(e.target.name==='service_date'&&f.service_date.value){month=new Date(f.service_date.value+'T12:00:00');month.setDate(1);renderCalendar();renderSlots();}});
form.addEventListener('input',e=>{attempt=null;notice('');if(['property_address','city','state','zip','beds','baths','sqft'].includes(e.target.name))f.property_confirmed.checked=false;});
$('#calendarDays').addEventListener('click',e=>{const day=e.target.closest('[data-date]');if(day){f.service_date.value=day.dataset.date;attempt=null;renderCalendar();renderSlots();}});
$('#prevMonth').onclick=()=>{month.setMonth(month.getMonth()-1);renderCalendar();};$('#nextMonth').onclick=()=>{month.setMonth(month.getMonth()+1);renderCalendar();};
history.replaceState({turnlyStep:0},'',location.href);
window.addEventListener('popstate',e=>{if(!form.hidden&&!busy)showStep(Math.max(0,Math.min(6,e.state?.turnlyStep||0)),false);});
$('#back').onclick=()=>{if(!busy&&step>0)history.back();};
function lock(value){busy=value;$('#next').disabled=value;$('#back').disabled=value;if(value)$('#next').textContent='Just a moment…';}
form.addEventListener('submit',async e=>{
 e.preventDefault();if(busy)return;notice('');
 if(step===6&&(!scopeReviewed||!f.scope_accepted.checked)){notice('Open and review your selected cleaning scope, then check the acceptance box to continue.',true);$('#scopeReview').querySelector('summary').focus();return;}
 if(step===0&&!addressFlow.hasAddress){notice('Choose a matching address or enter it manually.',true);$('#addressSearch').focus();return;}
 if(step===0&&addressFlow.loading){notice('We’re finding your home details. Please wait a moment.');return;}
 const visible=$(`[data-step="${step}"]`);for(const input of visible.querySelectorAll('input,textarea')){if(!input.closest('[hidden]')&&!input.reportValidity())return;}
 if(step===5&&f.parking.value==='guest'&&!f.parking_instructions.value.trim()){openGuestParking();return;}
 if(step===4){const message=Calendar.error(context.calendar,f.service_date.value,f.arrival_start.value,f.arrival_end.value);if(message){notice(message,true);return;}}
 if(step===4&&f.arrival_end.value<=f.arrival_start.value){notice('Choose an arrival window with an end time after its start time.',true);f.arrival_end.focus();return;}
 lock(true);
 try{
  if(step===3){context.calendar=(await api('availability')).calendar;applyCalendar();}
  if(step===0){const coverage=await api('coverage',values());outOfRange=!coverage.approved;$('#rangeNotice').hidden=!outOfRange;f.profile_address.value=[f.property_address.value,f.city.value,f.state.value,f.zip.value].join(', ');$('#coverageStatus').textContent=coverage.message;$('#coverageStatus').hidden=false;}
  if(step===2){quote=(await api('quote',values())).quote;if(outOfRange){delete quote.gift_cents;delete quote.card_charge_cents;}renderQuote();}
  if(step===5)renderReview();
  if(step===4&&outOfRange){renderReview();showStep(6);return;}
  if(step<6){showStep(step+1);return;}
  if(!attempt){const bytes=crypto.getRandomValues(new Uint8Array(32));attempt={id:crypto.randomUUID(),token:Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('')};}
  const result=await api(requestOnly()?'request':'checkout',{...values(),...attempt});
  if(result.url){const u=new URL(result.url);if(u.protocol!=='https:'||u.hostname!=='checkout.stripe.com')throw new Error('The secure checkout address was not recognized. Please contact Turnly.');location.assign(u.href);return;}
  if(result.out_of_range){form.hidden=true;$('#receipt').hidden=false;$('#receipt').innerHTML=`<h2>Your out-of-range request is saved.</h2><p>We don’t currently service this address. Your request helps us plan expansion, and Turnly can contact you about availability. No clean is booked, no card was collected, and no gift-card credit was used.</p><p>Reference: ${esc(result.request.id.slice(0,8).toUpperCase())}</p><a href="mailto:admin@turnlypros.com">Contact Turnly</a>`;$('#stepLabel').textContent='REQUEST RECEIVED';$('#stepCount').textContent='';$('#progressBar').style.width='100%';return;}
  renderReceipt(result.booking);
 }catch(err){notice(err.name==='TimeoutError'?'This is taking longer than expected. Please try again; your request won’t be duplicated.':err.message,true);}
 finally{lock(false);if(!form.hidden)$('#next').innerHTML=step===6?(requestOnly()?'Send my request <span>→</span>':'Securely add my card <span>→</span>'):step===3?'Choose my time <span>→</span>':'Continue <span>→</span>';}
});
function renderReceipt(b){form.hidden=true;const el=$('#receipt');el.hidden=false;const booked=['scheduled','completed'].includes(b.status),cardPending=b.status==='awaiting_card';$('#stepLabel').textContent=booked?'YOU’RE ON OUR CALENDAR':'YOUR REQUEST';$('#stepCount').textContent='';$('#progressBar').style.width='100%';el.innerHTML=`<div class="receipt-icon">${booked?'✓':'✧'}</div><h2>${booked?'Your fresh start is booked.':cardPending?'Finish saving your card.':b.status==='needs_reschedule'?'Let’s find a new date.':'Your request is with Turnly.'}</h2><p class="intro">${booked?'Your card is saved. Your service charge is scheduled for the morning of your clean.':cardPending?'Your visit is not booked yet. A card is required to reserve the clean.':b.status==='needs_reschedule'?'Your selected charge time has passed. Contact Turnly to arrange a new visit; no service charge was collected.':'We’ll contact you to finalize the details and collect your card securely before booking. No service has been reserved or charged.'}</p><div class="review-card"><h3>${esc(b.quote.service_label)}</h3>${rows([['Requested date',humanDate(b.service_date)],['Arrival window',`${humanTime(b.arrival_start)}–${humanTime(b.arrival_end)} ET`],['First-visit price',money(b.amount_cents)],...(b.gift_applied_cents?[['Gift card credit',money(b.gift_applied_cents)],['Payment card charge',money(b.card_charge_cents)]]:[]),['Referral',b.agent_name],['Reference',b.id.slice(0,8).toUpperCase()]])}</div>${cardPending?'<button type="button" class="primary" id="resumeCheckout" style="margin-top:22px">Return to secure card setup →</button>':''}<p class="receipt-contact">Need to make a change?<br><a href="mailto:admin@turnlypros.com">admin@turnlypros.com</a><br>Keep your reference number handy.</p>`;if(booked||['requested','review_required'].includes(b.status))mountAccount(el,b);el.focus({preventScroll:true});if(cardPending)$('#resumeCheckout').onclick=async()=>{try{const r=await api('resume',receiptParams||attempt);if(r.url&&new URL(r.url).hostname==='checkout.stripe.com')location.assign(r.url);}catch(e){notice(e.message,true);}};}
async function init(){
 $('#connectionError').hidden=true;$('#retry').disabled=true;
 try{
  const fragment=new URLSearchParams(location.hash.slice(1));if(fragment.has('booking')&&fragment.has('token')){receiptParams={id:fragment.get('booking'),token:fragment.get('token')};const r=await api('confirm',receiptParams);renderReceipt(r.booking);$('#referralBadge').textContent=r.booking.agent_name==='Turnly Residential'?'Booked with Turnly Residential':`Referred by ${r.booking.agent_name}`;return;}
  context=await api('context');applyCalendar();$('#referralBadge').textContent=context.gift?`Gift card applied automatically · ${money(context.gift.available_cents)} available`:context.ambassador?`Referred by ${context.ambassador.name}`:context.direct?'':`Referred by ${context.agent.name}`;$('#referralBadge').hidden=!$('#referralBadge').textContent;$('#baConsent').hidden=!context.ambassador;f.ba_consent.required=!!context.ambassador;if(gift)fetch('/api/gift-cards',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'scan',code:gift})}).catch(()=>{});$('#consentText').textContent=context.consent;syncGift();form.hidden=false;showStep(0);renderCalendar();
 }catch(e){$('#connectionError').hidden=false;$('#connectionMessage').textContent=e.name==='TimeoutError'?'The booking service took too long to respond. Please try again.':e.message;$('#referralBadge').textContent='Your fresh start with Turnly';}
 finally{$('#retry').disabled=false;}
}
$('#retry').onclick=init;init();

function mountAccount(el,b){
 const section=document.createElement('section');section.className='account-setup';
 section.innerHTML=`<h3>Keep your cleans in one place.</h3><p>Create your customer account to track upcoming visits, cleaning progress, and payments. Your email is your username.</p><form id="createAccount"><label>Email / username<input name="email" type="email" autocomplete="username" value="${esc(b.email||'')}" readonly></label><label>Choose a password<input name="password" type="password" autocomplete="new-password" minlength="12" maxlength="128" required placeholder="At least 12 characters"></label><p>Your booking is saved. Create your password, then sign in to manage your cleans.</p><button class="primary">Create my account →</button></form><p id="accountMessage" role="status"></p><p>Already have an account? <a href="customer.html">Sign in to My cleans</a></p>`;
 el.append(section);
 section.querySelector('a[href="customer.html"]').onclick=async e=>{e.preventDefault();try{await openCustomerLogin(b.email,'',false);}catch(error){section.querySelector('#accountMessage').textContent=error.message;}};
 section.querySelector('form').onsubmit=async e=>{e.preventDefault();const button=e.submitter,password=e.target.elements.password,output=section.querySelector('#accountMessage');button.disabled=true;output.textContent='Creating your account...';try{const response=await fetch('/api/residential-account',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'create',...(receiptParams||attempt),password:password.value}),signal:AbortSignal.timeout(30000)});const result=await response.json();if(!response.ok)throw new Error(result.error||'Please try again.');const chosen=result.created?password.value:'';password.value='';await openCustomerLogin(result.email,chosen,result.created);}catch(error){output.textContent=error.message;}finally{button.disabled=false;}};
}

window.addEventListener('hashchange',()=>{const next=new URLSearchParams(location.hash.slice(1)).get('gift');if(next&&next!==gift)location.reload();});

async function openCustomerLogin(email,password,created){
 const response=await fetch('/customer.html',{cache:'no-store'});
 if(!response.ok)throw new Error('Your account is ready. Open My cleans to sign in.');
 const page=new DOMParser().parseFromString(await response.text(),'text/html');
 page.querySelectorAll('script').forEach(el=>el.remove());
 document.head.replaceChildren(...page.head.childNodes);
 document.body.replaceChildren(...page.body.childNodes);
 history.replaceState(null,'','/customer.html');
 const portal=await import('./customer.mjs?v=20261020-booking');
 portal.prefillBookingLogin(email,password,created,{booking:(receiptParams||attempt).id,booking_token:(receiptParams||attempt).token});
 password='';
}
