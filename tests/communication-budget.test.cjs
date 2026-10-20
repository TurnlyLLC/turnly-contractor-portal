const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const B=require('../lib/communication-budget.cjs'),V=require('../lib/crm-voice.cjs');
const rep='00000000-0000-4000-8000-000000000001',admin='00000000-0000-4000-8000-000000000002',lead='00000000-0000-4000-8000-000000000003',session='00000000-0000-4000-8000-000000000004';
async function setup(){const db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create table profiles(id uuid primary key,role text,status text,full_name text);insert into profiles values('${rep}','sales','active','Rep'),('${admin}','admin','active','Admin');
 create table sales_leads(id uuid primary key,business_segment text,sales_owner_id uuid,do_not_contact boolean);insert into sales_leads values('${lead}','residential','${rep}',false);
 create table crm_user_access(user_id uuid,enabled boolean,must_change_password boolean);insert into crm_user_access values('${rep}',true,false);
 create function crm_server_session_ready(uuid,text) returns boolean language sql as $$select true$$;
 create table sales_activities(id uuid primary key,lead_id uuid,user_id uuid,user_name text,activity_type text,activity_text text,metadata jsonb);
 create table crm_notifications(dedupe_key text unique,recipient_id uuid,kind text,title text);
 `);for(const p of ['20261020195812_crm_browser_voice.sql','20261020203454_crm_voice_session_type_fix.sql','20261020205144_communications_budget.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+p,'utf8'));return db;}
const reserve=(db,id,channel='sms',units=1,user=rep)=>db.query('select communication_reserve($1,$2,$3,$4,$5) result',[id,user,channel,'Test',units]);
test('SMS segment budgeting covers GSM extension characters and Unicode; costly non-US destinations are rejected',()=>{
 assert.equal(B.segments('a'.repeat(160)),1);assert.equal(B.segments('a'.repeat(161)),2);assert.equal(B.segments('^'.repeat(81)),2);
 assert.equal(B.segments('🙂'.repeat(36)),2);assert.equal(B.segments('漢'.repeat(71)),2);
 assert.throws(()=>V.destination({contact_phone:'+18765550100'}));assert.throws(()=>V.destination({contact_phone:'+14165550100'}));
});
test('combined budget protects reservations, rejects duplicates, releases unused money, and alerts once per threshold',async()=>{const db=await setup();try{
 await db.exec('update communication_settings set daily_cents=125');
 assert.equal((await reserve(db,'call-1','call')).rows[0].result.reserved_cents,110);
 await reserve(db,'sms-1','sms',3);await assert.rejects(reserve(db,'sms-2'),/budget reached/);
 await assert.rejects(reserve(db,'sms-1'),/already been submitted/);
 assert.equal((await db.query('select count(*) n from crm_notifications')).rows[0].n,3);
 await db.query("select communication_settle('call-1',2,'completed')");
 await reserve(db,'sms-2');
 assert.equal(Number((await db.query('select communication_totals() t')).rows[0].t.daily_cents),30);
 await db.query("select communication_settle('call-1',100,'completed')");
 assert.equal(Number((await db.query('select communication_totals() t')).rows[0].t.daily_cents),30);
 await db.exec('set role authenticated');await assert.rejects(reserve(db,'bypass'),/permission denied/);await assert.rejects(db.query('select * from communication_settings'),/permission denied/);
 }finally{await db.close();}});
test('monthly budget, per-rep controls, admin settings and provider safety floor are enforced',async()=>{const db=await setup();try{
 await db.exec('update communication_settings set monthly_cents=10');await reserve(db,'a');await reserve(db,'b');await assert.rejects(reserve(db,'c'),/budget reached/);
 await db.exec("update communication_settings set monthly_cents=10000;insert into communication_rep_limits values('"+rep+"',10,10000,false)");await assert.rejects(reserve(db,'d'),/allowance/);
 await db.exec('update communication_rep_limits set daily_cents=1000,paused=true');await assert.rejects(reserve(db,'d'),/paused/);
 await db.exec('update communication_rep_limits set paused=false;update communication_settings set texts_paused=true');await assert.rejects(reserve(db,'e'),/paused/);
 const settings=(await db.query('select to_jsonb(s) s from communication_settings s')).rows[0].s;
 await assert.rejects(db.query('select communication_save_settings($1,$2)',[rep,settings]),/Administrator/);
 await db.query('select communication_save_settings($1,$2)',[admin,{...settings,texts_paused:false,daily_cents:2000}]);assert.equal((await db.query('select count(*) n from communication_audit')).rows[0].n,1);
 await db.exec("update communication_provider_usage set day=(now() at time zone 'UTC')::date,daily_cents=2000");await assert.rejects(reserve(db,'floor'),/budget reached/);
 }finally{await db.close();}});
test('a burst of calls and texts cannot reserve the same remaining allowance',async()=>{const db=await setup();try{
 await db.exec('update communication_settings set daily_cents=125');
 await reserve(db,'parallel-call','call');
 const attempts=await Promise.allSettled(Array.from({length:20},(_,i)=>reserve(db,'parallel-sms-'+i)));
 assert.equal(attempts.filter(r=>r.status==='fulfilled').length,3);
 assert.equal(Number((await db.query('select communication_totals() t')).rows[0].t.daily_cents),125);
 }finally{await db.close();}});
test('call consumption requires a reservation, paused members cannot dial, and expired reservations cannot race late calls',async()=>{const db=await setup();try{
 const call=(await db.query('select crm_prepare_voice_call($1,$2,$3,$4) id',[rep,lead,session,'+19195550100'])).rows[0].id;
 const consume=()=>db.query('select crm_consume_voice_call($1,$2,$3) r',[call,'client:sales_'+rep,'CA'+'1'.repeat(32)]);
 assert.equal((await consume()).rows[0].r,null);await reserve(db,call,'call');
 await db.exec("insert into communication_rep_limits values('"+rep+"',1000,10000,true)");assert.equal((await consume()).rows[0].r,null);
 await db.exec('update communication_rep_limits set paused=false');assert.equal((await consume()).rows[0].r.phone,'+19195550100');
 await db.query('select communication_expire_call($1)',[call]);assert.equal((await db.query('select state from communication_usage where id=$1',[call])).rows[0].state,'reserved');
 await db.exec("update crm_voice_calls set parent_sid=null,status='prepared',created_at=now()-interval '4 minutes'");await db.query('select communication_expire_call($1)',[call]);assert.equal((await consume()).rows[0].r,null);
 }finally{await db.close();}});
