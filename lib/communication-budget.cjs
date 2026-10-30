const S=require('./residential-server.cjs');
const twilio=require('twilio');
const client=()=>twilio(process.env.TWILIO_API_KEY_SID||process.env.TWILIO_ACCOUNT_SID,process.env.TWILIO_API_KEY_SECRET||process.env.TWILIO_AUTH_TOKEN,{accountSid:process.env.TWILIO_ACCOUNT_SID,timeout:12000,autoRetry:false});
function segments(body){
 // UTF-16 units are deliberately conservative for non-GSM characters and emoji.
 const basic="@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
 const extended='^{}\\[~]|€';let units=0;
 for(const c of body){if(basic.includes(c))units++;else if(extended.includes(c))units+=2;else return body.length<=70?1:Math.ceil(body.length/67);}
 return units<=160?1:Math.ceil(units/153);
}
async function reserve(db,id,user,channel,source,units=1){const r=await db.rpc('communication_reserve',{p_id:id,p_user:user||null,p_channel:channel,p_source:source,p_units:units});if(r.error)throw S.fail(r.error.message,409);return r.data;}
async function settle(db,id,units,status,release=false){S.checked(await db.rpc('communication_settle',{p_id:id,p_units:units,p_status:status,p_release:release}));}
async function sendSms(db,{id,user,to,body,source,messagingServiceSid,from}){
 const {parsePhoneNumberFromString}=require('libphonenumber-js');
 if(parsePhoneNumberFromString(to)?.country!=='US')throw S.fail('Texting is limited to United States numbers.',400);
 const units=segments(body);await reserve(db,id,user,'sms',source,units);
 let receipt;
 try{
  const response=await fetch(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`,{method:'POST',signal:AbortSignal.timeout(18000),headers:{Authorization:'Basic '+Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({To:to,Body:body,...(messagingServiceSid?{MessagingServiceSid:messagingServiceSid}:{From:from})}).toString()});
  receipt=await response.json();if(!response.ok)throw Object.assign(Error('Provider rejected send'),{status:response.status});if(!receipt.sid)throw Error('Missing provider receipt');
 }
 catch(e){
  // A timeout or 5xx may already have sent the message. Preserve its reservation.
  if(e.status>=400&&e.status<500)await settle(db,id,units,'rejected');
  throw S.fail(e.status>=400&&e.status<500?'Twilio rejected this text. Check the sender configuration and recipient.':'Text outcome is unknown. Its budget remains reserved; check Twilio before retrying.',503);
 }
 S.checked(await db.from('communication_usage').update({provider_id:receipt.sid,provider_status:receipt.status}).eq('id',id));
 await settle(db,id,units,receipt.status||'accepted');return receipt;
}
async function sync(db){
 const t=client(),now=new Date(),day=now.toISOString().slice(0,10),month=day.slice(0,7)+'-01';
 const [daily,monthly,balance]=await Promise.all([t.usage.records.today.list({category:'totalprice',limit:10}),t.usage.records.thisMonth.list({category:'totalprice',limit:10}),t.balance.fetch()]);
 const amount=rows=>Math.ceil(rows.reduce((sum,r)=>sum+Math.abs(Number(r.price)||0)*100,0));
 S.checked(await db.from('communication_provider_usage').update({day,month,daily_cents:amount(daily),monthly_cents:amount(monthly),balance:Number(balance.balance),synced_at:now.toISOString(),error:null}).eq('id',true));
 const pending=S.checked(await db.from('communication_usage').select('*').eq('state','reserved').order('created_at').limit(100));
 const recent=S.checked(await db.from('communication_usage').select('*').order('created_at',{ascending:false}).limit(100));
 const records=[...new Map([...pending,...recent].map(r=>[r.id,r])).values()];
 for(const row of records){try{
  if(row.channel==='call'){
   const call=S.checked(await db.from('crm_voice_calls').select('*').eq('id',row.id).maybeSingle());
   if(!call)continue;
   if(!call.parent_sid){
    // The same advisory lock also protects call consumption from racing expiration.
    if(Date.now()-Date.parse(row.created_at)>180000)S.checked(await db.rpc('communication_expire_call',{p_id:row.id}));
    continue;
   }
   const parent=await t.calls(call.parent_sid).fetch();
   const child=call.call_sid?await t.calls(call.call_sid).fetch():null;
   const terminal=['completed','busy','failed','no-answer','canceled'];
   if(terminal.includes(parent.status)&&(!child||terminal.includes(child.status))){
    const duration=Math.max(Number(parent.duration)||0,Number(child?.duration)||0);
    await settle(db,row.id,Math.max(1,Math.ceil(duration/60))+1,child?.status||parent.status);
    const priced=parent.price!=null&&(!child||child.price!=null);
    S.checked(await db.from('communication_usage').update({provider_id:child?.sid||parent.sid,parent_sid:parent.sid,...(priced?{actual_cents:(Math.abs(Number(parent.price))+Math.abs(Number(child?.price||0)))*100+(call.amd_requested?0.75:0),actual_checked_at:now.toISOString()}:{})}).eq('id',row.id));
   }
  }else if(row.provider_id){const sms=await t.messages(row.provider_id).fetch();if(sms.price!=null)S.checked(await db.from('communication_usage').update({actual_cents:Math.abs(Number(sms.price))*100,actual_checked_at:now.toISOString(),provider_status:sms.status}).eq('id',row.id));}
 }catch{/* Keep uncertain reservations; retry on the next reconciliation. */}}
 S.checked(await db.rpc('communication_alerts'));
}
module.exports={reserve,settle,sendSms,segments,sync};
