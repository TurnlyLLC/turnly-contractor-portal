const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite'),twilio=require('twilio'),V=require('../lib/crm-voice.cjs');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('webhooks reject forged signatures and numbers must come from a valid primary phone',()=>{
 process.env.TWILIO_AUTH_TOKEN='test-secret';process.env.TWILIO_ACCOUNT_SID='ACtest';
 assert.equal(V.destination({contact_phone:'(919) 555-0100'}),'+19195550100');
 assert.throws(()=>V.destination({contact_phone:'+442071234567'}));
 assert.equal(V.verify({headers:{}},{AccountSid:'ACtest'},'connect'),false);
 const p={AccountSid:'ACtest',From:'client:test'},sig=twilio.getExpectedTwilioSignature('test-secret',V.hook('connect'),p);
 assert.equal(V.verify({headers:{'x-twilio-signature':sig}},p,'connect'),true);
 assert.equal(V.verify({headers:{'x-twilio-signature':sig}},{...p,From:'client:forged'},'connect'),false);
 delete process.env.TWILIO_AUTH_TOKEN;delete process.env.TWILIO_ACCOUNT_SID;
});
test('one-use dialing verifies identity, ownership, opt-outs and deactivation; callbacks are idempotent',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create table profiles(id uuid primary key,role text,status text,full_name text);
 create table sales_leads(id uuid primary key,business_segment text,sales_owner_id uuid,do_not_contact boolean,pipeline_stage text default 'new_leads',last_activity_at timestamptz);
 create table crm_user_access(user_id uuid,enabled boolean,must_change_password boolean);
 create function crm_server_session_ready(uuid,text) returns boolean language sql as $$select true$$;
 create table sales_activities(id uuid primary key,lead_id uuid,user_id uuid,user_name text,activity_type text,activity_text text,metadata jsonb);
 insert into profiles values('${id(1)}','sales','active','Rep');
 insert into sales_leads values('${id(2)}','residential','${id(1)}',false,'new_leads',null);
 insert into crm_user_access values('${id(1)}',true,false);`);
 await db.exec(fs.readFileSync('supabase/migrations/20261020195812_crm_browser_voice.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261020203454_crm_voice_session_type_fix.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261028162223_crm_call_contacted.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261028173526_crm_contacted_call_attempts.sql','utf8'));
 const prepared=async()=>{const r=await db.query('select crm_prepare_voice_call($1,$2,$3,$4) id',[id(1),id(2),id(3),'+19195550100']);return r.rows[0].id;};
 const consume=async(intent,who=`client:sales_${id(1)}`)=> (await db.query('select crm_consume_voice_call($1,$2,$3) result',[intent,who,'CA'+'1'.repeat(32)])).rows[0].result;
 const intent=await prepared();assert.equal(await consume(intent,'client:other'),null);
 await db.exec('update sales_leads set do_not_contact=true');assert.equal(await consume(intent),null);
 await db.exec('update sales_leads set do_not_contact=false;update crm_user_access set enabled=false');assert.equal(await consume(intent),null);
 await db.exec(`update crm_user_access set enabled=true;update sales_leads set sales_owner_id='${id(9)}'`);assert.equal(await consume(intent),null);
 await db.exec(`update sales_leads set sales_owner_id='${id(1)}'`);assert.equal((await consume(intent)).phone,'+19195550100');assert.equal(await consume(intent),null);
 await assert.rejects(prepared(),/Finish the current call/);
 const stage=async()=>(await db.query('select pipeline_stage from sales_leads')).rows[0].pipeline_stage;
 const callback=async(status,seq,seconds=0)=>db.query('select crm_voice_status($1,$2,$3,$4,$5)',['CA'+'1'.repeat(32),'CA'+'2'.repeat(32),status,seq,seconds]);
 await callback('initiated',0);assert.equal(await stage(),'new_leads');
 await callback('ringing',1);assert.equal(await stage(),'contacted');
 await callback('in-progress',1);assert.equal(await stage(),'contacted');
 await db.exec("update sales_leads set pipeline_stage='follow_up'");
 await callback('in-progress',1);assert.equal(await stage(),'follow_up');
 for(const [status,seq,seconds] of [['completed',3,82],['ringing',1,0],['completed',3,82]])await db.query('select crm_voice_status($1,$2,$3,$4,$5)',['CA'+'1'.repeat(32),'CA'+'2'.repeat(32),status,seq,seconds]);
 assert.equal((await db.query('select status from crm_voice_calls')).rows[0].status,'completed');
 assert.equal((await db.query('select * from sales_activities')).rows.length,1);
 assert.equal((await db.query('select duration_seconds from crm_voice_calls')).rows[0].duration_seconds,82);
 assert.equal(await stage(),'follow_up');
 for(const outcome of ['active','lost','interested','link_sent']){
  await db.query('update sales_leads set pipeline_stage=$1',[outcome]);
  await db.exec('update crm_voice_calls set sequence=-1');await callback('completed',3,10);assert.equal(await stage(),outcome);
 }
 for(const outcome of ['failed','canceled']){
  await db.exec("update sales_leads set pipeline_stage='new_leads';update crm_voice_calls set sequence=-1");
  await callback(outcome,3,0);assert.equal(await stage(),'new_leads');
 }
 for(const outcome of ['ringing','in-progress','completed','busy','no-answer']){
  await db.exec("update sales_leads set pipeline_stage='new_leads';update crm_voice_calls set sequence=-1");
  await callback(outcome,3,0);assert.equal(await stage(),'contacted');
 }
 await db.exec("update sales_leads set pipeline_stage='new_leads',do_not_contact=true;update crm_voice_calls set sequence=-1");
 await callback('completed',3,10);assert.equal(await stage(),'new_leads');
 await db.exec('update sales_leads set do_not_contact=false;update crm_voice_calls set sequence=-1');
 await callback('completed',3,10);assert.equal(await stage(),'contacted');
 await db.exec('set role authenticated');await assert.rejects(db.query('select * from crm_voice_calls'),/permission denied/);
 await assert.rejects(db.query('select crm_consume_voice_call($1,$2,$3)',[intent,'anything','CAanything']),/permission denied/);
 }finally{await db.close();}
});
test('human detection uses signed outbound callbacks and the assigned one-use call intent',async()=>{
 const C=require('../lib/crm-sales.cjs'),T=require('../lib/crm-training.cjs');const previous={lead:C.leadFor,training:T.requireComplete};const env={...process.env};
 Object.assign(process.env,{TWILIO_VOICE_ENABLED:'true',TWILIO_ACCOUNT_SID:'ACtest',TWILIO_AUTH_TOKEN:'secret',TWILIO_API_KEY_SID:'SKtest',TWILIO_API_KEY_SECRET:'secret',TWILIO_TWIML_APP_SID:'APtest',TWILIO_VOICE_NUMBER:'+19195550100'});
 C.leadFor=async()=>({contact_phone:'+19195550101'});T.requireComplete=async()=>{};let writes=[];
 const db={rpc:async()=>({data:{user_id:id(1),lead_id:id(2),phone:'+19195550101'}}),from:table=>({update(v){writes.push(v);return this;},eq(){return this;},select(){if(table==='communication_usage')return this;return Promise.resolve({data:[{id:id(3)}]});},async single(){return {data:{max_seconds:60}};},then(resolve){resolve({data:[]});}})};
 try{const xml=await V.connect(db,{Intent:id(3),CallSid:'CA'+'a'.repeat(32),From:'client:sales_'+id(1)});assert.match(xml,/machineDetection="Enable"/);assert.match(xml,/amdStatusCallback=.*intent=/);assert.equal(writes[0].amd_requested,true);
 const p={AccountSid:'ACtest',CallSid:'CA'+'b'.repeat(32),AnsweredBy:'human'},url=V.hook('amd')+'&intent='+id(3),sig=twilio.getExpectedTwilioSignature('secret',url,p);
 assert.equal(V.verify({query:{intent:id(3)},headers:{'x-twilio-signature':sig}},p,'amd'),true);assert.equal(V.verify({query:{intent:id(4)},headers:{'x-twilio-signature':sig}},p,'amd'),false);
 await V.amd(db,p,id(3));assert.equal(writes[1].answered_by,'human');await assert.rejects(V.amd(db,{...p,AnsweredBy:'fake'},id(3)));
 }finally{C.leadFor=previous.lead;T.requireComplete=previous.training;for(const k of Object.keys(process.env))if(!(k in env))delete process.env[k];Object.assign(process.env,env);}
});
