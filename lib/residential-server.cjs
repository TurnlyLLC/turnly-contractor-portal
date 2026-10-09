const {createClient}=require('@supabase/supabase-js');
const {createHash}=require('node:crypto');
const {clean,email,phone,uuid,codeValid,ORIGIN}=require('./agent-referrals.cjs');
const {quote,schedule}=require('./residential-pricing.cjs');
const checked=r=>{if(r.error)throw Object.assign(new Error('Unable to save or load your booking. Please try again.'),{status:503});return r.data;};
const hash=v=>createHash('sha256').update(String(v)).digest('hex');
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
function database(){const key=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SERVICE_KEY||process.env.SUPABASE_SERVICE_ROLE||process.env.SUPABASE_SECRET_KEY;if(!key)throw fail('Booking service is temporarily unavailable.',503);return createClient(process.env.SUPABASE_URL||'https://nwnzdoveskthebfyndcs.supabase.co',key,{auth:{persistSession:false,autoRefreshToken:false}});}
// The initial production setting was saved as STRIP_SECRET_KEY; support it without exposing or copying the secret.
const stripeKey=()=>String(process.env.STRIPE_SECRET_KEY||process.env.STRIP_SECRET_KEY||'').trim();
function stripe(){if(!stripeKey())throw fail('Secure card booking is being connected. Please request a booking below; no reservation or charge will be made yet.',503);return require('stripe')(stripeKey(),{apiVersion:'2026-09-30.endive',maxNetworkRetries:1,timeout:18000});}
function ready(){return !!(/^(sk|rk)_live_/.test(stripeKey())&&process.env.STRIPE_WEBHOOK_SECRET&&process.env.CRON_SECRET&&process.env.RESIDENTIAL_PAYMENTS_ENABLED==='true');}
async function body(req){if(req.body&&typeof req.body==='object'&&!Buffer.isBuffer(req.body))return req.body;let raw=req.body||'';if(!raw)for await(const chunk of req){raw+=chunk.toString();if(Buffer.byteLength(raw)>20000)throw fail('Request is too large.');}if(Buffer.byteLength(raw)>20000)throw fail('Request is too large.');return JSON.parse(raw||'{}');}
function json(res,status,data){res.statusCode=status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(data));}
async function rate(db,req,action){const ip=String(req.headers['x-vercel-forwarded-for']||req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0];if(!checked(await db.rpc('allow_referral_request',{p_key:hash('residential:'+action+':'+ip)})))throw fail('Too many requests. Please try again later.',429);}
async function agent(db,code){if(!codeValid(code))throw fail('Please use the complete link from your agent’s flyer.');const a=checked(await db.from('referral_agents').select('id,name,referral_code').eq('referral_code',code).eq('status','active').maybeSingle());if(!a)throw fail('This agent’s referral link is inactive. Contact Turnly for help.',404);return a;}
async function admin(db,req){const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');if(!token)throw fail('Sign in to the admin portal.',401);const auth=await db.auth.getUser(token);if(auth.error||!auth.data?.user)throw fail('Please sign in again.',401);const p=checked(await db.from('profiles').select('role,status').eq('id',auth.data.user.id).maybeSingle());if(!p||!['admin','owner','super_admin'].includes(p.role)||['inactive','disabled','suspended','rejected'].includes(p.status))throw fail('Active admin access is required.',403);return auth.data.user.id;}
function validate(input){
  const q=quote(input),s=schedule(input),name=clean(input.name,160),em=email(input.email),ph=phone(input.phone);
  const address=clean(input.property_address,300),city=clean(input.city,100),state=clean(input.state,2).toUpperCase(),zip=clean(input.zip,10),profile=clean(input.profile_address,500);
  if(!name||!em||!ph||!address||!city||!/^[A-Z]{2}$/.test(state)||!/^\d{5}(-\d{4})?$/.test(zip)||!profile)throw fail('Enter your contact details and complete property address.');
  const beds=Number(input.beds),baths=Number(input.baths);if(!Number.isInteger(beds)||beds<0||beds>30||!Number.isFinite(baths)||baths<.5||baths>30||baths*2%1)throw fail('Enter valid bedroom and bathroom counts.');
  if(input.property_confirmed!==true)throw fail('Confirm the home details and square footage.');
  return {name,email:em,phone:ph,profile_address:profile,property_address:address,city,state,zip,beds,baths,sqft:q.sqft,service:q.service,frequency:q.frequency,quote:q,amount_cents:q.amount_cents,service_date:s.service_date,arrival_start:s.arrival_start,arrival_end:s.arrival_end,charge_at:new Date(s.charge_at).toISOString(),notes:clean(input.notes,1800),visit_details:require('./residential-visit.cjs').visitDetails(input)};
}
async function owned(db,input){if(!uuid(input.id)||!/^[-a-zA-Z0-9_]{40,100}$/.test(String(input.token||'')))throw fail('Use your original booking link.',403);const b=checked(await db.from('referral_bookings').select('*').eq('id',input.id).eq('token_hash',hash(input.token)).maybeSingle());if(!b)throw fail('Booking not found.',404);return b;}
function summary(b){return {id:b.id,email:b.email,status:b.status,payment_status:b.payment_status,service_date:b.service_date,arrival_start:b.arrival_start,arrival_end:b.arrival_end,amount_cents:b.amount_cents,quote:b.quote,card_saved:!!b.stripe_payment_method,agent_name:b.agent_name};}
async function reconcileSession(db,st,sessionId){
  const session=await st.checkout.sessions.retrieve(sessionId,{expand:['setup_intent']});
  if(session.mode!=='setup'||session.status!=='complete'||session.setup_intent?.status!=='succeeded')return null;
  const b=checked(await db.from('referral_bookings').select('*').eq('stripe_session',session.id).maybeSingle());if(!b)return null;
  const si=session.setup_intent;
  if(session.client_reference_id!==b.id||session.metadata?.booking_id!==b.id||session.customer!==b.stripe_customer||si.customer!==b.stripe_customer||!si.payment_method)throw fail('Card confirmation did not match the booking.',409);
  if(b.status==='awaiting_card'){
    const expired=new Date(b.charge_at)<=new Date();
    checked(await db.from('referral_bookings').update({stripe_payment_method:typeof si.payment_method==='string'?si.payment_method:si.payment_method.id,status:expired?'needs_reschedule':'scheduled',payment_status:'card_saved'}).eq('id',b.id).eq('status','awaiting_card'));
  }
  const current=checked(await db.from('referral_bookings').select('*').eq('id',b.id).maybeSingle());
  if(current?.status==='scheduled'){
    try{await require('./residential-jobs.cjs').syncBooking(db,current);}
    catch{console.error('Residential assignment creation deferred to reconciliation.');}
  }
  return b.id;
}
async function reconcilePayment(db,st,intentId){
  const pi=await st.paymentIntents.retrieve(intentId,{expand:['latest_charge']});
  const id=pi.metadata?.booking_id;if(!uuid(id))return;
  const b=checked(await db.from('referral_bookings').select('*').eq('id',id).maybeSingle());
  if(!b||pi.customer!==b.stripe_customer||pi.currency!=='usd'||pi.amount!==b.amount_cents||pi.metadata?.charge_key!==b.charge_key||(b.stripe_payment_intent&&b.stripe_payment_intent!==pi.id))throw fail('Payment does not match its booking.',409);
  const charge=pi.latest_charge;
  const refunded=charge&&typeof charge==='object'&&(charge.refunded||charge.amount_refunded>0||charge.disputed);
  const paid=pi.status==='succeeded'&&pi.amount_received===b.amount_cents&&!refunded;
  checked(await db.from('referral_bookings').update({stripe_payment_intent:pi.id,payment_status:refunded?'adjusted':paid?'paid':['requires_payment_method','requires_action','canceled'].includes(pi.status)?'action_required':'processing',paid_at:paid?new Date().toISOString():null,charge_locked_at:null}).eq('id',b.id));
}
module.exports={checked,hash,fail,database,stripe,ready,body,json,rate,agent,admin,validate,owned,summary,reconcileSession,reconcilePayment,ORIGIN};
