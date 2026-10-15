const S=require('../lib/residential-server.cjs');
const A=require('../lib/residential-accounts.cjs');
const P=require('../lib/customer-portal.cjs');
const {email,clean}=require('../lib/agent-referrals.cjs');
module.exports=async(req,res)=>{
 if(req.method!=='POST')return S.json(res,405,{error:'Method not allowed.'});
 try{
  A.sameOrigin(req);const input=await S.body(req),db=S.database();
  if(input.action==='login'){
   await S.rate(db,req,'customer-login');const em=email(input.email);if(!em||typeof input.password!=='string'||input.password.length>128)throw S.fail('Enter your email and password.');
   if(!S.checked(await db.rpc('allow_referral_request',{p_key:S.hash('customer-login:'+em)})))throw S.fail('Too many attempts. Try again later.',429);
   const legacy=S.checked(await db.from('residential_accounts').select('id,password_hash').eq('email',em).maybeSingle());
   if(await A.verifyPassword(input.password,legacy?.password_hash)){
    await A.signIn(db,res,legacy.id,legacy.password_hash);return S.json(res,200,{ok:true});
   }
   // Use a separate client: sign-in changes a client's authorization header.
   const auth=await S.database().auth.signInWithPassword({email:em,password:input.password});
   if(auth.error||!auth.data?.session)throw S.fail('The email or password is incorrect.',401);
   const p=S.checked(await db.from('profiles').select('role,status').eq('id',auth.data.user.id).maybeSingle());
   if(p?.role!=='customer'||['disabled','inactive','suspended','rejected'].includes(p.status))throw S.fail('Use your customer account to sign in.',403);
   P.appCookie(res,auth.data.session.access_token,auth.data.session.expires_in);return S.json(res,200,{ok:true});
  }
  if(input.action==='logout'){
   const t=A.sessionToken(req);if(t)S.checked(await db.from('residential_sessions').update({revoked_at:new Date().toISOString()}).eq('token_hash',S.hash(t)));
   const app=P.appToken(req);if(app)await db.auth.admin.signOut(app,'local');
   A.setCookie(res,'',0);const first=res.getHeader('Set-Cookie');P.appCookie(res,'',0);res.setHeader('Set-Cookie',[first,res.getHeader('Set-Cookie')]);return S.json(res,200,{ok:true});
  }
  const a=await P.identity(db,req),scope=await P.scope(db,a);
  if(input.action==='dashboard'){
   const page=Math.max(1,Math.min(10000,Math.floor(Number(input.page)||1))),filter=['upcoming','history','all'].includes(input.filter)?input.filter:'all';
   let q=P.query(db,scope,'*',{count:'exact'});
   if(filter==='upcoming')q=q.in('status',P.editable);if(filter==='history')q=q.in('status',['completed','cancelled']);
   const result=await q.order('service_date',{ascending:filter==='upcoming'}).order('id').range((page-1)*20,page*20-1);S.checked(result);
   const next=S.checked(await P.query(db,scope).in('status',P.editable).order('service_date').limit(1));
   const activity=S.checked(await P.query(db,scope,'id,service_date,created_at,paid_at,completed_at,payment_status,status,amount_cents,gift_applied_cents').order('created_at',{ascending:false}).limit(30));
   const plans=a.uid?S.checked(await db.from('residential_plan_enrollments').select('id,frequency,price_cents,status,created_at').eq('user_id',a.uid).order('created_at',{ascending:false})):[];
   return S.json(res,200,{account:{name:a.name,email:a.email,kind:a.kind},bookings:await P.present(db,result.data),next:(await P.present(db,next))[0]||null,activity,plans,page,total:result.count});
  }
  if(input.action==='profile'){
   const name=clean(input.name,160);if(!name)throw S.fail('Enter your name.');
   S.checked(await db.from(a.uid?'profiles':'residential_accounts').update(a.uid?{full_name:name}:{name}).eq('id',a.id));return S.json(res,200,{ok:true});
  }
  if(input.action==='support'){
   await S.rate(db,req,'customer-support');const message=clean(input.message,2000);if(message.length<5)throw S.fail('Tell us what you need help with.');
   const id=String(input.id||'');if(id)await P.owned(db,scope,id);
   S.checked(await db.from('residential_inquiries').insert({payload:{source:'customer_portal',contact_name:a.name,contact_email:a.email,default_service_type:'Customer support',lead_notes:message+(id?'\nBooking: '+id:''),customer_portal_owner:S.hash(a.kind+':'+a.id)}}));
   return S.json(res,200,{ok:true,message:'Your request is in Turnly’s admin portal. We’ll reply to your email.'});
  }
  if(input.action==='messages'){
   const r=S.checked(await db.from('residential_inquiries').select('id,created_at,payload').eq('payload->>customer_portal_owner',S.hash(a.kind+':'+a.id)).order('created_at',{ascending:false}).limit(50));
   return S.json(res,200,{messages:r.map(x=>({id:x.id,created_at:x.created_at,message:x.payload.lead_notes}))});
  }
  const b=await P.owned(db,scope,input.id);
  if(input.action==='quote'){
   let quote;try{quote=require('../lib/residential-pricing.cjs').quote({service:input.service,sqft:b.sqft,frequency:'once'});}catch(e){throw S.fail(e.message);}
   return S.json(res,200,{quote,property_address:b.property_address,card_saved:!!b.stripe_payment_method});
  }
  if(input.action==='book'){
   await S.rate(db,req,'customer-book');if(input.consent!==true)throw S.fail('Accept the payment authorization before booking.');
   if(!require('../lib/agent-referrals.cjs').uuid(input.request_id))throw S.fail('Refresh the booking form and try again.');
   if(b.state!=='NC')throw S.fail('Online booking is available only in North Carolina.');
   let quote,slot;try{quote=require('../lib/residential-pricing.cjs').quote({service:input.service,sqft:b.sqft,frequency:'once'});slot=require('../lib/residential-pricing.cjs').schedule(input);}catch(e){throw S.fail(e.message);}
   if(!b.stripe_payment_method||!b.stripe_customer)throw S.fail('Save a payment card for your existing booking first.');
   const pm=await S.stripe().paymentMethods.retrieve(b.stripe_payment_method);if(pm.customer!==b.stripe_customer)throw S.fail('Update your payment card before rebooking.');
   const result=await db.rpc('customer_portal_rebook',{p_anchor:b.id,p_email:a.uid?null:a.email,p_uid:a.uid,p_request:S.hash(a.kind+':'+a.id+':'+input.request_id),p_data:{...slot,quote,token_hash:S.hash(require('node:crypto').randomBytes(32)),notes:clean(input.notes,1500),consent_text:'I authorize Turnly to charge my saved card for this cleaning on the morning of the visit (6 AM Eastern, or at the start of an earlier arrival window).'}});
   if(result.error)throw S.fail('We could not complete this booking. Please try again.',409);
   const created=await P.owned(db,scope.email?scope:{ids:[...scope.ids,result.data]},result.data);
   try{await require('../lib/residential-jobs.cjs').syncBooking(db,created);}catch{console.error('Customer portal booking assignment deferred to reconciliation.');}
   return S.json(res,200,{id:result.data});
  }
  if(input.action==='detail')return S.json(res,200,{booking:(await P.present(db,[b],true))[0]});
  if(input.action==='update'){
   await S.rate(db,req,'customer-change');if(!['reschedule','cancel','notes'].includes(input.op))throw S.fail('Choose a supported change.');
   let data={notes:clean(input.notes,1500),reason:clean(input.reason,300)};
   if(input.op==='reschedule'){try{data={...require('../lib/residential-pricing.cjs').schedule(input),...data};}catch(e){throw S.fail(e.message);}}
   const r=await db.rpc('customer_portal_change',{p_id:b.id,p_email:a.uid?null:a.email,p_uid:a.uid,p_op:input.op,p_data:data});
   if(r.error)throw S.fail('This cleaning can no longer be changed online. Refresh its details or message Turnly for help.',409);
   return S.json(res,200,{ok:true});
  }
  if(input.action==='payment'){
   const st=S.stripe(),pm=b.stripe_payment_method?await st.paymentMethods.retrieve(b.stripe_payment_method):null;
   if(pm&&pm.customer!==b.stripe_customer)throw S.fail('This payment method needs review. Please contact Turnly.',409);
   return S.json(res,200,{card:pm?.card?{brand:pm.card.brand,last4:pm.card.last4,exp_month:pm.card.exp_month,exp_year:pm.card.exp_year}:null});
  }
  if(input.action==='card_setup'){
   await S.rate(db,req,'customer-card');if(!b.stripe_customer||!P.canModify(b))throw S.fail('Contact Turnly to change payment for this visit.',409);
   const st=S.stripe(),session=await st.checkout.sessions.create({mode:'setup',customer:b.stripe_customer,allowed_payment_method_types:['card'],client_reference_id:b.id,metadata:{source:'customer_portal_card',booking_id:b.id},setup_intent_data:{metadata:{source:'customer_portal_card',booking_id:b.id}},success_url:S.ORIGIN+'/customer.html#card_session={CHECKOUT_SESSION_ID}&booking='+b.id,cancel_url:S.ORIGIN+'/customer.html#payment='+b.id});
   return S.json(res,200,{url:session.url});
  }
  if(input.action==='card_complete'){
   if(!/^cs_[A-Za-z0-9_]{10,200}$/.test(input.session||''))throw S.fail('Invalid card confirmation.');
   const st=S.stripe(),session=await st.checkout.sessions.retrieve(input.session);
   if(session.metadata?.booking_id!==b.id)throw S.fail('This confirmation belongs to another cleaning.',403);
   await P.completeCard(db,st,input.session,true);return S.json(res,200,{ok:true});
  }
  if(input.action==='receipt'){
   if(!b.stripe_payment_intent)throw S.fail(b.payment_status==='paid'?'This visit was covered by gift credit. Its payment breakdown is shown in the cleaning details.':'A receipt is available after payment is collected.');
   const pi=await S.stripe().paymentIntents.retrieve(b.stripe_payment_intent,{expand:['latest_charge']});
   if(pi.customer!==b.stripe_customer||pi.metadata?.booking_id!==b.id)throw S.fail('Receipt needs review. Contact Turnly.',409);
   const url=pi.latest_charge?.receipt_url;if(!url||new URL(url).hostname!=='pay.stripe.com')throw S.fail('The receipt is not ready yet.');return S.json(res,200,{url});
  }
  throw S.fail('Unknown portal action.');
 }catch(e){return S.json(res,e.status||500,{error:e.status?e.message:'We couldn’t complete that request. Please try again.'});}
};
