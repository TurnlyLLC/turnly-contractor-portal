const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite'),M=require('../lib/owner-sms.cjs'),twilio=require('twilio');
const owner='11111111-1111-4111-8111-111111111111';
test('shared voice/SMS allowance, duplicate delivery, private access and non-deleting ephemeral keys',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table profiles(id uuid primary key,role text,status text);
 create table integration_keys(id uuid primary key,name text,secret_hash text,prefix text,scopes text[],created_by uuid,expires_at timestamptz,revoked_at timestamptz,deny_record_deletion boolean default false);
 insert into profiles values('${owner}','admin','active');`);
 for(const f of ['20261117000000_private_owner_voice.sql','20261117131500_owner_voice_retry.sql','20261117160000_owner_sms.sql'])await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations',f),'utf8'));
 const enqueue=async n=>(await db.query('select owner_sms_enqueue($1,$2,$3,$4) result',[`22222222-2222-4222-8222-${String(n).padStart(12,'0')}`,'SM'+String(n).padStart(32,'0'),owner,'sealed'])).rows[0].result;
 assert.equal((await enqueue(1)).blocked,'disabled');
 await db.exec("update owner_sms_settings set enabled=true,opted_out=false,agent_id='agent_test',setup_cents=1500,setup_month=date_trunc('month',now() at time zone 'America/New_York')::date");
 const voice=async n=>(await db.query('select owner_voice_reserve_v2($1,$2) result',['CA'+String(n).padStart(32,'0'),owner])).rows[0].result;
 const call=await voice(1);await db.query("select owner_voice_finish($1,'completed',10)",[call.id]);
 assert.ok((await enqueue(1)).id);assert.equal((await enqueue(1)).replayed,true);
 const claim=async()=> (await db.query('select owner_sms_claim($1,$2,$3,$4) result',[owner,'33333333-3333-4333-8333-333333333333','hash','prefix'])).rows[0].result;
 assert.ok((await claim()).id);assert.equal(await claim(),null,'overlapping worker cannot run same command');
 const k=(await db.query('select * from integration_keys')).rows[0];assert.equal(k.deny_record_deletion,true);assert.deepEqual(k.scopes,['platform:full']);assert.ok(new Date(k.expires_at)-Date.now()<121000);
 await db.exec("update owner_sms_messages set started_at=now()-interval '4 minutes'");assert.equal(await claim(),null);
 assert.ok((await db.query('select revoked_at from integration_keys')).rows[0].revoked_at);
 assert.equal((await db.query('select state from owner_sms_messages')).rows[0].state,'uncertain');
 await enqueue(2);await enqueue(3);assert.equal((await enqueue(4)).blocked,'rate');
 await db.exec("update owner_sms_messages set created_at=now()-interval '2 minutes'");
 assert.ok((await enqueue(4)).id);assert.ok((await enqueue(5)).id);assert.ok((await enqueue(6)).id);
 assert.equal((await voice(2)).blocked,'budget');assert.equal((await enqueue(7)).blocked,'budget');
 assert.equal((await db.query('select owner_assistant_reserved() n')).rows[0].n,2500);
 assert.equal((await db.query("select has_table_privilege('anon','owner_sms_messages','SELECT') v")).rows[0].v,false);
 }finally{await db.close();}
});
test('SMS signature binds URL/account/message SID; reply length bounded',()=>{
 const c={account:'ACtest',auth:'test'},p={AccountSid:'ACtest',MessageSid:'SM'+'a'.repeat(32),From:'+19199040553',To:'+12525425686',Body:'test'};
 const url='https://portal.turnlypros.com/api/owner-sms',req={headers:{'x-twilio-signature':twilio.getExpectedTwilioSignature(c.auth,url,p)},query:{}};
 assert.equal(M.verify(req,p,c),true);assert.equal(M.verify(req,{...p,Body:'changed'},c),false);assert.equal(M.verify({...req,query:{kind:'status'}},p,c),false);
 assert.equal(M.bounded('x'.repeat(2000)).length,900);
});
test('text transport waits for final completion, hides token from prompt, and preserves confirmation context',async()=>{
 let sock;class Socket{constructor(){sock=this;this.handlers={};this.sent=[];queueMicrotask(()=>this.handlers.open());}addEventListener(n,f){this.handlers[n]=f;}send(s){const e=JSON.parse(s);this.sent.push(e);if(e.type==='conversation_initiation_client_data')queueMicrotask(()=>this.emit({type:'conversation_initiation_metadata',conversation_initiation_metadata_event:{conversation_id:'test'}}));if(e.type==='user_message')queueMicrotask(()=>{this.emit({type:'agent_response',agent_response_event:{agent_response:'Done'}});this.emit({type:'agent_response_complete'});});}emit(e){this.handlers.message({data:JSON.stringify(e)});}close(){this.closed=true;}}
 const result=await M.answer({elevenKey:'private'},'agent_test','secret','CONFIRM',[{assistant:'Confirm the exact action'}],async()=>({ok:true,json:async()=>({signed_url:'wss://api.elevenlabs.io/test'})}),Socket);
 assert.equal(result.reply,'Done');assert.ok(sock.closed);assert.equal(sock.sent[0].dynamic_variables.secret__turnly_authorization,'Bearer secret');assert.ok(!JSON.stringify(sock.sent.slice(1)).includes('secret'));assert.ok(sock.sent.some(x=>x.type==='contextual_update'));
});
