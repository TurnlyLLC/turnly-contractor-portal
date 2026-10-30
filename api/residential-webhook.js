const S=require('../lib/residential-server.cjs');
const G=require('../lib/gift-cards.cjs');
module.exports=async(req,res)=>{
 if(req.method!=='POST')return S.json(res,405,{error:'Method not allowed.'});
 if(!process.env.STRIPE_WEBHOOK_SECRET)return S.json(res,503,{error:'Webhook is not configured.'});
 let event,st;
 try{
  const chunks=[];let size=0;for await(const chunk of req){const b=Buffer.from(chunk);size+=b.length;if(size>1000000)throw new Error('Too large');chunks.push(b);}
  st=S.stripe();event=st.webhooks.constructEvent(Buffer.concat(chunks),req.headers['stripe-signature'],process.env.STRIPE_WEBHOOK_SECRET);
 }catch{return S.json(res,400,{error:'Invalid webhook signature.'});}
 try{
  const db=S.database(),obj=event.data.object;
  if(['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type)){if(!await G.fulfill(db,st,obj.id)&&!await require('../lib/customer-portal.cjs').completeCard(db,st,obj.id))await S.reconcileSession(db,st,obj.id);}
  else if(await G.purchaseEvent(db,st,obj)){}
  else if(event.type.startsWith('payment_intent.')){if(!await require('../lib/residential-feedback.cjs').reconcile(db,st,obj.id))await S.reconcilePayment(db,st,obj.id);}
  else if(['charge.refunded','charge.dispute.created','charge.dispute.closed'].includes(event.type)){
   let pi=obj.payment_intent;if(!pi&&obj.charge){const c=await st.charges.retrieve(typeof obj.charge==='string'?obj.charge:obj.charge.id);pi=c.payment_intent;}
   if(pi){const id=typeof pi==='string'?pi:pi.id;if(!await require('../lib/residential-feedback.cjs').reconcile(db,st,id))await S.reconcilePayment(db,st,id);}
  }
  return S.json(res,200,{received:true});
 }catch{return S.json(res,500,{error:'Event could not be saved. Retry required.'});}
};
module.exports.config={api:{bodyParser:false}};
