const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const V=require('../lib/owner-voice.cjs'),twilio=require('twilio');
const id='11111111-1111-4111-8111-111111111111';
test('OpenAI signature verifies raw body, timestamp, version and rejects replay window',()=>{
 const secret='whsec_'+Buffer.from('test-secret').toString('base64'),raw='{"type":"realtime.call.incoming"}',now=1800000000000;
 const h={'webhook-id':'wh_test','webhook-timestamp':String(now/1000)};
 h['webhook-signature']='v1,'+crypto.createHmac('sha256','test-secret').update(`${h['webhook-id']}.${h['webhook-timestamp']}.${raw}`).digest('base64');
 assert.equal(V.verifyOpenAI(raw,h,secret,now),true);
 assert.equal(V.verifyOpenAI(raw+' ',h,secret,now),false);
 assert.equal(V.verifyOpenAI(raw,h,secret,now+301000),false);
 assert.equal(V.verifyOpenAI(raw,{...h,'webhook-signature':'v1,wrong'},secret,now),false);
});
test('Twilio signature binds exact endpoint, session and account',()=>{
 const c={account:'AC'+'a'.repeat(32),auth:'test-token'},p={AccountSid:'AC'+'a'.repeat(32),CallSid:'CA'+'b'.repeat(32)};
 const req={query:{kind:'authorize',id},headers:{}};
 req.headers['x-twilio-signature']=twilio.getExpectedTwilioSignature(c.auth,V.hook('authorize',id),p);
 assert.equal(V.verifyTwilio(req,p,c),true);
 assert.equal(V.verifyTwilio({...req,query:{kind:'incoming'}},p,c),false);
 assert.equal(V.verifyTwilio(req,{...p,AccountSid:'AC'+'c'.repeat(32)},c),false);
});
test('callback requires keypad authorization and SIP uses TLS with five-minute bound',()=>{
 process.env.CRON_SECRET='test-only-master';
 assert.match(V.callbackPrompt(id),/input="dtmf"/);assert.match(V.callbackPrompt(id),/numDigits="1"/);
 const xml=V.sipResponse(id,{project:'proj_test'});
 assert.match(xml,/transport=tls/);assert.match(xml,/timeLimit="300"/);assert.match(xml,/X-Turnly-Session=/);
 assert.doesNotMatch(xml,/test-only-master/);
});
test('unapproved caller cannot cause a callback or database reservation',async()=>{
 const client={calls:{create(){throw Error('must not dial');}}},db={rpc(){throw Error('must not reserve');}};
 const c={enabled:true,owner:'+19199040553',number:'+12525425686',ownerId:id,project:'proj_test',openaiKey:'test',webhookSecret:'test',account:'test',expectedAccount:'test',auth:'test'};
 assert.equal(V.ready(c),true);
 const result=await V.incoming(db,{To:'+12525425686',From:'+12025550123'},c,client);
 assert.match(result,/private line/);
});
test('voice configuration contains no unrelated model permissions or shell tool',()=>{
 const c=V.sessionConfig('ephemeral-test-key',{model:'gpt-realtime-2.1-mini'});
 assert.equal(c.tools.length,1);assert.equal(c.tools[0].server_url,'https://portal.turnlypros.com/api/turnly-mcp');
 assert.equal(c.max_output_tokens,512);assert.match(c.instructions,/verbal confirmation/);
});
