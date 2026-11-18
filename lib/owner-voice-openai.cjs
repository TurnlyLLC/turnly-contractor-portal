const crypto=require('node:crypto'),twilio=require('twilio'),S=require('./residential-server.cjs'),I=require('./integrations.cjs'),V=require('./owner-voice.cjs'),O=require('./owner-openai.cjs'),A=require('./owner-voice-auth.cjs');
const URL='https://portal.turnlypros.com/api/alice-voice',VOICE='Jun8ZAjRndwae1uTSpoZ';
const url=(kind,id,sequence)=>URL+'?kind='+kind+'&id='+id+'&sequence='+sequence;
function gather(id,sequence,audio){const out=new twilio.twiml.VoiceResponse();const g=out.gather({input:'speech',timeout:10,speechTimeout:1,language:'en-US',actionOnEmptyResult:true,action:url('turn',id,sequence),method:'POST'});if(audio)g.play(audio);out.hangup();return out.toString();}
function waiting(id,sequence){const out=new twilio.twiml.VoiceResponse();out.pause({length:1});out.redirect({method:'POST'},url('poll',id,sequence));return out.toString();}
function hangup(text){return /^(?:alice[, ]+)?(?:that['’]?s all for now|that is all for now|hang up|end (?:the )?call)[.! ]*$/i.test(String(text||'').trim());}
function audioToken(id,sequence){return crypto.createHmac('sha256',process.env.CRON_SECRET).update('alice-reply:'+id+':'+sequence).digest('hex');}
async function connect(db,id,c){
 const key=I.issueKey();const row=S.checked(await db.rpc('owner_voice_accept',{p_id:id,p_call_id:'responses_'+id,p_key_id:crypto.randomUUID(),p_hash:key.secret_hash,p_prefix:key.prefix,p_sealed:I.seal(key.secret,id),p_owner:c.ownerId}));
 if(!row)throw S.fail('Voice authorization expired.',403);
 S.checked(await db.from('owner_voice_sessions').update({state:'active',expires_at:new Date(Date.now()+300000).toISOString()}).eq('id',id).eq('state','accepting'));
 return gather(id,1,'https://portal.turnlypros.com/assets/alice/connected.mp3');
}
async function valid(db,p,id,c){const s=await V.getSession(db,id);return s&&s.direct_call&&s.state==='active'&&s.openai_call_id==='responses_'+id&&Date.parse(s.expires_at)>Date.now()&&s.incoming_sid===p.CallSid&&p.From===c.owner&&p.To===c.number?s:null;}
async function turn(db,p,id,sequence,c){
 const s=await valid(db,p,id,c);if(!s)return A.stop();
 const body=String(p.SpeechResult||'').trim();if(!body||hangup(body)){await db.rpc('owner_voice_finish',{p_id:id,p_status:'completed',p_seconds:Math.ceil((Date.now()-Date.parse(s.created_at))/1000)});const out=new twilio.twiml.VoiceResponse();out.hangup();return out.toString();}
 if(body.length>3000)return A.stop();
 const row=S.checked(await db.rpc('owner_openai_turn',{p_session:id,p_sequence:sequence,p_body:I.seal(body,id)}));if(!row)return A.stop();
 if(!row.replayed)require('@vercel/functions').waitUntil(processTurn(db,row,s,c));
 return waiting(id,sequence);
}
async function speech(c,text,transport=fetch){const r=await transport('https://api.elevenlabs.io/v1/text-to-speech/'+VOICE+'?output_format=mp3_22050_32',{method:'POST',headers:{'xi-api-key':c.elevenKey,'Content-Type':'application/json'},body:JSON.stringify({text,model_id:'eleven_flash_v2_5'}),signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('Voice generation unavailable');const bytes=Buffer.from(await r.arrayBuffer());if(!bytes.length||bytes.length>500000)throw Error('Invalid voice response');return {bytes,ttsCents:text.length*0.005};}
async function processTurn(db,row,s,c){
 const id=s.id;
 try{
  const past=S.checked(await db.from('owner_openai_turns').select('body_sealed,reply_sealed').eq('session_id',id).eq('state','done').order('sequence',{ascending:false}).limit(4));
  const history=past.reverse().map(x=>({user:I.unseal(x.body_sealed,id),assistant:I.unseal(x.reply_sealed,id)}));
  const result=await O.answer(c,null,I.unseal(s.key_sealed,id),I.unseal(row.body_sealed,id),history,fetch,null,{mode:'voice',
   beforeTool:async()=>{const current=await V.getSession(db,id);if(current?.state!=='active'||Date.parse(current.expires_at)<Date.now())throw Error('Call ended');},
   onConversation:async response_id=>{S.checked(await db.from('owner_openai_turns').update({response_id,state:'running'}).eq('id',row.id));},
   onCost:async ai_cents=>{S.checked(await db.from('owner_openai_turns').update({ai_cents}).eq('id',row.id));}});
  const current=await V.getSession(db,id);if(current?.state!=='active'||Date.parse(current.expires_at)<Date.now())throw Error('Call ended');
  const reply=result.reply.slice(0,800);S.checked(await db.from('owner_openai_turns').update({state:'audio',reply_sealed:I.seal(reply,id)}).eq('id',row.id));
  const audio=await speech(c,reply);S.checked(await db.from('owner_openai_turns').update({state:'done',audio_sealed:I.seal(audio.bytes.toString('base64'),id),tts_cents:audio.ttsCents}).eq('id',row.id));
 }catch{await db.from('owner_openai_turns').update({state:'uncertain'}).eq('id',row.id);}
}
async function poll(db,p,id,sequence,c){
 if(!await valid(db,p,id,c))return A.stop();
 const row=S.checked(await db.from('owner_openai_turns').select('*').eq('session_id',id).eq('sequence',sequence).maybeSingle());if(!row)return A.stop();
 if(Date.now()-Date.parse(row.created_at)>75000||row.state==='uncertain'){if(row.response_id)try{await O.cancel(c,row.response_id);}catch{}return A.stop();}
 if(row.state!=='done')return waiting(id,sequence);
 return gather(id,sequence+1,url('audio',id,sequence)+'&token='+audioToken(id,sequence));
}
async function audio(db,id,sequence,token){if(!V.constant(token,audioToken(id,sequence)))throw S.fail('Unauthorized.',403);const s=await V.getSession(db,id);if(!s||s.state!=='active'||Date.parse(s.expires_at)<Date.now())throw S.fail('Expired.',403);const row=S.checked(await db.from('owner_openai_turns').select('audio_sealed').eq('session_id',id).eq('sequence',sequence).eq('state','done').maybeSingle());if(!row?.audio_sealed)throw S.fail('Unavailable.',404);return Buffer.from(I.unseal(row.audio_sealed,id),'base64');}
module.exports={URL,VOICE,url,gather,waiting,hangup,audioToken,connect,valid,turn,poll,audio,speech,processTurn};
