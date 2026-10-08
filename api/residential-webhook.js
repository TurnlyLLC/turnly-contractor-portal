const S=require('../lib/residential-server.cjs');
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
  if(event.type==='checkout.session.completed')await S.reconcileSession(db,st,obj.id);
  else if(event.type.startsWith('payment_intent.'))await S.reconcilePayment(db,st,obj.id);
  else if(['charge.refunded','charge.dispute.created','charge.dispute.closed'].includes(event.type)){
   let pi=obj.payment_intent;if(!pi&&obj.charge){const c=await st.charges.retrieve(typeof obj.charge==='string'?obj.charge:obj.charge.id);pi=c.payment_intent;}
   if(pi)await S.reconcilePayment(db,st,typeof pi==='string'?pi:pi.id);
  }
  return S.json(res,200,{received:true});
 }catch{return S.json(res,500,{error:'Event could not be saved. Retry required.'});}
};
module.exports.config={api:{bodyParser:false}};
