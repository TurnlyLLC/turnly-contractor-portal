const crypto=require('node:crypto'),twilio=require('twilio'),S=require('./residential-server.cjs'),V=require('./owner-voice.cjs');
const audio=n=>'https://portal.turnlypros.com/assets/alice/'+n+'.mp3';
function stop(name='unavailable'){const out=new twilio.twiml.VoiceResponse();out.play(audio(name));out.hangup();return out.toString();}
function prompt(id,retry=false){const out=new twilio.twiml.VoiceResponse();out.gather({input:'speech',timeout:8,speechTimeout:1,language:'en-US',actionOnEmptyResult:true,action:V.hook('passphrase',id),method:'POST'}).play(audio(retry?'retry':'greeting'));out.hangup();return out.toString();}
function normalize(value){return String(value||'').trim().toLowerCase().replace(/[.!?]+$/,'');}
async function authorize(db,p,id,c,connect=require('./owner-voice-elevenlabs.cjs').connect){
 const row=await V.getSession(db,id);
 if(!row||!row.direct_call||row.incoming_sid!==p.CallSid||p.From!==c.owner||p.To!==c.number||row.state!=='reserved'||Date.parse(row.expires_at)<=Date.now())return stop();
 const auth=S.checked(await db.from('owner_voice_auth').select('salt').eq('id',true).single());
 // Never log, persist, or forward SpeechResult to the conversational agent.
 const candidate=normalize(p.SpeechResult);const hash=crypto.scryptSync(candidate.slice(0,160),auth.salt,32).toString('hex');
 const ok=S.checked(await db.rpc('owner_voice_verify',{p_id:id,p_hash:hash}));
 if(ok)return connect(db,id,{...c,directCall:true});
 const current=await V.getSession(db,id);
 if(current.auth_attempts>=3||!candidate){await db.rpc('owner_voice_finish',{p_id:id,p_status:'failed',p_seconds:0});return stop('locked');}
 return prompt(id,true);
}
module.exports={prompt,authorize,normalize,stop};
