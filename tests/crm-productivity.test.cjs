const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const P=require('../lib/crm-productivity.cjs');
const U='00000000-0000-4000-8000-000000000001',A='00000000-0000-4000-8000-000000000002',SID='00000000-0000-4000-8000-000000000010',SID2='00000000-0000-4000-8000-000000000011';
test('activity SQL expires sessions, excludes offline gaps, prevents duplicate time, and preserves rates',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
 create table auth.sessions(id uuid primary key,user_id uuid,created_at timestamptz default now());
 create function auth.uid() returns uuid language sql stable as $$select '${U}'::uuid$$;
 create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('session_id','${SID}')$$;
 create table public.profiles(id uuid primary key,full_name text,role text,status text);
 create table public.crm_user_access(user_id uuid,enabled boolean,must_change_password boolean,valid_after timestamptz,username text);
 create table public.crm_access_audit(actor_id uuid,subject_id uuid,action text);
 create table public.sales_leads(id uuid,business_segment text,do_not_contact boolean,sales_owner_id uuid);
 create table public.crm_voice_calls(id uuid primary key default gen_random_uuid(),user_id uuid,lead_id uuid,phone text,session_id uuid,status text,created_at timestamptz default now(),parent_sid text,call_sid text,duration_seconds integer default 0);
 insert into profiles values('${U}','Rep','sales_team','active'),('${A}','Admin','admin','active');
 insert into auth.sessions(id,user_id)values('${SID}','${U}'),('${SID2}','${U}');`);
 await db.exec(fs.readFileSync('supabase/migrations/20261030115430_sales_productivity_pay.sql','utf8').replace(/^\uFEFF/,''));
 const track=async(id=SID,action='heartbeat',active=false,work=true)=>(await db.query('select crm_track_activity($1,$2,$3,$4,$5) r',[U,id,action,active,work])).rows[0].r;
 await track(SID,'start',true,true);
 await db.exec(`update crm_pay_plans set mode='hourly',hourly_cents=2000,effective_at=now()-interval '1 hour' where user_id='${U}';update crm_activity_sessions set last_seen_at=clock_timestamp()-interval '20 seconds',last_work_at=clock_timestamp()-interval '20 seconds' where session_id='${SID}';`);
 await track();let secs=Number((await db.query('select sum(extract(epoch from ended_at-started_at)) n from crm_work_intervals')).rows[0].n);assert.ok(secs>=20&&secs<22);
 await track(SID2,'start',true,true);await db.exec(`update crm_activity_sessions set last_seen_at=clock_timestamp()-interval '20 seconds',last_work_at=clock_timestamp()-interval '20 seconds' where session_id='${SID2}';`);await track(SID2);
 let secs2=Number((await db.query('select sum(extract(epoch from ended_at-started_at)) n from crm_work_intervals')).rows[0].n);assert.ok(secs2<secs+2,'parallel tabs must not duplicate 20 seconds');
 await db.exec(`update crm_activity_sessions set last_seen_at=now()-interval '2 minutes',last_work_at=now()-interval '2 minutes' where session_id='${SID}';`);await track();
 assert.equal(Number((await db.query('select sum(extract(epoch from ended_at-started_at)) n from crm_work_intervals')).rows[0].n),secs2,'offline gap is not paid');
 await assert.rejects(db.query('select crm_set_pay_plan($1,$1,$2,$3,$4)',[U,'hourly',1000,3000]),/Administrator/);
 await db.query('select crm_set_pay_plan($1,$2,$3,$4,$5)',[A,U,'hourly',1000,3000]);
 assert.equal((await db.query('select count(*)::int n from crm_pay_plans where user_id=$1',[U])).rows[0].n,2);
 assert.equal((await db.query('select distinct p.hourly_cents from crm_work_intervals w join crm_pay_plans p on p.id=w.plan_id')).rows[0].hourly_cents,2000);
 await db.exec(`update crm_activity_sessions set last_activity_at=now()-interval '6 minutes' where session_id='${SID}';`);
 assert.equal((await track(SID,'heartbeat',true)).expired,true,'new activity cannot revive expired login');assert.equal((await track(SID,'start',true)).expired,true);
 assert.equal((await db.query('select crm_access_state() s')).rows[0].s.session_valid,false);
 await db.exec(`update crm_activity_sessions set last_activity_at=now()-interval '6 minutes' where session_id='${SID2}';insert into crm_voice_calls(id,user_id,session_id,status,parent_sid)values('${A}','${U}','${SID2}','in-progress','CA1');`);
 assert.equal((await track(SID2)).expired,false,'real in-progress call keeps session alive');
 await db.exec(`update crm_voice_calls set status='completed',duration_seconds=360 where id='${A}';`);
 const ended=(await db.query(`select extract(epoch from ended_at-answered_at)::int seconds from crm_voice_calls where id='${A}'`)).rows[0];assert.equal(ended.seconds,360);
 assert.equal((await db.query('select crm_activity_allowed($1,$2) ok',[U,SID2])).rows[0].ok,true);
 await db.exec('set role authenticated');await assert.rejects(db.query('select * from crm_work_intervals'),/permission denied/);await assert.rejects(db.query(`select crm_set_pay_plan('${A}','${U}','hourly',1000,9000)`),/permission denied/);await db.exec('reset role');
 }finally{await db.close();}
});
test('metrics exclude prepared calls, union concurrent work and calls, and split hourly rates without retroactive changes',()=>{
 const t=Date.parse('2026-10-30T12:00:00Z'),iso=n=>new Date(t+n*1000).toISOString();
 const plans=[{user_id:U,mode:'hourly',hourly_cents:2000,effective_at:iso(0)},{user_id:U,mode:'hourly',hourly_cents:4000,effective_at:iso(1800)}];
 const session=[{user_id:U,session_id:SID,started_at:iso(0),last_activity_at:iso(3600),last_seen_at:iso(3600),ended_at:iso(3600)}];
 const work=[{user_id:U,started_at:iso(0),ended_at:iso(3600)},{user_id:U,started_at:iso(0),ended_at:iso(3600)}];
 const calls=[{user_id:U,status:'prepared',created_at:iso(1)},...[[60,120],[180,240]].map(([a,b])=>({user_id:U,session_id:SID,created_at:iso(a),dialed_at:iso(a),answered_at:iso(a),ended_at:iso(b),duration_seconds:b-a,status:'completed',call_sid:'CA'}))];
 const r=P.summarize({id:U},plans,session,work,calls,t,t+7200000,t+3600000);
 assert.equal(r.logged_seconds,3600);assert.equal(r.active_seconds,3600);assert.equal(r.hourly_cents,3000);assert.equal(r.calls,2);assert.equal(r.average_call_seconds,60);assert.equal(r.average_gap_seconds,60);
 const commission=P.summarize({id:U},[{user_id:U,mode:'commission',commission_bps:1000,effective_at:iso(0)}],session,work,calls,t,t+7200000,t+3600000);assert.equal(commission.hourly_cents,0);
});
test('pay validation bounds percentage, hourly rate and target; token uses verified session only',()=>{
 assert.throws(()=>P.validatePlan({user_id:U,mode:'hourly',hourly_rate:0,commission_percent:10}));assert.throws(()=>P.validatePlan({user_id:U,mode:'commission',hourly_rate:0,commission_percent:101}));
 assert.equal(P.validatePlan({user_id:U,mode:'commission',hourly_rate:0,commission_percent:12.5}).p_bps,1250);
 assert.throws(()=>P.sessionId('invalid'));
});
