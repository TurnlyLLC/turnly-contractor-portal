const test=require('node:test'),assert=require('node:assert/strict');
const {connect}=require('../lib/owner-voice-elevenlabs.cjs');
const id='11111111-1111-4111-8111-111111111111';
const config={elevenKey:'test-only',elevenAgent:'agent_test',ownerId:id,owner:'+19199040553',number:'+12525425686'};
function database(accept=true){const calls=[];return {calls,async rpc(name,args){calls.push({name,args});return {data:name==='owner_voice_accept'?(accept?{key_sealed:args.p_sealed}:null):null};},from(){return {update(){return {eq(){return {eq:async()=>({data:null})};}};}};}};}
test('ElevenLabs receives only a per-call token in a secret header variable',async()=>{
 process.env.CRON_SECRET='test-only-master';const db=database();
 const xml=await connect(db,id,config,async(url,opts)=>{
  assert.equal(url,'https://api.elevenlabs.io/v1/convai/twilio/register-call');
  const b=JSON.parse(opts.body);assert.equal(b.direction,'outbound');assert.equal(b.to_number,config.owner);
  assert.match(b.conversation_initiation_client_data.dynamic_variables.secret__turnly_authorization,/^Bearer tl_live_/);
  assert.equal(b.conversation_initiation_client_data.conversation_config_override,undefined);
  return {ok:true,text:async()=>JSON.stringify('<Response><Connect><Stream url="wss://api.elevenlabs.io/test"/></Connect></Response>')};
 });assert.match(xml,/<Connect>/);assert.equal(db.calls[0].name,'owner_voice_accept');
});
test('expired callback authorization never contacts ElevenLabs',async()=>{
 process.env.CRON_SECRET='test-only-master';await assert.rejects(connect(database(false),id,config,()=>{throw Error('must not call');}),/authorization expired/);
});
test('uncertain provider setup revokes the session token',async()=>{
 process.env.CRON_SECRET='test-only-master';const db=database();await assert.rejects(connect(db,id,config,async()=>({ok:false})),/could not connect/);
 assert.equal(db.calls.at(-1).name,'owner_voice_finish');assert.equal(db.calls.at(-1).args.p_status,'failed');
});
