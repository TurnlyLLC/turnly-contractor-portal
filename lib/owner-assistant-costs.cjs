// Only provider-reported USD settles a hold. Missing costs are NOT zero.
const twilio=require('twilio'),S=require('./residential-server.cjs');
const {priceCents}=require('./communication-budget.cjs');
const terminal=new Set(['completed','busy','failed','no-answer','canceled']);
function aiCents(detail){
 const cost=detail?.metadata?.cost_fiat;
 return detail?.status==='done'&&typeof cost==='number'&&Number.isFinite(cost)&&cost>=0?Math.round(cost*1e8)/1e6:null;
}
function totalCosts(calls){
 if(!calls.length||calls.some(c=>!terminal.has(c.status)))return null;
 const prices=calls.map(priceCents);return prices.some(p=>p===null)?null:prices.reduce((a,b)=>a+b,0);
}
function combined(phone,ai){return phone===null||ai===null?null:Math.round((phone+ai)*1e6)/1e6;}
async function reconcile(db,c,client=twilio(c.account,c.auth,{timeout:8000,autoRetry:false}),transport=fetch){
 await require('./owner-voice.cjs').reconcileFinished(db,c,client);
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit'}).formatToParts(new Date()).map(p=>[p.type,p.value]));
 const month=`${parts.year}-${parts.month}-01`,old=new Date(Date.now()-60000).toISOString();
 const get=async path=>{const r=await transport('https://api.elevenlabs.io/v1/convai/'+path,{headers:{'xi-api-key':c.elevenKey},signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error('Provider billing unavailable');return r.json();};
 const rows=S.checked(await db.from('owner_voice_sessions').select('*').in('state',['completed','failed']).is('actual_cents',null).or(`billing_checked_at.is.null,billing_checked_at.lt.${old}`).gte('created_at',month).order('created_at',{ascending:false}).limit(8));
 let listed=null,settled=0;
 for(const row of rows){
  let phone=row.twilio_cents==null?null:Number(row.twilio_cents),ai=row.ai_cents==null?null:Number(row.ai_cents),conversation=row.conversation_id;
  try{
   const calls=[await client.calls(row.incoming_sid).fetch()];
   if(row.callback_sid){if(row.callback_sid!==row.incoming_sid)calls.push(await client.calls(row.callback_sid).fetch());calls.push(...await client.calls.list({parentCallSid:row.callback_sid,limit:100}));}
   phone=totalCosts(calls);
   if(row.direct_call&&!row.openai_call_id&&row.state==='failed')ai=0;
   // A failed callback request can have an uncertain provider outcome; do not assume zero AI cost.
   if(row.openai_call_id?.startsWith('elevenlabs_')){
    if(conversation){const d=await get('conversations/'+conversation);if(d.metadata?.phone_call?.call_sid===row.callback_sid)ai=aiCents(d);}
    else{
     if(!listed)listed=await get('conversations?agent_id='+encodeURIComponent(c.elevenAgent)+'&page_size=100');
     for(const candidate of listed.conversations||[]){
      if(Math.abs(candidate.start_time_unix_secs*1000-Date.parse(row.created_at))>120000)continue;
      const d=await get('conversations/'+candidate.conversation_id);
      if(d.metadata?.phone_call?.call_sid===row.callback_sid){conversation=candidate.conversation_id;ai=aiCents(d);break;}
     }
    }
   }
  }catch{/* Preserve unknown cost and existing hold; retry on the next scheduled sync. */}
  const actual=combined(phone,ai);if(actual!==null)settled++;
  S.checked(await db.from('owner_voice_sessions').update({twilio_cents:phone,ai_cents:ai,actual_cents:actual,conversation_id:conversation||null,billing_checked_at:new Date().toISOString()}).eq('id',row.id));
 }
 const sms=S.checked(await db.from('owner_sms_messages').select('*').in('state',['done','uncertain','blocked']).is('actual_cents',null).or(`billing_checked_at.is.null,billing_checked_at.lt.${old}`).gte('created_at',month).limit(8));
 for(const row of sms){
  let phone=null,ai=null;
  try{
   const incoming=await client.messages(row.message_sid).fetch(),out=row.outbound_sid?await client.messages(row.outbound_sid).fetch():null;
   const inboundPrice=priceCents(incoming),outboundPrice=out?priceCents(out):null;
   if(inboundPrice!==null&&outboundPrice!==null)phone=inboundPrice+outboundPrice;
   if(row.conversation_id)ai=aiCents(await get('conversations/'+row.conversation_id));
   // Only a known completed local HELP/START/BUDGET reply incurred no AI call.
   else if(row.state==='done'&&row.outbound_sid)ai=0;
  }catch{}
  const actual=combined(phone,ai);if(actual!==null)settled++;
  S.checked(await db.from('owner_sms_messages').update({twilio_cents:phone,ai_cents:ai,actual_cents:actual,billing_checked_at:new Date().toISOString()}).eq('id',row.id));
 }
 const checks=S.checked(await db.from('owner_assistant_diagnostics').select('id,conversation_id').is('actual_cents',null).not('conversation_id','is',null).or(`billing_checked_at.is.null,billing_checked_at.lt.${old}`).gte('created_at',month).limit(8));
 for(const row of checks){try{const actual=aiCents(await get('conversations/'+row.conversation_id));if(actual!==null){S.checked(await db.from('owner_assistant_diagnostics').update({actual_cents:actual,state:'done',finished_at:new Date().toISOString(),billing_checked_at:new Date().toISOString()}).eq('id',row.id));settled++;}}catch{/* Keep the diagnostic hold until the provider reports USD. */}}
 // Media Streams are separate from Call.price. Conservatively count this account's entire category.
 try{
  const streams=await client.usage.records.list({category:'calls-media-stream-minutes',startDate:new Date(month+'T00:00:00Z'),endDate:new Date(),limit:100});
  const prices=streams.map(priceCents);
  if(streams.length&&prices.every(p=>p!==null))S.checked(await db.from('owner_sms_settings').update({stream_month:month,stream_cents:prices.reduce((a,b)=>a+b,0)}).eq('id',true));
 }catch{/* Fixed-cost buffer remains available for delayed feature fees. */}
 return {settled};
}
module.exports={aiCents,totalCosts,combined,reconcile};
