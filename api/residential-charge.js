const S=require('../lib/residential-server.cjs');
const {timingSafeEqual}=require('node:crypto');
module.exports=async(req,res)=>{
 if(req.method!=='GET')return S.json(res,405,{error:'Method not allowed.'});
 const secret=process.env.CRON_SECRET;
 if(!secret||!timingSafeEqual(Buffer.from(S.hash(req.headers.authorization||'')),Buffer.from(S.hash('Bearer '+secret))))return S.json(res,401,{error:'Unauthorized.'});
 if(!S.ready())return S.json(res,200,{enabled:false,processed:0});
 try{
  const db=S.database(),st=S.stripe();
  await require('../lib/residential-jobs.cjs').syncBatch(db);
  const rows=S.checked(await db.rpc('claim_residential_charges'));let processed=0,attention=0;
  // Bounded concurrency keeps each lease inside the function's maximum duration.
  for(let i=0;i<rows.length;i+=4)await Promise.all(rows.slice(i,i+4).map(async b=>{
   try{
    const job=S.checked(await db.from('assignment_blocks').select('status,metadata').eq('id',b.id).maybeSingle());
    if(job?.metadata?.source==='residential_booking'&&['cancelled','canceled','declined'].includes(job.status)){
      // A cancellation after the charge lease was acquired requires review;
      // never issue a new charge or assume a previous ambiguous attempt failed.
      S.checked(await db.from('referral_bookings').update({status:'needs_reschedule',payment_status:'uncertain',charge_locked_at:null}).eq('id',b.id));attention++;return;
    }
    let pi;
    if(b.stripe_payment_intent)pi=await st.paymentIntents.retrieve(b.stripe_payment_intent);
    else try{pi=await st.paymentIntents.create({amount:b.amount_cents,currency:'usd',customer:b.stripe_customer,payment_method:b.stripe_payment_method,off_session:true,confirm:true,receipt_email:b.email,description:`Turnly ${b.quote.service_label} · ${b.service_date}`,metadata:{booking_id:b.id,agent_id:b.agent_id,referral_code:b.referral_code,charge_key:b.charge_key}},{idempotencyKey:`residential-charge-${b.charge_key}`});}
    catch(e){if(e.payment_intent)pi=e.payment_intent;else throw e;}
    S.checked(await db.from('referral_bookings').update({stripe_payment_intent:pi.id}).eq('id',b.id));
    await S.reconcilePayment(db,st,pi.id);processed++;
   }catch{attention++;/* Leave the lease and durable idempotency key for safe reconciliation. */}
  }));
  return S.json(res,200,{processed,attention});
 }catch{return S.json(res,503,{error:'Scheduled payment processing needs attention.'});}
};
