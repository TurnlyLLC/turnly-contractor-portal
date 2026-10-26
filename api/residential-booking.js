const S=require('../lib/residential-server.cjs');
const {uuid,clean}=require('../lib/agent-referrals.cjs');
const J=require('../lib/residential-jobs.cjs');
const G=require('../lib/gift-cards.cjs');
const {quote}=require('../lib/residential-pricing.cjs');
const CONSENT='I authorize Turnly to save my card and charge the displayed total on the morning of my selected service date (6am Eastern, or at the start of an earlier arrival window). No service charge is collected today. Changes to the price require my approval. Future recurring visits will be arranged separately.';
module.exports=async(req,res)=>{
 if(req.method!=='POST')return S.json(res,405,{error:'Method not allowed.'});
 try{
  const input=await S.body(req);
  if(input.action==='address_suggestions')return S.json(res,200,await require('../lib/residential-address.cjs').publicSuggest(input,req));
  const db=S.database();
  if(input.action==='coverage'){await S.rate(db,req,'coverage');return S.json(res,200,await require('../lib/service-coverage.cjs').verify(input));}
  if(['admin_list','admin_inquiries','admin_clients','admin_approve_job','admin_complete','admin_cancel','admin_sync'].includes(input.action)){
   const actor=await S.admin(db,req);
   if(input.action==='admin_inquiries'){
    const page=Math.max(1,Math.floor(Number(input.page)||1));
    const r=await db.from('residential_inquiries').select('id,payload,created_at',{count:'exact'}).order('created_at',{ascending:false}).range((page-1)*25,page*25-1);S.checked(r);
    return S.json(res,200,{inquiries:r.data,total:r.count,page});
   }
   if(input.action==='admin_clients'){
    const page=Math.max(1,Math.floor(Number(input.page)||1));
    let q=db.from('referral_customers').select('id,name,email,phone,created_at,referral_agents(name,referral_code)',{count:'exact'}).order('created_at',{ascending:false});
    if(clean(input.search))q=q.ilike('name','%'+clean(input.search,100).replace(/[%,_\\]/g,'')+'%');
    const r=await q.range((page-1)*25,page*25-1);S.checked(r);
    const clients=await Promise.all(r.data.map(async c=>{
      const latest=await db.from('referral_bookings').select('id,profile_address,property_address,city,state,zip,status,service_date',{count:'exact'}).eq('customer_id',c.id).is('assignment_deleted_at',null).neq('status','cancelled').order('created_at',{ascending:false}).limit(1);S.checked(latest);
      return {...c,latest_booking:latest.data[0]||null,booking_count:latest.count};
    }));return S.json(res,200,{clients,total:r.count,page});
   }
   if(input.action==='admin_list'){
    const page=Math.max(1,Math.floor(Number(input.page)||1));let q=db.from('referral_bookings').select('id,customer_id,name,email,phone,profile_address,property_address,city,state,zip,beds,baths,sqft,service,frequency,quote,amount_cents,gift_applied_cents,service_date,arrival_start,arrival_end,charge_at,status,payment_status,agent_name,referral_code,notes,visit_details,assignment_deleted_at,created_at,stripe_payment_intent,stripe_session,paid_at,completed_at',{count:'exact'}).order('created_at',{ascending:false});
    q=q.is('assignment_deleted_at',null).neq('status','cancelled');
    if(input.booking_id){if(!uuid(input.booking_id))throw S.fail('Choose a booking.');q=q.eq('id',input.booking_id);}
    if(input.status)q=q.eq('status',input.status);
    if(input.customer_id){if(!uuid(input.customer_id))throw S.fail('Choose a customer.');q=q.eq('customer_id',input.customer_id);}
    const r=await q.range((page-1)*25,page*25-1);S.checked(r);
    const bookings=await Promise.all(r.data.map(async b=>{try{return {...b,job:await J.syncBooking(db,b,actor)};}catch{return {...b,job_error:'Job synchronization needs attention. Refresh to retry.'};}}));
    return S.json(res,200,{bookings:bookings.filter(b=>!['cancelled','canceled','declined'].includes(b.job?.status)),total:r.count,page,payments_ready:S.ready()});
   }
   if(!uuid(input.id))throw S.fail('Choose a booking.');
   if(input.action==='admin_approve_job'){
    const b=S.checked(await db.from('referral_bookings').select('*').eq('id',input.id).single());
    let pay;try{pay=J.contractorPay(b);}catch(e){throw S.fail(e.message,409);}
    if(b.status!=='scheduled')throw S.fail('Only a confirmed booking can be released to contractors.');
    const job=await J.syncBooking(db,b,actor);if(!job||job.status!=='pending')throw S.fail('This job is no longer awaiting approval.');
    let checklistReview;try{checklistReview=J.approvalChecklistReview(job,input,actor);}catch(e){throw S.fail(e.message,409);}
    S.checked(await db.from('assignment_blocks').update({pay_amount:pay,status:'open',visibility:'open',metadata:{...job.metadata,...checklistReview,...J.contractorPayMetadata(b),admin_approval_status:'approved',approved_by:actor,approved_at:new Date().toISOString()}}).eq('id',b.id).eq('status','pending'));
    return S.json(res,200,{ok:true});
   }
   if(input.action==='admin_sync'){
    const b=S.checked(await db.from('referral_bookings').select('stripe_session,stripe_payment_intent').eq('id',input.id).single());const st=S.stripe();
    if(b.stripe_session)await S.reconcileSession(db,st,b.stripe_session);if(b.stripe_payment_intent)await S.reconcilePayment(db,st,b.stripe_payment_intent);
   }else S.checked(await db.rpc('finish_residential_booking',{p_id:input.id,p_actor:actor,p_cancel:input.action==='admin_cancel'}));
   const updated=S.checked(await db.from('referral_bookings').select('*').eq('id',input.id).single());await J.syncBooking(db,updated,actor);
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
   b=await S.owned(db,input);const referral=S.checked(await db.from('ba_leads').select('ba_members(name)').eq('first_booking_id',b.id).maybeSingle());return S.json(res,200,{booking:{...S.summary(b),...(referral?.ba_members?.name?{agent_name:referral.ba_members.name}:{})}});
  }
  const gift=input.gift?await G.card(db,input.gift):null;
  if(gift&&gift.status!=='active')throw S.fail('This gift card is not available. Contact Turnly.',409);
  const direct=!gift&&!input.code;
  const a=gift?{name:'Turnly gift card',referral_code:''}:direct?{name:'Turnly Residential',referral_code:''}:await S.agent(db,input.code);
  let ambassador=null;
  if(input.ba){
   if(!/^BA-[A-Z0-9]{16}$/.test(String(input.ba)))throw S.fail('Use the complete ambassador referral link.');
   ambassador=await require('../lib/ambassadors.cjs').referralMember(db,input.ba);
   if(!ambassador)throw S.fail('This ambassador referral link is unavailable.',404);
  }
  if(input.action==='context')return S.json(res,200,{agent:{name:a.name,code:a.referral_code},ambassador,direct,payments_ready:S.ready(),property_lookup:!!process.env.RENTCAST_API_KEY,gift:gift?{balance_cents:gift.balance_cents,available_cents:gift.balance_cents-gift.reserved_cents}:null,consent:gift?CONSENT+' I authorize application of my gift card to this visit; only the remaining amount will be charged to my saved card.':CONSENT});
  if(input.action==='property'){await S.rate(db,req,'property');return S.json(res,200,await require('../lib/residential-property.cjs').lookup(input));}
  if(input.action==='quote'){await S.rate(db,req,'quote');const q=quote(input);if(gift&&String(input.state).toUpperCase()==='NC'){q.gift_cents=Math.min(q.amount_cents,gift.balance_cents-gift.reserved_cents);q.card_charge_cents=q.amount_cents-q.gift_cents;}return S.json(res,200,{quote:q});}
  if(!['checkout','request'].includes(input.action))throw S.fail('Unknown booking action.');
  await S.rate(db,req,'book');if(input.website)throw S.fail('Unable to submit this request.');
  if(!uuid(input.id)||!/^[-a-zA-Z0-9_]{40,100}$/.test(String(input.token||'')))throw S.fail('Refresh this page and try again.');
  if(ambassador&&input.ba_consent!==true)throw S.fail('Accept the referral disclosure to continue.');
  const coverage=await require('../lib/service-coverage.cjs').verify(input);
  const data=S.validate(coverage.approved?input:{...input,pets:'no',parking:'none',access_method:'resident'}),checkout=input.action==='checkout';
  if(!coverage.approved)return S.json(res,200,await require('../lib/out-of-area.cjs').save(db,input,data,coverage));
  if(direct&&data.state!=='NC')throw S.fail('Online booking is available only in North Carolina.');
  if(checkout&&(!S.ready()||data.quote.review_required))throw S.fail('This booking needs a request first. Please go back and request a review.',409);
  if(checkout&&input.consent!==true)throw S.fail('Authorize the service-date charge to continue.');
  if(gift){if(!Number.isInteger(input.gift_expected_cents)||input.gift_expected_cents<=0||input.gift_expected_cents>10000)throw S.fail('Refresh your quote to apply available gift credit.');data.gift_expected_cents=input.gift_expected_cents;}
  const status=data.quote.review_required?'review_required':checkout?'awaiting_card':'requested';
  S.checked(await db.rpc(gift?'create_gift_booking':direct?(input.ba?'create_ba_booking':'create_direct_booking'):'create_residential_booking',{p_id:input.id,p_token:S.hash(input.token),p_hash:S.hash(JSON.stringify(gift?{data,status,gift:gift.id}:{data,status})),...(gift?{p_gift:gift.code}:direct?(input.ba?{p_code:String(input.ba)}:{}):{p_code:input.code}),p_data:data,p_status:status,p_consent:checkout?(gift?CONSENT+' Gift card applied; only the remaining balance is charged.':CONSENT):null}));
  await require('../lib/map-data.cjs').rememberAddress(db,data,coverage);
  let b=await S.owned(db,input);
  if(!checkout)return S.json(res,200,{booking:S.summary(b)});
  if(b.status!=='awaiting_card')return S.json(res,200,{booking:S.summary(b)});
  const st=S.stripe();
  if(!b.stripe_customer){const customer=await st.customers.create({name:b.name,email:b.email,phone:b.phone,metadata:{booking_id:b.id,agent_id:b.agent_id||''}},{idempotencyKey:`residential-customer-${b.id}`});S.checked(await db.from('referral_bookings').update({stripe_customer:customer.id}).eq('id',b.id));b.stripe_customer=customer.id;}
  if(b.stripe_session){const session=await st.checkout.sessions.retrieve(b.stripe_session);if(session.status==='open'&&session.url)return S.json(res,200,{url:session.url});throw S.fail('This checkout has ended. Contact Turnly to reopen your request.',409);}
  const receipt=`${S.ORIGIN}/residential-referral.html?ref=${encodeURIComponent(input.code||'')}#booking=${b.id}&token=${encodeURIComponent(input.token)}`;
  const session=await st.checkout.sessions.create({mode:'setup',currency:'usd',customer:b.stripe_customer,allowed_payment_method_types:['card'],client_reference_id:b.id,metadata:{booking_id:b.id,agent_id:b.agent_id||'',referral_code:b.referral_code},setup_intent_data:{metadata:{booking_id:b.id,agent_id:b.agent_id||''}},success_url:receipt,cancel_url:receipt+'&cancelled=1',custom_text:{submit:{message:`Save your card to reserve your clean. $${((b.amount_cents-b.gift_applied_cents)/100).toFixed(2)} will be charged on ${b.service_date}, not today.`}}},{idempotencyKey:`residential-setup-${b.id}`});
  S.checked(await db.from('referral_bookings').update({stripe_session:session.id}).eq('id',b.id));
  return S.json(res,200,{url:session.url});
 }catch(e){return S.json(res,e.status||400,{error:e.type?'The card service could not complete this step. Please try again or contact Turnly.':e.message||'Unable to complete this request.'});}
};
