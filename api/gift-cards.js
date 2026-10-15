const S=require('../lib/residential-server.cjs'),G=require('../lib/gift-cards.cjs');
const {uuid,email,clean}=require('../lib/agent-referrals.cjs');
module.exports=async(req,res)=>{
 if(req.method!=='POST')return S.json(res,405,{error:'Method not allowed.'});
 try{
  const i=await S.body(req),db=S.database();
  if(i.action==='config')return S.json(res,200,{ready:G.ready(),terms:G.TERMS});
  if(i.action?.startsWith('admin_')){
   const actor=await S.admin(db,req);
   if(i.action==='admin_list'){
    const page=Math.max(1,Math.floor(Number(i.page)||1));let q=db.from('gift_cards').select('id,order_id,ordinal,code,balance_cents,reserved_cents,status,created_at,gift_orders(email,name,email_status,email_id,stripe_session)',{count:'exact'}).order('created_at',{ascending:false});
    if(i.search){const search=clean(i.search,80).replace(/[^a-zA-Z0-9@. -]/g,'');if(G.valid(G.normalize(search)))q=q.eq('code',G.normalize(search));else q=q.ilike('code','%'+search.replace(/\s/g,'').toUpperCase()+'%');}
    if(['active','spent','suspended','refund_pending','refunded'].includes(i.status))q=q.eq('status',i.status);
    const r=await q.range((page-1)*25,page*25-1);S.checked(r);return S.json(res,200,{cards:r.data,total:r.count,page});
   }
   if(i.action==='admin_orders'){const r=await db.from('gift_orders').select('id,email,name,quantity,amount_cents,status,email_status,created_at').order('created_at',{ascending:false}).limit(100);return S.json(res,200,{orders:S.checked(r)});}
   if(i.action==='admin_history'){if(!uuid(i.id))throw S.fail('Choose a card.');return S.json(res,200,{events:S.checked(await db.from('gift_events').select('*').eq('card_id',i.id).order('created_at',{ascending:false}))});}
   if(i.action==='admin_search'){
    const r=S.checked(await db.rpc('gift_admin_search',{p_mode:i.mode==='orders'?'orders':'cards',p_search:clean(i.search,160),p_status:clean(i.status,30),p_from:i.from||null,p_to:i.to||null,p_page:Math.max(1,Math.floor(Number(i.page)||1)),p_size:[25,50,100].includes(Number(i.size))?Number(i.size):25,p_sort:i.sort==='oldest'?'oldest':'newest'}));
    return S.json(res,200,r);
   }
   if(i.action==='admin_detail'){
    if(!uuid(i.id))throw S.fail('Choose a record.');
    let orderId=i.id,card=null;
    if(i.mode!=='orders'){card=S.checked(await db.from('gift_cards').select('*').eq('id',i.id).single());orderId=card.order_id;}
    const order=S.checked(await db.from('gift_orders').select('id,name,email,quantity,amount_cents,status,email_status,created_at,paid_at').eq('id',orderId).single());
    const cards=S.checked(await db.from('gift_cards').select('id,code,status,balance_cents,reserved_cents,ordinal').eq('order_id',orderId).order('ordinal'));
    const page=Math.max(1,Math.floor(Number(i.page)||1));let q=db.from('gift_events').select('*',{count:'exact'}).eq('order_id',orderId);
    if(card)q=q.eq('card_id',card.id);
    const r=await q.order('created_at',{ascending:false}).order('id').range((page-1)*20,page*20-1);S.checked(r);
    return S.json(res,200,{order,cards,card,events:r.data,total:r.count,page});
   }
   if(i.action==='admin_retry'){
    const o=S.checked(await db.from('gift_orders').select('*').eq('id',i.id).single());
    if(!o.stripe_session)throw S.fail('This order never entered checkout.');await G.fulfill(db,S.stripe(),o.stripe_session);await G.deliveryStatus(db,o);return S.json(res,200,{ok:true});
   }
   if(i.action==='admin_refund'){
    const c=S.checked(await db.rpc('gift_refund_lock',{p_card:i.id,p_actor:actor,p_reason:clean(i.reason,1000)}));
    const o=S.checked(await db.from('gift_orders').select('*').eq('id',c.order_id).single());
    const st=S.stripe(),existing=await st.refunds.list({payment_intent:o.payment_intent,limit:100});
    let refund=existing.data.find(r=>r.metadata?.gift_card_id===c.id);
    if(!refund){if(existing.has_more)throw S.fail('Review this order in Stripe before retrying.',409);refund=await st.refunds.create({payment_intent:o.payment_intent,amount:10000,metadata:{gift_card_id:c.id,purpose:'service_unavailable'}},{idempotencyKey:`gift-refund-${c.id}`});}
    if(refund.status==='succeeded')S.checked(await db.rpc('gift_refund_finish',{p_card:c.id,p_refund:refund.id}));
    return S.json(res,200,{status:refund.status||'pending'});
   }
   throw S.fail('Unknown admin action.');
  }
  await S.rate(db,req,'gift-'+i.action);
  if(i.action==='balance'||i.action==='scan'){
   const c=await G.card(db,i.code);if(i.action==='scan')await G.event(db,c,'booking_opened');
   return S.json(res,200,{balance_cents:c.balance_cents,available_cents:c.status==='active'?c.balance_cents-c.reserved_cents:0,status:c.status});
  }
  if(['status','download'].includes(i.action)){
   if(!uuid(i.id)||!/^[-a-zA-Z0-9_]{40,100}$/.test(i.token||''))throw S.fail('Use your purchase confirmation link.',403);
   let o=S.checked(await db.from('gift_orders').select('*').eq('id',i.id).eq('token_hash',S.hash(i.token)).maybeSingle());if(!o)throw S.fail('Order not found.',404);
   if(o.stripe_session&&o.status==='pending')await G.fulfill(db,S.stripe(),o.stripe_session);
   o=S.checked(await db.from('gift_orders').select('*').eq('id',i.id).single());
   if(i.action==='status')return S.json(res,200,{status:o.status,email_status:o.email_status,quantity:o.quantity,email:o.email});
   if(o.status!=='paid')throw S.fail('Your payment has not been confirmed.',409);
   const cards=S.checked(await db.from('gift_cards').select('*').eq('order_id',o.id).order('ordinal'));
   const bytes=await G.pdf(cards);S.checked(await db.from('gift_events').insert(cards.map(c=>({card_id:c.id,order_id:o.id,kind:'pdf_downloaded'}))));
   res.setHeader('Content-Type','application/pdf');res.setHeader('Cache-Control','no-store');res.setHeader('Content-Disposition','attachment; filename="Turnly-Gift-Cards.pdf"');return res.end(bytes);
  }
  if(i.action!=='checkout')throw S.fail('Unknown action.');
  if(!G.ready())throw S.fail('Gift card checkout is temporarily unavailable. Contact admin@turnlypros.com.',503);
  if(i.accepted!==true||i.terms!==G.TERMS)throw S.fail('Read and accept the current Gift Card Terms.');
  if(!uuid(i.id)||!/^[-a-zA-Z0-9_]{40,100}$/.test(i.token||''))throw S.fail('Refresh and try again.');
  const quantity=Number(i.quantity),name=clean(i.name,160),em=email(i.email);
  if(!Number.isInteger(quantity)||quantity<1||quantity>25||!name||!em||i.website)throw S.fail('Enter your name, email and between 1 and 25 cards.');
  const requestHash=S.hash(JSON.stringify({quantity,name,email:em,terms:G.TERMS}));
  S.checked(await db.from('gift_orders').upsert({id:i.id,token_hash:S.hash(i.token),request_hash:requestHash,quantity,name,email:em,amount_cents:quantity*10000,terms_version:G.TERMS},{onConflict:'id',ignoreDuplicates:true}));
  const o=S.checked(await db.from('gift_orders').select('*').eq('id',i.id).single());
  if(o.token_hash!==S.hash(i.token)||o.request_hash!==requestHash)throw S.fail('Your order changed. Refresh before purchasing.',409);
  if(o.status!=='pending')throw S.fail('This order is already complete.',409);
  const st=S.stripe();let session;
  if(o.stripe_session){session=await st.checkout.sessions.retrieve(o.stripe_session);if(session.status!=='open')throw S.fail('This checkout ended. Refresh to start a new order.',409);}
  else{
   if(Date.now()-Date.parse(o.created_at)>23*3600000)throw S.fail('This checkout expired. Refresh to start again.',409);
   const receipt=`${S.ORIGIN}/gift-cards.html#order=${i.id}&token=${encodeURIComponent(i.token)}`;
   session=await st.checkout.sessions.create({mode:'payment',customer_email:em,allowed_payment_method_types:['card'],client_reference_id:o.id,metadata:{purpose:'turnly_gift_cards',order_id:o.id,terms_version:G.TERMS},payment_intent_data:{metadata:{purpose:'turnly_gift_cards',order_id:o.id}},line_items:[{quantity,price_data:{currency:'usd',unit_amount:10000,product_data:{name:'Turnly $100 Gift Card',description:'NC service areas only. No expiration. One unique card per $100.'}}}],success_url:receipt,cancel_url:receipt+'&cancelled=1'},{idempotencyKey:`gift-checkout-${o.id}`});
   S.checked(await db.from('gift_orders').update({stripe_session:session.id}).eq('id',o.id));
  }
  return S.json(res,200,{url:session.url});
 }catch(e){return S.json(res,e.status||400,{error:e.type?'Payment service unavailable. Please try again.':e.message||'Unable to complete this request.'});}
};
