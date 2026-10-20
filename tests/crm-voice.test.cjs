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
 create table sales_leads(id uuid primary key,business_segment text,sales_owner_id uuid,do_not_contact boolean);
 create table crm_user_access(user_id uuid,enabled boolean,must_change_password boolean);
 create function crm_server_session_ready(uuid,uuid) returns boolean language sql as $$select true$$;
 create table sales_activities(id uuid primary key,lead_id uuid,user_id uuid,user_name text,activity_type text,activity_text text,metadata jsonb);
 insert into profiles values('${id(1)}','sales','active','Rep');
 insert into sales_leads values('${id(2)}','residential','${id(1)}',false);
 insert into crm_user_access values('${id(1)}',true,false);`);
 await db.exec(fs.readFileSync('supabase/migrations/20261020195812_crm_browser_voice.sql','utf8'));
 const prepared=async()=>{const r=await db.query('select crm_prepare_voice_call($1,$2,$3,$4) id',[id(1),id(2),id(3),'+19195550100']);return r.rows[0].id;};
 const consume=async(intent,who=`client:sales_${id(1)}`)=> (await db.query('select crm_consume_voice_call($1,$2,$3) result',[intent,who,'CA'+'1'.repeat(32)])).rows[0].result;
 const intent=await prepared();assert.equal(await consume(intent,'client:other'),null);
 await db.exec('update sales_leads set do_not_contact=true');assert.equal(await consume(intent),null);
 await db.exec('update sales_leads set do_not_contact=false;update crm_user_access set enabled=false');assert.equal(await consume(intent),null);
 await db.exec(`update crm_user_access set enabled=true;update sales_leads set sales_owner_id='${id(9)}'`);assert.equal(await consume(intent),null);
 await db.exec(`update sales_leads set sales_owner_id='${id(1)}'`);assert.equal((await consume(intent)).phone,'+19195550100');assert.equal(await consume(intent),null);
 await assert.rejects(prepared(),/Finish the current call/);
 for(const [status,seq,seconds] of [['completed',3,82],['ringing',1,0],['completed',3,82]])await db.query('select crm_voice_status($1,$2,$3,$4,$5)',['CA'+'1'.repeat(32),'CA'+'2'.repeat(32),status,seq,seconds]);
 assert.equal((await db.query('select status from crm_voice_calls')).rows[0].status,'completed');
 assert.equal((await db.query('select * from sales_activities')).rows.length,1);
 assert.equal((await db.query('select duration_seconds from crm_voice_calls')).rows[0].duration_seconds,82);
 await db.exec('set role authenticated');await assert.rejects(db.query('select * from crm_voice_calls'),/permission denied/);
 await assert.rejects(db.query('select crm_consume_voice_call($1,$2,$3)',[intent,'anything','CAanything']),/permission denied/);
 }finally{await db.close();}
});
