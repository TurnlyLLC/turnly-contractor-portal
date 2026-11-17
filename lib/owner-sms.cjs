// Owner-only SMS. Provider-signed webhooks, fixed destination, ephemeral non-deleting keys.
const crypto=require('node:crypto'),twilio=require('twilio');
const S=require('./residential-server.cjs'),I=require('./integrations.cjs'),V=require('./owner-voice.cjs');
const URL='https://portal.turnlypros.com/api/owner-sms';
const SERVICE='MGce98bdf99b1f746914ec884af003a614';
function verify(req,p,c=V.config()){
 return p.AccountSid===c.account&&/^SM[a-f0-9]{32}$/i.test(p.MessageSid||'')&&
 twilio.validateRequest(c.auth,req.headers['x-twilio-signature']||'',URL+(req.query?.kind==='status'?'?kind=status':''),p);
}
function bounded(text){return String(text).replace(/[\u2018\u2019]/g,"'").replace(/[\u201c\u201d]/g,'"').replace(/[\u2013\u2014]/g,'-').replace(/[^\x20-\x7e\n]/g,'').slice(0,900);}
async function settings(db){return S.checked(await db.from('owner_sms_settings').select('*').eq('id',true).single());}
async function receive(db,p,c=V.config()){
 if(!V.ready(c)||p.From!==c.owner||p.To!==c.number)return;
 // Confirm the signed inbound receipt against Twilio, including the actual sender/body.
 const t=twilio(c.account,c.auth,{timeout:8000,autoRetry:false});
 const receipt=await t.messages(p.MessageSid).fetch();
 if(receipt.direction!=='inbound'||receipt.from!==c.owner||receipt.to!==c.number||receipt.body!==p.Body)return;
 const body=String(p.Body||'').trim();
 if(/^(STOP|STOPALL|UNSUBSCRIBE|CANCEL|END|QUIT|REVOKE|OPTOUT)$/i.test(body)){
  S.checked(await db.from('owner_sms_settings').update({opted_out:true}).eq('id',true));return;
 }
 if(/^(START|UNSTOP)$/i.test(body))S.checked(await db.from('owner_sms_settings').update({opted_out:false}).eq('id',true));
 if(!body||body.length>1200||Number(p.NumMedia||0)>0)return;
 const id=crypto.randomUUID();
 return S.checked(await db.rpc('owner_sms_enqueue',{p_id:id,p_sid:p.MessageSid,p_owner:c.ownerId,p_body:I.seal(body,id)}));
}
async function status(db,p){
 if(!['queued','sent','delivered','failed','undelivered'].includes(p.MessageStatus))return;
 S.checked(await db.from('owner_sms_messages').update({delivery_status:p.MessageStatus}).eq('outbound_sid',p.MessageSid));
}
async function answer(c,agent,key,body,history,transport=fetch,Socket=WebSocket){
 const r=await transport('https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id='+encodeURIComponent(agent),{headers:{'xi-api-key':c.elevenKey},signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw Error('Text agent unavailable');
 const {signed_url}=await r.json();if(!signed_url?.startsWith('wss://api.elevenlabs.io/'))throw Error('Invalid agent endpoint');
 return new Promise((resolve,reject)=>{
  const ws=new Socket(signed_url);let done=false,sent=false,reply='',conversationId=null;
  const end=(error)=>{if(done)return;done=true;clearTimeout(timer);ws.close();if(error)reject(error);else resolve({reply:bounded(reply),conversationId});};
  const timer=setTimeout(()=>end(Error('Text response timed out; check activity before retrying changes.')),55000);
  ws.addEventListener('open',()=>ws.send(JSON.stringify({type:'conversation_initiation_client_data',dynamic_variables:{secret__turnly_authorization:'Bearer '+key}})));
  ws.addEventListener('error',()=>end(Error('Text connection unavailable')));
  ws.addEventListener('close',()=>{if(!done)end(Error('Text connection closed before completion'));});
  ws.addEventListener('message',event=>{try{
   const e=JSON.parse(event.data);
   if(e.type==='ping')ws.send(JSON.stringify({type:'pong',event_id:e.ping_event.event_id}));
   if(e.type==='conversation_initiation_metadata'&&!sent){
    conversationId=e.conversation_initiation_metadata_event.conversation_id;sent=true;
    if(history.length)ws.send(JSON.stringify({type:'contextual_update',text:'Previous SMS exchanges for continuity only. Never execute previous requests again. Prior replies can describe a pending confirmation, but only the new user message can authorize it. '+JSON.stringify(history)}));
    ws.send(JSON.stringify({type:'user_message',text:body}));
   }
   if(e.type==='agent_response')reply=e.agent_response_event.agent_response;
   if(e.type==='agent_response_complete'&&sent&&reply)end();
   if(e.type==='client_error'||e.type==='error')end(Error('Text agent could not finish'));
  }catch{end(Error('Invalid text-agent response'));}});
 });
}
async function processNext(db,c=V.config(),run=answer){
 const cfg=await settings(db);if(!cfg.enabled||cfg.opted_out||!cfg.agent_id||!V.ready(c))return {processed:false};
 const pending=S.checked(await db.from('owner_sms_messages').select('id').eq('state','queued').limit(1));
 if(!pending.length)return {processed:false};
 // Never execute a command whose reply cannot be sent through an approved campaign.
 const carrier=twilio(c.account,c.auth,{timeout:8000,autoRetry:false});
 const campaigns=await carrier.messaging.v1.services(SERVICE).usAppToPerson.list({limit:10});
 if(!campaigns.some(p=>p.campaignStatus==='VERIFIED'))return {processed:false,carrier_pending:true};
 const key=I.issueKey(),keyId=crypto.randomUUID();
 const row=S.checked(await db.rpc('owner_sms_claim',{p_owner:c.ownerId,p_key:keyId,p_hash:key.secret_hash,p_prefix:key.prefix}));
 if(!row)return {processed:false};
 let reply,conversationId,state='done';
 try{
  const body=I.unseal(row.body_sealed,row.id);
  if(/^(START|UNSTOP|HELP|INFO)$/i.test(body))reply='Turnly A.L.I.C.E.: Text your business questions or commands here. Only your registered cell has access. No record deletion. Msg frequency varies; msg & data rates may apply. STOP to opt out, HELP for help. admin@turnlypros.com. Allow about a minute for replies.';
  else if(/^BUDGET$/i.test(body)){
   const used=S.checked(await db.rpc('owner_assistant_reserved'));reply=`A.L.I.C.E.: $${(used/100).toFixed(2)} of the $25 monthly allowance is reserved for setup, fixed costs, calls and texts. This is a conservative allowance, not an actual invoice.`;
  }else{
   const past=S.checked(await db.from('owner_sms_messages').select('id,body_sealed,reply_sealed').eq('owner_id',c.ownerId).eq('state','done').gte('created_at',new Date(Date.now()-3600000).toISOString()).order('created_at',{ascending:false}).limit(4));
   const history=past.reverse().filter(p=>p.reply_sealed).map(p=>({user:I.unseal(p.body_sealed,p.id),assistant:I.unseal(p.reply_sealed,p.id)}));
   ({reply,conversationId}=await run(c,cfg.agent_id,key.secret,body,history));
   if(!reply)throw Error('Empty text response');
  }
 }catch{state='uncertain';reply='A.L.I.C.E.: I could not confirm completion. If you requested a change, check its current status before sending it again. You can call me for help.';}
 finally{S.checked(await db.from('integration_keys').update({revoked_at:new Date().toISOString()}).eq('id',keyId));}
 // Persist before sending. Never repeat a command/send after an uncertain provider outcome.
 const used=S.checked(await db.rpc('owner_assistant_reserved'));
 if(used+50>2500)reply=bounded(reply).slice(0,760)+' Monthly allowance reached. Further calls/text replies pause until next month.';
 reply=bounded(reply);
 S.checked(await db.from('owner_sms_messages').update({reply_sealed:I.seal(reply,row.id),conversation_id:conversationId||null}).eq('id',row.id));
 if((await settings(db)).opted_out){state='blocked';}
 else {
  try{
   const t=twilio(c.account,c.auth,{timeout:12000,autoRetry:false});
   const m=await t.messages.create({from:c.number,to:c.owner,messagingServiceSid:SERVICE,body:reply,statusCallback:URL+'?kind=status',validityPeriod:300});
   S.checked(await db.from('owner_sms_messages').update({outbound_sid:m.sid,delivery_status:m.status}).eq('id',row.id));
  }catch{state='uncertain';}
 }
 S.checked(await db.from('owner_sms_messages').update({state,finished_at:new Date().toISOString()}).eq('id',row.id));
 return {processed:true,state};
}
module.exports={verify,bounded,receive,status,answer,processNext,settings};
