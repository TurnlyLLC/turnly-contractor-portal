const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=c=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(c/100);
export function feedbackHtml(b){
 const a=b.aftercare;if(!a?.available)return '';
 const f=a.feedback||{},t=a.tip;
 const rating=(name,label,value)=>`<label>${label}<select name="${name}" required><option value="">Choose a rating</option>${[5,4,3,2,1].map(n=>`<option value="${n}" ${Number(value)===n?'selected':''}>${n} — ${['Poor','Fair','Good','Very good','Excellent'][n-1]}</option>`).join('')}</select></label>`;
 return `<section class="aftercare"><span class="chip">Your clean is complete</span><h2>How did we do?</h2><p>Your feedback helps Turnly care for your home.</p><form id="cleanFeedback">${rating('clean_rating','How did the cleaning go?',f.clean_rating)}${rating('contractor_rating','How well did your contractor do?',f.contractor_rating)}<label>Anything you’d like us to know? <span class="fine">Optional</span><textarea name="comments" maxlength="2000" rows="3">${esc(f.comments)}</textarea></label><button class="primary">${f.submitted_at?'Update feedback':'Send feedback'}</button></form><hr><h3>A little extra thank-you</h3><p>Tips are optional. <strong>100% goes to your contractor.</strong> Turnly covers processing fees.</p>${t?`<p class="notice">${money(t.amount_cents)} tip · ${esc({succeeded:'Thank you! Your tip has been received.',pending:'Checking payment',processing:'Payment processing',requires_action:'Your bank requires verification to finish this tip.',failed:'Payment was not completed. Contact Turnly for help.',refunded:'Payment adjusted — contact Turnly for details.',disputed:'Payment under review'}[t.status])}</p>${t.status==='requires_action'?'<button class="primary" id="verifyTip">Verify payment securely</button>':''}<button class="secondary" id="refreshTip">Refresh tip status</button>`:a.can_tip?`<form id="cleanTip"><div id="tipCard" class="fine">Loading your saved card…</div><label>Tip amount ($)<input name="amount" type="number" min="1" max="1000" step="0.01" inputmode="decimal" required placeholder="0.00"></label><label class="consent"><input type="checkbox" name="authorize" required><span>I authorize Turnly to charge my saved card for this optional tip.</span></label><button class="primary" id="chargeTip">Charge tip to saved card</button><p class="fine">Your cleaning charge stays unchanged. Gift cards cannot be used for tips.</p></form>`:'<p class="fine">Contact Turnly if you’d like help leaving a tip for this clean.</p>'}<p id="aftercareMessage" role="status" aria-live="polite"></p></section>`;
}
export async function bindFeedback(b,api,reload){
 const form=document.querySelector('#cleanFeedback');if(!form)return;
 const result=text=>{const el=document.querySelector('#aftercareMessage');if(el)el.textContent=text;};
 const perform=async(e,fn)=>{e.preventDefault();const button=e.submitter||e.currentTarget;if(button.disabled)return;button.disabled=true;try{await fn();}catch(err){result(err.message);}finally{if(button.isConnected)button.disabled=false;}};
 form.onsubmit=e=>perform(e,async()=>{await api('feedback_save',{id:b.id,...Object.fromEntries(new FormData(form))});result('Thank you! Your feedback has been saved.');form.querySelector('button').textContent='Update feedback';});
 const tip=document.querySelector('#cleanTip');
 if(tip){
  const button=tip.querySelector('button');button.disabled=true;
  try{const r=await api('payment',{id:b.id});if(!tip.isConnected)return;tip.querySelector('#tipCard').textContent=r.card?`${r.card.brand.toUpperCase()} ending in ${r.card.last4}`:'No saved card is available.';button.disabled=!r.card;}catch(e){result(e.message);}
  tip.elements.amount.oninput=()=>{button.textContent=Number(tip.elements.amount.value)>0?`Charge ${money(Math.round(Number(tip.elements.amount.value)*100))} tip`:'Charge tip to saved card';};
  tip.onsubmit=e=>perform(e,async()=>{const raw=tip.elements.amount.value;if(!/^\d+(\.\d{1,2})?$/.test(raw))throw new Error('Enter dollars and cents, such as 20.00.');await api('tip',{id:b.id,amount_cents:Math.round(Number(raw)*100),authorized:tip.elements.authorize.checked});await reload();});
 }
 const verify=document.querySelector('#verifyTip');if(verify)verify.onclick=e=>perform(e,async()=>{
  const r=await api('tip_auth',{id:b.id});if(r.refresh)return reload();
  if(!window.Stripe)await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://js.stripe.com/v3/';script.onload=resolve;script.onerror=()=>reject(new Error('Unable to load secure card verification. Please retry.'));document.head.append(script);});
  const check=await window.Stripe(r.publishable_key).confirmCardPayment(r.client_secret);if(check.error)throw new Error(check.error.message);
  await api('tip_status',{id:b.id});await reload();
 });
 const refresh=document.querySelector('#refreshTip');if(refresh)refresh.onclick=e=>perform(e,async()=>{await api('tip_status',{id:b.id});await reload();});
}
