const S=require('../lib/residential-server.cjs');
const {uuid,clean}=require('../lib/agent-referrals.cjs');
const {quote}=require('../lib/residential-pricing.cjs');
const CONSENT='I authorize Turnly to save my card and charge the displayed total on the morning of my selected service date (6am Eastern, or at the start of an earlier arrival window). No service charge is collected today. Changes to the price require my approval. Future recurring visits will be arranged separately.';
module.exports=async(req,res)=>{
 if(req.method!=='POST')return S.json(res,405,{error:'Method not allowed.'});
 try{
  const input=await S.body(req),db=S.database();
  if(['admin_list','admin_complete','admin_cancel','admin_sync'].includes(input.action)){
   const actor=await S.admin(db,req);
   if(input.action==='admin_list'){
    const page=Math.max(1,Math.floor(Number(input.page)||1));let q=db.from('referral_bookings').select('id,name,email,phone,profile_address,property_address,city,state,zip,beds,baths,sqft,service,frequency,quote,amount_cents,service_date,arrival_start,arrival_end,status,payment_status,agent_name,referral_code,notes,created_at,stripe_payment_intent,stripe_session,paid_at,completed_at',{count:'exact'}).order('created_at',{ascending:false});
    if(input.status)q=q.eq('status',input.status);const r=await q.range((page-1)*25,page*25-1);S.checked(r);return S.json(res,200,{bookings:r.data,total:r.count,page,payments_ready:S.ready()});
   }
   if(!uuid(input.id))throw S.fail('Choose a booking.');
   if(input.action==='admin_sync'){
    const b=S.checked(await db.from('referral_bookings').select('stripe_session,stripe_payment_intent').eq('id',input.id).single());const st=S.stripe();
    if(b.stripe_session)await S.reconcileSession(db,st,b.stripe_session);if(b.stripe_payment_intent)await S.reconcilePayment(db,st,b.stripe_payment_intent);
   }else S.checked(await db.rpc('finish_residential_booking',{p_id:input.id,p_actor:actor,p_cancel:input.action==='admin_cancel'}));
   return S.json(res,200,{ok:true});
  }
  if(['confirm','resume'].includes(input.action)){
   await S.rate(db,req,'confirm');let b=await S.owned(db,input);
   if(input.action==='resume'){
    if(b.status!=='awaiting_card'||!b.stripe_session)throw S.fail('Contact Turnly to finish this booking.');
    const session=await S.stripe().checkout.sessions.retrieve(b.stripe_session);
    if(session.status!=='open'||!session.url)throw S.fail('This checkout has ended. Contact Turnly to arrange your visit.');
    return S.json(res,200,{url:session.url});
   }
   if(b.stripe_session)await S.reconcileSession(db,S.stripe(),b.stripe_session);
   b=await S.owned(db,input);return S.json(res,200,{booking:S.summary(b)});
  }
  const a=await S.agent(db,input.code);
  if(input.action==='context')return S.json(res,200,{agent:{name:a.name,code:a.referral_code},payments_ready:S.ready(),property_lookup:!!process.env.RENTCAST_API_KEY,consent:CONSENT});
  if(input.action==='property'){await S.rate(db,req,'property');return S.json(res,200,await require('../lib/residential-property.cjs').lookup(input));}
  if(input.action==='quote'){await S.rate(db,req,'quote');return S.json(res,200,{quote:quote(input)});}
  if(!['checkout','request'].includes(input.action))throw S.fail('Unknown booking action.');
  await S.rate(db,req,'book');if(input.website)throw S.fail('Unable to submit this request.');
  if(!uuid(input.id)||!/^[-a-zA-Z0-9_]{40,100}$/.test(String(input.token||'')))throw S.fail('Refresh this page and try again.');
  const data=S.validate(input),checkout=input.action==='checkout';
  if(checkout&&(!S.ready()||data.quote.review_required))throw S.fail('This booking needs a request first. Please go back and request a review.',409);
  if(checkout&&input.consent!==true)throw S.fail('Authorize the service-date charge to continue.');
  const status=data.quote.review_required?'review_required':checkout?'awaiting_card':'requested';
  S.checked(await db.rpc('create_residential_booking',{p_id:input.id,p_token:S.hash(input.token),p_hash:S.hash(JSON.stringify({data,status})),p_code:input.code,p_data:data,p_status:status,p_consent:checkout?CONSENT:null}));
  let b=await S.owned(db,input);
  if(!checkout)return S.json(res,200,{booking:S.summary(b)});
  if(b.status!=='awaiting_card')return S.json(res,200,{booking:S.summary(b)});
  const st=S.stripe();
  if(!b.stripe_customer){const customer=await st.customers.create({name:b.name,email:b.email,phone:b.phone,metadata:{booking_id:b.id,agent_id:b.agent_id}},{idempotencyKey:`residential-customer-${b.id}`});S.checked(await db.from('referral_bookings').update({stripe_customer:customer.id}).eq('id',b.id));b.stripe_customer=customer.id;}
  if(b.stripe_session){const session=await st.checkout.sessions.retrieve(b.stripe_session);if(session.status==='open'&&session.url)return S.json(res,200,{url:session.url});throw S.fail('This checkout has ended. Contact Turnly to reopen your request.',409);}
  const receipt=`${S.ORIGIN}/residential-referral.html?ref=${encodeURIComponent(input.code)}#booking=${b.id}&token=${encodeURIComponent(input.token)}`;
  const session=await st.checkout.sessions.create({mode:'setup',currency:'usd',customer:b.stripe_customer,payment_method_types:['card'],client_reference_id:b.id,metadata:{booking_id:b.id,agent_id:b.agent_id,referral_code:b.referral_code},setup_intent_data:{metadata:{booking_id:b.id,agent_id:b.agent_id}},success_url:receipt,cancel_url:receipt+'&cancelled=1',custom_text:{submit:{message:`Save your card to reserve your clean. $${(b.amount_cents/100).toFixed(2)} will be charged on ${b.service_date}, not today.`}}},{idempotencyKey:`residential-setup-${b.id}`});
  S.checked(await db.from('referral_bookings').update({stripe_session:session.id}).eq('id',b.id));
  return S.json(res,200,{url:session.url});
 }catch(e){return S.json(res,e.status||400,{error:e.type?'The card service could not complete this step. Please try again or contact Turnly.':e.message||'Unable to complete this request.'});}
};
