const T=require('./crm-training.cjs');
const B=require('./communication-budget.cjs');
const {parsePhoneNumberFromString}=require('libphonenumber-js');
const twilio=require('twilio');
const S=require('./residential-server.cjs');
const C=require('./crm-sales.cjs');
const {phone,uuid}=require('./agent-referrals.cjs');
const ORIGIN='https://sales.turnlypros.com';
const hook=kind=>`${ORIGIN}/api/crm-voice-hook?kind=${kind}`;
function ready(){return process.env.TWILIO_VOICE_ENABLED==='true'&&['TWILIO_ACCOUNT_SID','TWILIO_AUTH_TOKEN','TWILIO_API_KEY_SID','TWILIO_API_KEY_SECRET','TWILIO_TWIML_APP_SID','TWILIO_VOICE_NUMBER'].every(k=>!!process.env[k]);}
function destination(lead){const n=phone(lead.contact_phone);if(parsePhoneNumberFromString(n||'')?.country!=='US')throw S.fail('Save a valid US phone number in this lead’s primary details first.');return n;}
async function prepare(db,user,req,input){
 await T.requireComplete(db,user);
 if(!ready())throw S.fail('Calling is being connected. Your administrator still needs to activate the Twilio connection.',503);
 const lead=await C.leadFor(db,user,input.lead_id),number=destination(lead);
 await S.rate(db,req,'crm_voice');
 const bearer=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
 const session=JSON.parse(Buffer.from(bearer.split('.')[1],'base64url').toString()).session_id;
 if(!uuid(session))throw S.fail('Sign in again before calling.',401);
 const call=S.checked(await db.rpc('crm_prepare_voice_call',{p_user:user.id,p_lead:lead.id,p_session:session,p_number:number}));
 await B.reserve(db,call,user.id,'call','Sales CRM');
 const token=new twilio.jwt.AccessToken(process.env.TWILIO_ACCOUNT_SID,process.env.TWILIO_API_KEY_SID,process.env.TWILIO_API_KEY_SECRET,{identity:`sales_${user.id}`,ttl:120});
 token.addGrant(new twilio.jwt.AccessToken.VoiceGrant({outgoingApplicationSid:process.env.TWILIO_TWIML_APP_SID,incomingAllow:false}));
 return {token:token.toJwt(),intent:call,number,name:lead.contact_name||lead.company_name||'Lead'};
}
function verify(req,params,kind){return !!process.env.TWILIO_AUTH_TOKEN&&params.AccountSid===process.env.TWILIO_ACCOUNT_SID&&twilio.validateRequest(process.env.TWILIO_AUTH_TOKEN,req.headers['x-twilio-signature']||'',hook(kind),params);}
async function connect(db,p){
 const out=new twilio.twiml.VoiceResponse();
 if(!ready()||!uuid(p.Intent)||!/^CA[a-f0-9]{32}$/i.test(p.CallSid||'')){out.hangup();return out.toString();}
 const row=S.checked(await db.rpc('crm_consume_voice_call',{p_id:p.Intent,p_identity:p.From,p_sid:p.CallSid}));
 if(!row){out.hangup();return out.toString();}
 // Re-read the lead after consuming the one-use request. Never dial a browser-supplied number.
 const user={id:row.user_id,admin:row.is_admin};
 try{await T.requireComplete(db,user);const lead=await C.leadFor(db,user,row.lead_id);if(destination(lead)!==row.phone)throw Error('Changed phone');}
 catch{S.checked(await db.from('crm_voice_calls').update({status:'failed'}).eq('id',p.Intent));out.hangup();return out.toString();}
 const budget=S.checked(await db.from('communication_usage').select('max_seconds').eq('id',p.Intent).single());
 const dial=out.dial({callerId:process.env.TWILIO_VOICE_NUMBER,answerOnBridge:true,timeout:30,timeLimit:budget.max_seconds});
 dial.number({statusCallback:hook('status'),statusCallbackMethod:'POST',statusCallbackEvent:['initiated','ringing','answered','completed']},row.phone);
 return out.toString();
}
async function status(db,p){
 if(!/^CA[a-f0-9]{32}$/i.test(p.ParentCallSid||'')||!/^CA[a-f0-9]{32}$/i.test(p.CallSid||''))throw S.fail('Invalid call.',400);
 const seq=Number(p.SequenceNumber),duration=Number(p.CallDuration||0);
 if(!Number.isSafeInteger(seq)||seq<0||!Number.isSafeInteger(duration)||duration<0)throw S.fail('Invalid call event.');
 S.checked(await db.rpc('crm_voice_status',{p_parent:p.ParentCallSid,p_sid:p.CallSid,p_status:p.CallStatus,p_sequence:seq,p_duration:duration}));
 if(['completed','busy','failed','no-answer','canceled'].includes(p.CallStatus)){const row=S.checked(await db.from('crm_voice_calls').select('id').eq('parent_sid',p.ParentCallSid).single());await B.settle(db,row.id,Math.max(1,Math.ceil(duration/60))+1,p.CallStatus);}
}
module.exports={ready,prepare,destination,verify,connect,status,hook};
