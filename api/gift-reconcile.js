const S=require('../lib/residential-server.cjs'),G=require('../lib/gift-cards.cjs');
const {timingSafeEqual}=require('node:crypto');
module.exports=async(req,res)=>{
 if(req.method!=='GET')return S.json(res,405,{error:'Method not allowed.'});
 if(!process.env.CRON_SECRET||!timingSafeEqual(Buffer.from(S.hash(req.headers.authorization||'')),Buffer.from(S.hash('Bearer '+process.env.CRON_SECRET))))return S.json(res,401,{error:'Unauthorized.'});
 try{
  const db=S.database(),st=S.stripe();let processed=0,attention=0;
  const orders=S.checked(await db.from('gift_orders').select('*').in('status',['pending','paid']).is('email_id',null).neq('email_status','review').order('created_at').limit(20));
  for(const o of orders){try{
   if(!o.stripe_session){if(Date.now()-Date.parse(o.created_at)>86400000)S.checked(await db.from('gift_orders').update({status:'expired'}).eq('id',o.id));continue;}
   const session=await st.checkout.sessions.retrieve(o.stripe_session);
   if(session.status==='expired'&&session.payment_status!=='paid'){S.checked(await db.from('gift_orders').update({status:'expired'}).eq('id',o.id));continue;}
   await G.fulfill(db,st,o.stripe_session);processed++;
  }catch{attention++;}}
  const deliveries=S.checked(await db.from('gift_orders').select('*').in('email_status',['accepted','sent','delivery_delayed']).not('email_id','is',null).order('created_at').limit(15));
  for(const o of deliveries){try{await G.deliveryStatus(db,o);}catch{attention++;}}
  // Release abandoned card-setup holds only after confirming Stripe did not complete setup.
  const holds=S.checked(await db.from('gift_reservations').select('booking_id,referral_bookings(*)').eq('status','reserved').lt('created_at',new Date(Date.now()-25*3600000).toISOString()).limit(25));
  for(const r of holds){try{const b=r.referral_bookings;if(b.status!=='awaiting_card')continue;
   if(b.stripe_session){const session=await st.checkout.sessions.retrieve(b.stripe_session);if(session.status==='complete'){await S.reconcileSession(db,st,b.stripe_session);continue;}if(session.status!=='expired')continue;}
   S.checked(await db.from('referral_bookings').update({status:'cancelled'}).eq('id',b.id).eq('status','awaiting_card'));processed++;
  }catch{attention++;}}
  const refunds=S.checked(await db.from('gift_cards').select('id,order_id,gift_orders(payment_intent)').eq('status','refund_pending').limit(20));
  for(const c of refunds){try{const list=await st.refunds.list({payment_intent:c.gift_orders.payment_intent,limit:100});const r=list.data.find(r=>r.metadata?.gift_card_id===c.id);if(r?.status==='succeeded'){S.checked(await db.rpc('gift_refund_finish',{p_card:c.id,p_refund:r.id}));processed++;}else attention++;}catch{attention++;}}
  return S.json(res,200,{processed,attention});
 }catch{return S.json(res,503,{error:'Gift card reconciliation needs attention.'});}
};
