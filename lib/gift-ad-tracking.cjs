// Server-only Meta purchase reporting. No receipt URLs, gift codes or contact details.
const {checked}=require('./residential-server.cjs');
const enabled=()=>!!(process.env.META_GIFT_ACCESS_TOKEN&&/^\d+$/.test(process.env.META_GIFT_DATASET_ID||''));
function attribution(input,req){
 if(input?.consent!==true||req.headers?.['sec-gpc']==='1')return null;
 const fbc=typeof input.fbc==='string'&&/^fb\.1\.\d{13}\.[A-Za-z0-9_-]{1,500}$/.test(input.fbc)?input.fbc:null;
 const fbp=typeof input.fbp==='string'&&/^fb\.1\.\d{13}\.\d{1,20}$/.test(input.fbp)?input.fbp:null;
 if(!fbc&&!fbp)return null;
 return {fbc,fbp,consent_version:'2026-11-11',consented_at:new Date().toISOString()};
}
function purchase(o,a,now=Date.now()){
 const time=Date.parse(o.paid_at);
 if(o.status!=='paid'||!o.payment_intent||o.refunded_cents||o.disputed||!Number.isInteger(o.amount_cents)||o.amount_cents<=0||!Number.isFinite(time)||time>now||now-time>6*86400000||!a?.consented_at||(!a.fbc&&!a.fbp))return null;
 return {event_name:'Purchase',event_time:Math.floor(time/1000),event_id:'turnly-gift-'+o.id,action_source:'website',event_source_url:'https://client.turnlypros.com/gift-cards.html',user_data:{...(a.fbc?{fbc:a.fbc}:{}),...(a.fbp?{fbp:a.fbp}:{})},custom_data:{currency:'USD',value:o.amount_cents/100,content_name:'Turnly Gift Card',content_type:'product',content_ids:['turnly-gift-card-100'],num_items:o.quantity}};
}
async function send(event,{testCode,fetcher=fetch}={}){
 const response=await fetcher(`https://graph.facebook.com/v25.0/${process.env.META_GIFT_DATASET_ID}/events`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+process.env.META_GIFT_ACCESS_TOKEN},body:JSON.stringify({data:[event],...(testCode?{test_event_code:testCode}:{})}),signal:AbortSignal.timeout(8000)});
 const result=await response.json();
 if(!response.ok||result.events_received!==1)throw new Error('Meta purchase delivery failed');
 return result;
}
async function report(db,id){
 if(!enabled())return;
 // Reporting must never prevent payment fulfillment or email delivery.
 try{
  const a=checked(await db.from('gift_ad_attribution').select('*').eq('order_id',id).maybeSingle());
  if(!a||a.sent_at)return;
  const o=checked(await db.from('gift_orders').select('id,status,payment_intent,paid_at,amount_cents,quantity,refunded_cents,disputed').eq('id',id).single());
  const event=purchase(o,a);if(!event)return;
  checked(await db.from('gift_ad_attribution').update({attempted_at:new Date().toISOString()}).eq('order_id',id));
  await send(event);
  // Stable event_id also deduplicates concurrent webhook/cron attempts in Meta.
  checked(await db.from('gift_ad_attribution').update({sent_at:new Date().toISOString(),fbc:null,fbp:null}).eq('order_id',id));
 }catch{console.warn('Gift purchase tracking pending retry');}
}
async function retry(db){
 if(!enabled())return;
 const cutoff=new Date(Date.now()-6*86400000).toISOString();
 const rows=checked(await db.from('gift_ad_attribution').select('order_id,gift_orders!inner(status,paid_at)').is('sent_at',null).eq('gift_orders.status','paid').gte('gift_orders.paid_at',cutoff).order('attempted_at',{nullsFirst:true}).limit(20));
 for(const row of rows)await report(db,row.order_id);
 // Remove expired attribution identifiers; keep minimal delivery audit records.
 checked(await db.from('gift_ad_attribution').update({fbc:null,fbp:null}).lt('consented_at',new Date(Date.now()-30*86400000).toISOString()).is('sent_at',null));
}
module.exports={enabled,attribution,purchase,send,report,retry};
