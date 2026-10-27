const C=require('./contractor-crm.cjs');
const {uuid}=require('./agent-referrals.cjs');
const crypto=require('node:crypto');
const VERSION='2026-09-30.preview';
const configured=()=>!!process.env.STRIPE_GLOBAL_PAYOUTS_KEY;
async function stripe(path,body,key,transport=fetch){
 const secret=process.env.STRIPE_GLOBAL_PAYOUTS_KEY;
 if(!secret||!/^rk_(live|test)_/.test(secret))throw C.fail('Global Payouts needs its restricted Stripe API key. Gift-card checkout uses a separate key.',503);
 const response=await transport('https://api.stripe.com/v2/'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+secret,'Stripe-Version':VERSION,'Content-Type':'application/json',...(key?{'Idempotency-Key':key}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(18000)});
 const data=await response.json();
 if(!response.ok)throw C.fail('Stripe could not complete this request'+(data.error?.code?' ('+data.error.code+')':'')+'. Check Global Payouts access and recipient requirements. No automatic retry will send a second payment.',409);
 return data;
}
const id=(value,prefix)=>{if(!new RegExp('^'+prefix+'_[A-Za-z0-9]+$').test(value||''))throw C.fail('Choose a valid Stripe record');return value;};
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function review(pi){return {id:pi.id,status:pi.status,confirmation_method:pi.confirmation_method,from:pi.from,to:pi.to,amount:pi.amount,estimated_fees:pi.estimated_fees,fx_quote:pi.fx_quote,next_action:pi.next_action};}
function validate(pi,r){
 if(pi.confirmation_method!=='manual'||pi.amount?.value!==Number(r.amount_cents)||pi.amount?.currency!==r.currency||pi.to?.recipient!==r.recipient_account||pi.from?.financial_account!==r.financial_account)throw C.fail('Stripe payment does not match the approved record. Reconciliation is required.',409);
}
async function run(db,actor,input,request=stripe){
 if(input.action==='list'){
  const [recipients,payments,contractors]=await Promise.all([C.rows(db,'payout_recipients'),C.rows(db,'global_payout_requests'),C.rows(db,'profiles','id,full_name,email',q=>q.eq('role','contractor'))]);
  return {recipients,payments,contractors,configured:configured(),send_enabled:process.env.GLOBAL_PAYOUTS_SEND_ENABLED==='true'};
 }
 if(input.action==='accounts'){
  const result=await request('money_management/financial_accounts');
  return {accounts:(result.data||[]).map(a=>({id:a.id,balance:a.balance,status:a.status}))};
 }
 if(input.action==='recipient'){
  const account=id(input.account,'acct'),a=await request('core/accounts/'+account+'?include%5B%5D=identity&include%5B%5D=configuration.recipient&include%5B%5D=requirements');
  if(!a.configuration?.recipient)throw C.fail('This is not a Global Payouts recipient. Add a recipient in Stripe Global Payouts first.');
  const country=String(a.identity?.country||'').toUpperCase();if(!['US','PH','PK'].includes(country))throw C.fail('This workspace currently supports US, Philippines and Pakistan recipients.');
  if(input.contractor_id)await C.profile(db,input.contractor_id);
  const data={stripe_account:account,name:a.display_name||'Recipient',country,kind:input.contractor_id?'contractor':'assistant',contractor_id:input.contractor_id||null,created_by:actor};
  return {recipient:C.checked(await db.from('payout_recipients').upsert(data,{onConflict:'stripe_account'}).select().single())};
 }
 if(input.action==='draft'){
  if(!uuid(input.recipient)||!Number.isSafeInteger(input.amount_cents)||input.amount_cents<=0||input.amount_cents>10000000)throw C.fail('Choose a recipient and a valid amount up to 100,000.');
  if(!['usd','php','pkr'].includes(input.currency))throw C.fail('Choose USD, PHP or PKR');
  if(String(input.reference||'').trim().length<3||String(input.reference).length>160)throw C.fail('Enter an invoice or pay-period reference (3–160 characters).');
  return {payment:C.checked(await db.rpc('draft_global_payout',{p_actor:actor,p_recipient:input.recipient,p_assignment:input.assignment||null,p_amount:input.amount_cents,p_currency:input.currency,p_reference:input.reference.trim(),p_financial:id(input.financial_account,'fa')}))};
 }
 if(!uuid(input.id))throw C.fail('Choose a payment');
 let r=C.checked(await db.from('global_payout_requests').select('*').eq('id',input.id).single());
 if(input.action==='prepare'){
  if(!['draft','preparing','review'].includes(r.status))throw C.fail('This payment is already submitted. Refresh its status.',409);
  if(!r.stripe_intent){
   r=C.checked(await db.rpc('prepare_global_payout',{p_actor:actor,p_id:r.id}));
   if(Date.now()-Date.parse(r.prepared_at)>23*3600000)throw C.fail('This preparation needs reconciliation in Stripe before retrying.',409);
   const pi=await request('money_management/payout_intents',{from:{financial_account:r.financial_account,currency:'usd'},to:{recipient:r.recipient_account},amount:{value:Number(r.amount_cents),currency:r.currency},confirmation_method:'manual',description:r.reference},'turnly-global-prepare-'+r.id);
   validate(pi,r);
   C.checked(await db.from('global_payout_requests').update({stripe_intent:pi.id,status:'review'}).eq('id',r.id));r.stripe_intent=pi.id;
  }
  const pi=await request('money_management/payout_intents/'+id(r.stripe_intent,'poi'));validate(pi,r);
  if(pi.status!=='requires_action'||pi.next_action?.type!=='confirm')throw C.fail('Stripe is not ready for approval. Check recipient requirements and account access.',409);
  return {review:review(pi),review_token:hash(review(pi))};
 }
 if(input.action==='send'){
  if(process.env.GLOBAL_PAYOUTS_SEND_ENABLED!=='true')throw C.fail('Sending is not enabled yet. Finish account access and sandbox verification first.',409);
  if(r.status!=='review'||!r.stripe_intent)throw C.fail('Review this payment before approving it.',409);
  const pi=await request('money_management/payout_intents/'+id(r.stripe_intent,'poi'));validate(pi,r);
  if(pi.status!=='requires_action'||pi.next_action?.type!=='confirm'||input.review_token!==hash(review(pi)))throw C.fail('The payout quote changed. Review the latest fees and exchange rate before approving.',409);
  if(pi.fx_quote?.lock_expires_at&&new Date(pi.fx_quote.lock_expires_at).getTime()<=Date.now())throw C.fail('The exchange rate expired. Refresh the quote in Stripe and review again.',409);
  C.checked(await db.rpc('approve_global_payout',{p_actor:actor,p_id:r.id,p_review:review(pi)}));
  const sent=await request('money_management/payout_intents/'+r.stripe_intent+'/confirm',{},'turnly-global-confirm-'+r.id);validate(sent,r);
  return {payment:C.checked(await db.rpc('sync_global_payout',{p_id:r.id,p_status:sent.status,p_detail:sent.next_action||{}}))};
 }
 if(input.action==='sync'){
  if(!r.stripe_intent)throw C.fail('No Stripe payout exists yet.');
  const pi=await request('money_management/payout_intents/'+id(r.stripe_intent,'poi'));validate(pi,r);
  return {payment:C.checked(await db.rpc('sync_global_payout',{p_id:r.id,p_status:pi.status,p_detail:pi.next_action||{}}))};
 }
 throw C.fail('Unknown action');
}
module.exports={run,stripe,validate,review,hash};
