// Called only after the existing signed Twilio callback and keypad verification.
// The bearer token is short-lived, non-deleting and never placed in model text.
const crypto=require('node:crypto'),S=require('./residential-server.cjs'),I=require('./integrations.cjs');
async function connect(db,id,c,transport=fetch){
 if(!c.elevenKey||!/^agent_[a-z0-9]+$/i.test(c.elevenAgent||''))throw S.fail('Alice voice is not configured.',503);
 const key=I.issueKey();
 const claimed=S.checked(await db.rpc('owner_voice_accept',{p_id:id,p_call_id:'elevenlabs_'+id,
  p_key_id:crypto.randomUUID(),p_hash:key.secret_hash,p_prefix:key.prefix,p_sealed:I.seal(key.secret,id),p_owner:c.ownerId}));
 if(!claimed)throw S.fail('Voice authorization expired.',403);
 try{
  const response=await transport('https://api.elevenlabs.io/v1/convai/twilio/register-call',{
   method:'POST',headers:{'xi-api-key':c.elevenKey,'Content-Type':'application/json'},
   body:JSON.stringify({agent_id:c.elevenAgent,from_number:c.number,to_number:c.owner,direction:'outbound',
    conversation_initiation_client_data:{dynamic_variables:{secret__turnly_authorization:'Bearer '+I.unseal(claimed.key_sealed,id)}}}),
   signal:AbortSignal.timeout(15000)
  });
  if(!response.ok)throw Error('ElevenLabs registration failed');
  const raw=await response.text();
  let twiml=raw;
  // The REST endpoint may encode the XML as a JSON string.
  if(raw.trim().startsWith('"'))twiml=JSON.parse(raw);
  if(typeof twiml!=='string'||twiml.length>30000||!/<Response[\s>]/.test(twiml)||!/<Connect[\s>]/.test(twiml)||!/<Stream[\s>]/.test(twiml))throw Error('Invalid ElevenLabs call response');
  S.checked(await db.from('owner_voice_sessions').update({state:'active'}).eq('id',id).eq('state','accepting'));
  return twiml;
 }catch{
  // Revoke on an uncertain setup. Do not reuse a token or retry registration blindly.
  await db.rpc('owner_voice_finish',{p_id:id,p_status:'failed',p_seconds:0});
  throw S.fail('Alice could not connect. Please try again later.',503);
 }
}
module.exports={connect};
