// Deployment bootstrap: disabled unless a separate, short-lived operator token is installed.
// The operator removes that environment variable immediately after saving the webhook secret.
const S=require('../lib/residential-server.cjs');
const {timingSafeEqual}=require('node:crypto');
module.exports=async(req,res)=>{
 const token=process.env.RESIDENTIAL_SETUP_TOKEN;
 if(req.method!=='POST'||!token||!timingSafeEqual(Buffer.from(S.hash(req.headers.authorization||'')),Buffer.from(S.hash('Bearer '+token))))return S.json(res,404,{error:'Not found.'});
 try{
  const st=S.stripe(),account=await st.accounts.retrieve();
  if((await S.body(req)).action==='status')return S.json(res,200,{charges_enabled:account.charges_enabled,country:account.country,livemode:/^(sk|rk)_live_/.test(String(process.env.STRIPE_SECRET_KEY||process.env.STRIP_SECRET_KEY||'')),payments_enabled:S.ready()});
  const endpoint=await st.webhookEndpoints.create({url:S.ORIGIN+'/api/residential-webhook',description:'Turnly residential booking and service-day payments',enabled_events:['checkout.session.completed','payment_intent.succeeded','payment_intent.payment_failed','payment_intent.processing','payment_intent.canceled','charge.refunded','charge.dispute.created','charge.dispute.closed']},{idempotencyKey:'turnly-residential-webhook-'+S.hash(token).slice(0,24)});
  const session=await st.checkout.sessions.create({mode:'setup',currency:'usd',payment_method_types:['card'],success_url:S.ORIGIN+'/residential-referral.html',cancel_url:S.ORIGIN+'/residential-referral.html',metadata:{purpose:'configuration_check_no_card_collected'}},{idempotencyKey:'turnly-residential-smoke-'+S.hash(token).slice(0,24)});
  if(session.status==='open')await st.checkout.sessions.expire(session.id);
  return S.json(res,200,{webhook_id:endpoint.id,webhook_secret:endpoint.secret,livemode:session.livemode,charges_enabled:account.charges_enabled,checkout_verified:session.mode==='setup',country:account.country});
 }catch(e){return S.json(res,400,{error:'Stripe setup could not complete.',code:e.code||e.type||'setup_error'});}
};
