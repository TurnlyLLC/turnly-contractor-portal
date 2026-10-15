const {randomInt}=require('node:crypto');
const fs=require('node:fs'),path=require('node:path');
const {PDFDocument,StandardFonts,rgb}=require('pdf-lib');
const QR=require('qrcode'),S=require('./residential-server.cjs');
const TERMS='2026-10-15.1',alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
function code(){return Array.from({length:24},()=>alphabet[randomInt(36)]).join('');}
function normalize(v){return String(v||'').replace(/[\s-]/g,'').toUpperCase();}
function valid(v){return /^[A-Z0-9]{24}$/.test(v);}
function ready(){return S.ready()&&!!process.env.RESEND_API_KEY&&!!process.env.REFERRAL_FROM_EMAIL;}
async function card(db,value){const c=normalize(value);if(!valid(c))throw S.fail('Enter the 24-character gift code.');const row=S.checked(await db.from('gift_cards').select('*').eq('code',c).maybeSingle());if(!row)throw S.fail('Gift card not found.',404);return row;}
async function event(db,c,kind,details={}){S.checked(await db.from('gift_events').insert({card_id:c.id,order_id:c.order_id,kind,details}));}
async function pdf(cards){
 const doc=await PDFDocument.create(),template=await PDFDocument.load(fs.readFileSync(path.join(__dirname,'../assets/gift-card-template.pdf')));
 const [art]=await doc.embedPages([template.getPage(0)]),font=await doc.embedFont(StandardFonts.CourierBold),small=await doc.embedFont(StandardFonts.Helvetica);
 for(const c of cards){
  const page=doc.addPage([art.width,art.height]),w=art.width,h=art.height;
  page.drawPage(art);const box=(x,y,ww,hh,color)=>page.drawRectangle({x:x*w,y:(1-y-hh)*h,width:ww*w,height:hh*h,color});
  const link=`${S.ORIGIN}/residential-referral.html#gift=${c.code}`;
  const png=await doc.embedPng(await QR.toBuffer(link,{errorCorrectionLevel:'M',margin:3,width:700}));
  box(.097,.538,.294,.221,rgb(1,1,1));page.drawImage(png,{x:.106*w,y:(1-.548-.201)*h,width:.272*w,height:.201*h});
  box(.433,.696,.472,.051,rgb(.018,.12,.18));
  page.drawText(c.code.match(/.{1,6}/g).join(' '),{x:.444*w,y:.275*h,size:11*w/612,font,color:rgb(1,1,1)});
  box(.60,.929,.36,.035,rgb(.005,.052,.078));
  page.drawText('No expiration. NC service areas only.',{x:.62*w,y:.052*h,size:8*w/612,font:small,color:rgb(.8,.9,.94)});
  page.drawText('Terms: portal.turnlypros.com/gift-card-terms.html',{x:.59*w,y:.040*h,size:7*w/612,font:small,color:rgb(.8,.9,.94)});
 }
 return Buffer.from(await doc.save());
}
async function deliver(db,o){
 if(o.email_id)return;
 // Preserve ambiguous delivery for human review once the provider's 24h idempotency window expires.
 if(o.email_attempted_at&&Date.now()-Date.parse(o.email_attempted_at)>23*3600000){S.checked(await db.from('gift_orders').update({email_status:'review'}).eq('id',o.id));return;}
 const cards=S.checked(await db.from('gift_cards').select('*').eq('order_id',o.id).order('ordinal'));
 const bytes=await pdf(cards);
 S.checked(await db.from('gift_orders').update({email_attempted_at:o.email_attempted_at||new Date().toISOString(),email_status:'sending'}).eq('id',o.id));
 const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`gift-order-${o.id}`},body:JSON.stringify({from:process.env.REFERRAL_FROM_EMAIL,to:[o.email],subject:`Your Turnly gift cards — ${o.quantity} × $100`,text:`Thank you for your purchase. Your ${o.quantity} individual $100 Turnly gift card(s) are attached in one PDF, one card per page. Print or share each card with its recipient. Each QR code opens booking with that card already entered. Protect the code like cash. No expiration. Valid only for eligible Turnly services in our North Carolina service areas. Terms: ${S.ORIGIN}/gift-card-terms.html\n\nOrder: ${o.id}\nSupport: admin@turnlypros.com`,attachments:[{filename:'Turnly-Gift-Cards.pdf',content:bytes.toString('base64')}] }),signal:AbortSignal.timeout(20000)});
 if(!r.ok){await db.from('gift_orders').update({email_status:'failed'}).eq('id',o.id);throw S.fail('Your cards are safe. Email delivery needs a retry.',503);}
 const data=await r.json();if(!data.id)throw S.fail('Email confirmation is pending.',503);
 S.checked(await db.from('gift_orders').update({email_id:data.id,email_status:'accepted'}).eq('id',o.id));
 S.checked(await db.from('gift_events').insert(cards.map(c=>({card_id:c.id,order_id:o.id,kind:'email_accepted',details:{provider_id:data.id}}))));
}
async function deliveryStatus(db,o){
 if(!o.email_id)return;
 const response=await fetch(`https://api.resend.com/emails/${encodeURIComponent(o.email_id)}`,{headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`},signal:AbortSignal.timeout(15000)});
 if(!response.ok)return;
 const result=await response.json(),status=result.last_event;
 if(!['sent','delivered','delivery_delayed','bounced','complained','opened','clicked','failed'].includes(status)||status===o.email_status)return;
 S.checked(await db.from('gift_orders').update({email_status:status}).eq('id',o.id));
 const cards=S.checked(await db.from('gift_cards').select('id').eq('order_id',o.id));
 S.checked(await db.from('gift_events').insert(cards.map(c=>({card_id:c.id,order_id:o.id,kind:'email_'+status,details:{provider_id:o.email_id}}))));
}
async function fulfill(db,st,id){
 const session=await st.checkout.sessions.retrieve(id);
 if(session.metadata?.purpose!=='turnly_gift_cards')return false;
 const o=S.checked(await db.from('gift_orders').select('*').eq('id',session.client_reference_id).maybeSingle());
 if(!o||o.stripe_session!==id||session.metadata.order_id!==o.id||session.mode!=='payment'||session.currency!=='usd'||session.amount_total!==o.amount_cents)throw S.fail('Payment does not match the gift order.',409);
 if(session.payment_status!=='paid')return true;
 const intent=typeof session.payment_intent==='string'?session.payment_intent:session.payment_intent?.id;
 const pi=await st.paymentIntents.retrieve(intent,{expand:['latest_charge']});
 if(pi.status!=='succeeded'||pi.amount_received!==o.amount_cents||pi.latest_charge?.amount_refunded||pi.latest_charge?.disputed){if(o.status==='paid')S.checked(await db.rpc('gift_freeze_order',{p_order:o.id,p_reason:'Payment refunded or disputed'}));return true;}
 if(o.status==='review')return true;
 S.checked(await db.rpc('gift_issue',{p_order:o.id,p_session:id,p_intent:intent,p_codes:Array.from({length:o.quantity},code)}));
 await deliver(db,{...o,status:'paid'});return true;
}
async function purchaseEvent(db,st,obj){
 let intent=obj.payment_intent;if(!intent&&obj.object==='payment_intent')intent=obj.id;
 if(!intent&&obj.charge){const c=await st.charges.retrieve(typeof obj.charge==='string'?obj.charge:obj.charge.id);intent=c.payment_intent;}
 if(!intent)return false;intent=typeof intent==='string'?intent:intent.id;
 const pi=await st.paymentIntents.retrieve(intent,{expand:['latest_charge']});
 if(pi.metadata?.purpose!=='turnly_gift_cards')return false;
 const o=S.checked(await db.from('gift_orders').select('*').eq('id',pi.metadata.order_id).maybeSingle());
 if(o&&pi.latest_charge&&(pi.latest_charge.amount_refunded||pi.latest_charge.disputed)){
  // Program refunds identify the individual card. Unrecognized dashboard adjustments freeze all remaining value.
  const refunds=await st.refunds.list({payment_intent:intent,limit:100});
  const known=S.checked(await db.from('gift_cards').select('id,refund_id,status').eq('order_id',o.id));
  const ids=new Set(known.map(c=>c.refund_id).filter(Boolean));
  if(pi.latest_charge.disputed||refunds.has_more||refunds.data.some(r=>!ids.has(r.id)&&!known.some(c=>c.id===r.metadata?.gift_card_id&&c.status==='refund_pending'&&r.amount===10000)))S.checked(await db.rpc('gift_freeze_order',{p_order:o.id,p_reason:'External refund or dispute — review in Stripe'}));
 }
 return true;
}
module.exports={TERMS,code,normalize,valid,ready,card,event,pdf,deliver,deliveryStatus,fulfill,purchaseEvent};
