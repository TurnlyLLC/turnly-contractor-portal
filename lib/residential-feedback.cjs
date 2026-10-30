const S=require('./residential-server.cjs');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const source='residential_tip';
const authorization='I authorize Turnly to charge my saved card for this optional tip. 100% of the tip goes to my cleaning contractor.';
function validateFeedback(input){
 const clean=Number(input.clean_rating),contractor=Number(input.contractor_rating),comments=String(input.comments||'').trim();
 if(![clean,contractor].every(n=>Number.isInteger(n)&&n>=1&&n<=5)||comments.length>2000)throw S.fail('Rate both your clean and your contractor from 1 to 5. Keep comments under 2,000 characters.');
 return {clean_rating:clean,contractor_rating:contractor,comments,submitted_at:new Date().toISOString()};
}
function tipAmount(input){
 if(input.authorized!==true||!Number.isSafeInteger(input.amount_cents)||input.amount_cents<100||input.amount_cents>100000)throw S.fail('Choose a tip from $1 to $1,000 and authorize the saved-card charge.');
 return input.amount_cents;
}
function publicTip(t){return t?{id:t.id,amount_cents:t.amount_cents,status:t.status,net_cents:t.net_cents,paid_at:t.paid_at}:null;}
async function detail(db,b){
 const f=S.checked(await db.from('residential_feedback').select('clean_rating,contractor_rating,comments,submitted_at,contractor_id').eq('booking_id',b.id).maybeSingle());
 const t=S.checked(await db.from('residential_booking_tips').select('*').eq('booking_id',b.id).maybeSingle());
 return {available:!!f&&b.status==='completed',can_tip:!!f?.contractor_id&&!!b.stripe_customer&&!!b.stripe_payment_method&&b.status==='completed',feedback:f?{clean_rating:f.clean_rating,contractor_rating:f.contractor_rating,comments:f.comments,submitted_at:f.submitted_at}:null,tip:publicTip(t)};
}
function paymentState(pi,t){
 if(pi.metadata?.source!==source||pi.metadata.tip_id!==t.id||pi.metadata.booking_id!==t.booking_id||pi.customer!==t.stripe_customer||pi.amount!==t.amount_cents||pi.currency!=='usd')throw S.fail('The tip payment needs review. No additional charge was made.',409);
 const charge=pi.latest_charge&&typeof pi.latest_charge==='object'?pi.latest_charge:null;
 if(charge?.disputed||t.status==='disputed')return {status:'disputed',net_cents:0};
 if(charge?.amount_refunded||t.status==='refunded')return {status:'refunded',net_cents:Math.min(t.status==='refunded'?t.net_cents:t.amount_cents,Math.max(0,t.amount_cents-Number(charge?.amount_refunded||0)))};
 if(pi.status==='succeeded'&&pi.amount_received===t.amount_cents)return {status:'succeeded',net_cents:t.amount_cents};
 return {status:pi.status==='requires_action'?'requires_action':pi.status==='processing'?'processing':['canceled','requires_payment_method'].includes(pi.status)?'failed':'pending',net_cents:0};
}
async function reconcile(db,st,id){
 const pi=await st.paymentIntents.retrieve(id,{expand:['latest_charge']});
 if(pi.metadata?.source!==source)return false;
 const t=S.checked(await db.from('residential_booking_tips').select('*').eq('id',pi.metadata.tip_id).single());
 const next=paymentState(pi,t);
 return S.checked(await db.rpc('sync_residential_tip',{p_id:t.id,p_intent:pi.id,p_status:next.status,p_net:next.net_cents}));
}
async function charge(db,st,b,input){
 const amount=tipAmount(input);
 let t=S.checked(await db.rpc('prepare_residential_tip',{p_booking:b.id,p_amount:amount,p_authorization:authorization}));
 if(t.stripe_payment_intent){
  t=await reconcile(db,st,t.stripe_payment_intent);
  // A failed/ambiguous charge is never replaced by a second PaymentIntent.
  if(t.status!=='pending')return {tip:publicTip(t)};
 }
 if(!t.stripe_payment_intent){
  if(Date.now()-Date.parse(t.created_at)>23*3600000)throw S.fail('This tip needs payment review. Contact Turnly before retrying.',409);
  const pm=await st.paymentMethods.retrieve(t.stripe_payment_method);
  if(pm.customer!==t.stripe_customer)throw S.fail('Your saved card needs review. No tip was charged.',409);
  const pi=await st.paymentIntents.create({amount:t.amount_cents,currency:'usd',customer:t.stripe_customer,payment_method:t.stripe_payment_method,allowed_payment_method_types:['card'],description:'Turnly cleaning contractor tip',receipt_email:b.email,metadata:{source,tip_id:t.id,booking_id:t.booking_id,contractor_id:t.contractor_id}},{idempotencyKey:'turnly-tip-create-'+t.id});
  S.checked(await db.from('residential_booking_tips').update({stripe_payment_intent:pi.id}).eq('id',t.id));t.stripe_payment_intent=pi.id;
 }
 try{await st.paymentIntents.confirm(t.stripe_payment_intent,{use_stripe_sdk:true},{idempotencyKey:'turnly-tip-confirm-'+t.id});}
 catch(e){if(!e.payment_intent)throw e;}
 t=await reconcile(db,st,t.stripe_payment_intent);
 return {tip:publicTip(t)};
}
async function run(db,b,input){
 const d=await detail(db,b);
 if(!d.available)throw S.fail('Feedback is available after your cleaning is completed.',409);
 if(input.action==='feedback_save'){
  S.checked(await db.from('residential_feedback').update(validateFeedback(input)).eq('booking_id',b.id));return {ok:true};
 }
 if(input.action==='tip')return charge(db,S.stripe(),b,input);
 if(input.action==='tip_status'){
  const t=S.checked(await db.from('residential_booking_tips').select('*').eq('booking_id',b.id).maybeSingle());
  return {tip:publicTip(t?.stripe_payment_intent?await reconcile(db,S.stripe(),t.stripe_payment_intent):t)};
 }
 if(input.action==='tip_auth'){
  const key=String(process.env.STRIPE_PUBLISHABLE_KEY||'');
  if(!/^pk_(live|test)_/.test(key))throw S.fail('Card verification is temporarily unavailable. Contact Turnly; no duplicate charge will be made.',503);
  const t=S.checked(await db.from('residential_booking_tips').select('*').eq('booking_id',b.id).single());
  if(!t.stripe_payment_intent)throw S.fail('Refresh the payment status first.',409);
  const pi=await S.stripe().paymentIntents.retrieve(t.stripe_payment_intent,{expand:['latest_charge']});
  paymentState(pi,t);
  if(pi.status!=='requires_action')return {refresh:true};
  return {publishable_key:key,client_secret:pi.client_secret};
 }
 throw S.fail('Unknown feedback action.');
}
function email(b){
 const url=S.ORIGIN+'/customer.html#feedback='+b.id;
 return {subject:'How did your Turnly clean go?',text:`Your cleaning is complete. Tell us how your home looks and how your contractor did. You can also leave an optional tip; 100% goes to your contractor. Sign in to review your clean: ${url}`,html:`<div style="background:#f3f7f7;padding:32px;font-family:Arial,sans-serif;color:#12344a"><div style="max-width:560px;background:white;padding:32px;border-radius:20px;margin:auto"><h2 style="color:#008577">Turnly Residential</h2><h1>How did your clean go?</h1><p>Hi ${esc(b.name)}, your clean on ${esc(b.service_date)} is complete.</p><p>Tell us how your home looks and how your contractor did. Your feedback goes to the Turnly team.</p><p>You can also leave an optional tip. <strong>100% goes to your contractor.</strong> Your saved card is charged only after you choose an amount and confirm.</p><a href="${esc(url)}" style="display:inline-block;background:#008577;color:white;padding:16px 24px;border-radius:10px;text-decoration:none">Review my clean</a><p style="font-size:12px;margin-top:28px">Sign in with your customer account. Need help? admin@turnlypros.com</p></div></div>`};
}
async function sendPending(db){
 if(!process.env.RESEND_API_KEY||!process.env.REFERRAL_FROM_EMAIL)return {sent:0,unconfigured:true};
 const rows=S.checked(await db.from('residential_feedback').select('booking_id,email_attempt_at').is('email_sent_at',null).order('created_at').limit(10));let sent=0;
 for(const f of rows){
  // Resend retains idempotency keys for 24 hours. Ambiguous older sends require
  // admin investigation instead of risking duplicate customer messages.
  if(f.email_attempt_at&&Date.now()-Date.parse(f.email_attempt_at)>23*3600000)continue;
  const b=S.checked(await db.from('referral_bookings').select('id,name,email,service_date,status,assignment_deleted_at').eq('id',f.booking_id).single());
  if(b.status!=='completed'||b.assignment_deleted_at)continue;
  if(!f.email_attempt_at)S.checked(await db.from('residential_feedback').update({email_attempt_at:new Date().toISOString()}).eq('booking_id',b.id).is('email_attempt_at',null));
  try{
   const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'residential-feedback-'+b.id},body:JSON.stringify({from:process.env.REFERRAL_FROM_EMAIL,to:[b.email],...email(b)}),signal:AbortSignal.timeout(15000)});
   if(!r.ok)continue;const value=await r.json();if(!value.id)continue;
   S.checked(await db.from('residential_feedback').update({email_sent_at:new Date().toISOString(),email_id:value.id}).eq('booking_id',b.id));sent++;
  }catch{console.error('Residential feedback email deferred.');}
 }
 return {sent};
}
module.exports={detail,run,charge,reconcile,paymentState,tipAmount,validateFeedback,publicTip,email,sendPending};
