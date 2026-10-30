import './booking-calendar-rules.js';
const rules=globalThis.TurnlyBookingCalendar;
export async function openBooking(ui,service='standard',anchorId=null,initialFrequency='once'){
 const {api,modal,esc,money,message,done}=ui;
 modal('Book your next clean','<p>Loading your saved homes and available arrival windows…</p>');
 const context=await api('booking_homes');
 if(!context.homes.length){modal('Book a new home','<p>Use our website to verify the address and import property details.</p><a class="primary" href="https://client.turnlypros.com/residential-referral.html">Book a new address ↗</a>');return;}
 const selected=context.homes.find(b=>b.id===anchorId);
 const homes=[...new Map([...(selected?[selected]:[]),...context.homes].reverse().map(b=>[b.property_address+','+b.zip,b])).values()];
 // Keep the chosen original visit, otherwise the latest saved visit for each home.
 if(selected){const i=homes.findIndex(b=>b.property_address===selected.property_address&&b.zip===selected.zip);homes[i]=selected;}
 const options=(rows,value)=>rows.map(([v,label])=>`<option value="${v}" ${v===value?'selected':''}>${label}</option>`).join('');
 modal('Book your next clean',`<form id="repeatBookingForm">
 <label>Saved home<select name="id">${homes.map(b=>`<option value="${b.id}" ${b.id===selected?.id?'selected':''}>${esc(b.property_address)}, ${esc(b.city)}</option>`).join('')}</select></label>
 <p><a href="https://client.turnlypros.com/residential-referral.html">Book a different address ↗</a> <small>Verify a new address and import its property details on our website.</small></p>
 <div class="form-row"><label>Bedrooms<input name="beds" type="number" min="0" max="30" step="1" required></label><label>Bathrooms<input name="baths" type="number" min="0.5" max="30" step="0.5" required></label></div><label>Finished square feet to clean<input name="sqft" type="number" min="100" max="50000" step="1" required></label><label>Service<select name="service">${options([['standard','Standard cleaning'],['deep','Deep cleaning'],['move','Move-in / move-out'],['listing','Listing / staging']],service)}</select></label>
 <section class="repeat-savings"><h3>A regularly clean home. A lower price.</h3><p>Choose recurring standard cleaning and save on every scheduled visit.</p><div id="frequencyChoices" class="frequency-choices"></div><p id="preferredCleaner" class="fine"></p><p class="fine">This starts your next visit or plan. Your existing cleaning stays in place.</p></section>
 <div id="repeatQuote" class="notice" aria-live="polite">Loading price…</div>
 <label>First service date<input name="service_date" type="date" required></label>
 <label>Arrival window (Eastern)<select name="window" required></select></label><div id="customWindow" class="form-row" hidden><label>From<input type="time" name="arrival_start"></label><label>Until<input type="time" name="arrival_end"></label></div>
 <fieldset><legend>Is your home information still correct?</legend><p>We loaded your previous answers. Review and update anything that has changed.</p>
 <label>Pets<select name="pets" required>${options([['','Choose an answer'],['yes','Yes'],['no','No']],'')}</select></label><label id="petDetails">Pet details<textarea name="pet_details" maxlength="600"></textarea></label>
 <label>Parking<select name="parking" required>${options([['','Choose parking'],['driveway','Driveway'],['street','Street parking'],['guest','Guest parking'],['none','No parking available']],'')}</select></label><label id="parkingDetails">Guest parking instructions<textarea name="parking_instructions" maxlength="600"></textarea></label>
 <label>How will your cleaner enter?<select name="access_method" required>${options([['','Choose access'],['resident','I will let the cleaner in'],['code','Access code'],['lockbox','Lockbox']],'')}</select></label>
 <label id="accessDetails">Access code<input name="access_code" maxlength="120"></label><label id="lockboxDetails">Lockbox code<input name="lockbox_code" maxlength="120"></label>
 <label>Cleaning notes<textarea name="notes" maxlength="1500"></textarea></label>
 <label class="consent"><input type="checkbox" name="details_confirmed" required><span>I reviewed these details and they are correct for this visit.</span></label></fieldset>
 <label>Gift card code (optional)<input name="gift" autocomplete="off" placeholder="Enter your Turnly gift card code"></label><button type="button" class="secondary" id="applyGift">Apply / refresh gift credit</button>
 <p class="fine">Gift credit applies to this visit only. Future recurring visits use your saved payment card.</p>
 <label class="consent"><input type="checkbox" name="consent" required><span>${esc(context.consent)}</span></label>
 <button class="primary" id="repeatSubmit" disabled>Confirm booking</button></form>`);
 const f=document.querySelector('#repeatBookingForm'),el=n=>f.elements.namedItem(n),find=s=>f.querySelector(s);
 let quote=null,version=0,requestId=crypto.randomUUID(),frequency=initialFrequency;
 function details(){for(const [id,name,enabled] of [['petDetails','pet_details',el('pets').value==='yes'],['parkingDetails','parking_instructions',el('parking').value==='guest'],['accessDetails','access_code',el('access_method').value==='code'],['lockboxDetails','lockbox_code',el('access_method').value==='lockbox']]){find('#'+id).hidden=!enabled;el(name).required=enabled;}}
 function windows(){const day=el('service_date').value,old=el('window').value;el('window').innerHTML=context.calendar.slots.filter(s=>!rules.error(context.calendar,day,s.start,s.end)).map(s=>`<option value="${s.start}|${s.end}">${s.start} – ${s.end}</option>`).join('')+(context.calendar.allow_custom?'<option value="custom">Choose a custom arrival window</option>':'');if([...el('window').options].some(o=>o.value===old))el('window').value=old;windowChanged();}
 function windowChanged(){const custom=el('window').value==='custom';find('#customWindow').hidden=!custom;el('arrival_start').required=custom;el('arrival_end').required=custom;if(!custom){const [start,end]=(el('window').value||'|').split('|');el('arrival_start').value=start;el('arrival_end').value=end;}}
 function fill(){const b=homes.find(b=>b.id===el('id').value),v=b.visit_details||{};for(const name of ['pets','pet_details','parking','parking_instructions','access_method','access_code','lockbox_code'])el(name).value=v[name]||'';el('notes').value=b.notes||'';for(const name of ['beds','baths','sqft'])el(name).value=b[name]??'';el('details_confirmed').checked=false;details();find('#preferredCleaner').textContent=b.job?.cleaner?`We’ll request ${b.job.cleaner} as your preferred cleaner for recurring visits, subject to availability.`:'We’ll help match your recurring visits with a preferred cleaner.';}
 async function refresh(){const v=++version;quote=null;find('#repeatSubmit').disabled=true;try{const r=await api('quote',{id:el('id').value,service:el('service').value,frequency,sqft:el('sqft').value,gift:el('gift').value});if(v!==version||!f.isConnected)return;quote=r.quote;
  const frequencies=el('service').value==='standard'?[['once','One time'],['monthly','Monthly'],['biweekly','Every two weeks'],['weekly','Weekly']]:[['once','One time']];
  find('#frequencyChoices').innerHTML=frequencies.map(([value,label])=>{const p=el('service').value!=='standard'?quote:r.options?.[value]||quote;return `<label class="frequency-card"><input type="radio" name="frequency" value="${value}" ${frequency===value?'checked':''}><strong>${label}</strong><span>${money(p.amount_cents)} / visit</span>${p.savings_cents?`<small>Save ${money(p.savings_cents)} per visit</small>`:''}</label>`;}).join('');
  find('#repeatQuote').innerHTML=`<strong>${esc(quote.service_label)} · ${money(quote.amount_cents)}${frequency==='once'?'':' per visit'}</strong>${quote.gift_cents?`<br>Gift credit: −${money(quote.gift_cents)}`:''}<br>Saved card charge for this visit: ${money(quote.card_charge_cents)}${quote.review_required?'<br>This home needs a custom quote. Contact Turnly.':!r.card_saved?'<br>Save a card on your existing booking before rebooking.':''}`;
  find('#repeatSubmit').disabled=!r.card_saved||quote.review_required;
 }catch(e){message(e.message,true);}}
 el('service_date').min=rules.next(context.calendar)||'';el('service_date').value=el('service_date').min;
 f.addEventListener('input',()=>{requestId=crypto.randomUUID();});
 f.addEventListener('change',e=>{const name=e.target.name;if(name==='id'){fill();refresh();}if(name==='service'){frequency='once';refresh();}if(name==='frequency'){frequency=e.target.value;refresh();}if(['gift','sqft','beds','baths'].includes(name))refresh();if(name==='service_date')windows();if(name==='window')windowChanged();details();});
 for(const name of ['gift','sqft','beds','baths'])el(name).addEventListener('input',()=>{quote=null;find('#repeatSubmit').disabled=true;});
 find('#applyGift').onclick=refresh;
 f.onsubmit=async e=>{e.preventDefault();if(!f.reportValidity()||!quote)return;const error=rules.error(context.calendar,el('service_date').value,el('arrival_start').value,el('arrival_end').value);if(error)return message(error,true);find('#repeatSubmit').disabled=true;try{const r=await api('book',{...Object.fromEntries(new FormData(f)),frequency,request_id:requestId,gift_expected_cents:quote.gift_cents,consent:el('consent').checked,details_confirmed:el('details_confirmed').checked});await done(r.id);}catch(e){message(e.message,true);find('#repeatSubmit').disabled=false;}};
 fill();windows();await refresh();
}

export async function buyGift(ui,account){
 const {modal,esc,money,message,goStripe}=ui;
 const call=async(action,data={})=>{const r=await fetch('/api/gift-cards',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...data})});const v=await r.json();if(!r.ok)throw Error(v.error||'Unable to open gift checkout.');return v;};
 const config=await call('config');
 modal('Give the gift of a clean home',`<form id="portalGiftForm"><p>Each Turnly gift card is worth <strong>$100</strong>. Cards are delivered to your email to print or share.</p><label>Your name<input name="name" value="${esc(account.name)}" required maxlength="160"></label><label>Delivery email<input name="email" type="email" value="${esc(account.email)}" required></label><label>Confirm email<input name="confirm_email" type="email" value="${esc(account.email)}" required></label><label>Number of $100 cards<input name="quantity" type="number" min="1" max="25" step="1" value="1" required></label><p id="giftTotal">Total: $100.00</p><label class="consent"><input name="accepted" type="checkbox" required><span>I accept the <a href="/gift-card-terms.html" target="_blank" rel="noopener">Gift Card Terms</a>. Gift cards are for eligible North Carolina service areas.</span></label><button class="primary" ${config.ready?'':'disabled'}>Continue to secure checkout</button>${config.ready?'':'<p>Gift checkout is temporarily unavailable.</p>'}</form>`);
 const f=document.querySelector('#portalGiftForm');let attempt=null;
 f.oninput=()=>{attempt=null;f.querySelector('#giftTotal').textContent='Total: '+money(Number(f.elements.quantity.value)*10000);};
 f.onsubmit=async e=>{e.preventDefault();if(!f.reportValidity())return;if(f.elements.email.value.trim().toLowerCase()!==f.elements.confirm_email.value.trim().toLowerCase())return message('The email addresses do not match.',true);const button=f.querySelector('button');button.disabled=true;try{if(!attempt)attempt={id:crypto.randomUUID(),token:Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('')};const r=await call('checkout',{...attempt,name:f.elements.name.value,email:f.elements.email.value,quantity:Number(f.elements.quantity.value),accepted:true,terms:config.terms,buyer_kind:'other'});goStripe(r.url,'checkout.stripe.com');}catch(e){message(e.message,true);button.disabled=false;}};
}
