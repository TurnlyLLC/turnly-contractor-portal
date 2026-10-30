const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');const {PGlite}=require('@electric-sql/pglite');
const U='00000000-0000-4000-8000-000000000001',A='00000000-0000-4000-8000-000000000002',SID='00000000-0000-4000-8000-000000000010';
test('pay terms migration qualifies logged hours by dials and human outbound average while retaining old earnings and signature gates',async()=>{const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.sessions(id uuid primary key,user_id uuid,created_at timestamptz default now());
 create function auth.uid() returns uuid language sql as $$select '${U}'::uuid$$;create function auth.jwt() returns jsonb language sql as $$select jsonb_build_object('session_id','${SID}')$$;
 create table profiles(id uuid primary key,full_name text,role text,status text);insert into profiles values('${U}','Rep','sales','active'),('${A}','Admin','admin','active');
 create table crm_user_access(user_id uuid,enabled boolean,must_change_password boolean,valid_after timestamptz,username text);create table crm_access_audit(actor_id uuid,subject_id uuid,action text);
 create table sales_leads(id uuid,business_segment text,do_not_contact boolean,sales_owner_id uuid);
 create table crm_voice_calls(id uuid primary key default gen_random_uuid(),user_id uuid,lead_id uuid,phone text,session_id uuid,status text,created_at timestamptz default now(),parent_sid text,call_sid text,duration_seconds integer default 0);
 create table crm_seller_agreements(user_id uuid,version text,agreement_hash text,agreement_text text,signer_name text,consent_text text,signed_at timestamptz default now(),primary key(user_id,version));
 create function crm_seller_training_ready_v3(p_user uuid) returns boolean language sql as $$select exists(select 1 from crm_seller_agreements where user_id=p_user and version='20261027-v1')$$;
 create function communication_reserve(text,uuid,text,text,integer) returns jsonb language sql as $$select '{}'::jsonb$$;
 create function communication_settle(text,integer,text,boolean) returns void language plpgsql as $$begin return;end$$;`);
 for(const f of ['20261030115430_sales_productivity_pay.sql','20261030122834_sales_hourly_payment_review.sql','20261030144909_sales_pay_type_agreements.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+f,'utf8').replace(/^\uFEFF/,''));
 await db.exec(`delete from crm_pay_plans;insert into crm_pay_plans(user_id,mode,hourly_cents,effective_at,hourly_policy)values('${U}','hourly',2000,'2025-01-01','active'),('${U}','hourly',2000,'2025-01-02','qualified_logged');
 insert into crm_activity_sessions(session_id,user_id,started_at,ended_at)values('${SID}','${U}','2025-01-02T00:00:00Z','2025-01-02T00:30:00Z');
 insert into crm_work_intervals(user_id,session_id,started_at,ended_at)values('${U}','${SID}','2025-01-01T00:00:00Z','2025-01-01T01:00:00Z');
 insert into crm_voice_calls(user_id,session_id,status,created_at,dialed_at,call_sid,duration_seconds,answered_by)
 select '${U}','${SID}','completed','2025-01-02T00:00:00Z'::timestamptz+n*interval '1 minute','2025-01-02T00:00:00Z'::timestamptz+n*interval '1 minute','CA'||n,case when n=1 then 60 else 1000 end,case when n=1 then 'human' else 'machine_start' end from generate_series(1,15) n;`);
 let w=(await db.query('select * from crm_hourly_windows($1,$2,$3)',[U,'2025-01-02','2025-01-03'])).rows[0];assert.equal(Number(w.logged_seconds),1800);assert.equal(Number(w.target_dials),15);assert.equal(Number(w.average_seconds),60);assert.equal(Number(w.human_answers),1);assert.equal(w.qualifies,true);
 let q=(await db.query('select * from crm_hourly_quote($1,$2,$3)',[U,'2025-01-01','2025-01-03'])).rows[0];assert.equal(Number(q.amount_cents),3000,'old $20 plus qualified half-hour $10');
 await db.exec(`update crm_voice_calls set duration_seconds=20 where answered_by='human'`);q=(await db.query('select * from crm_hourly_quote($1,$2,$3)',[U,'2025-01-01','2025-01-03'])).rows[0];assert.equal(Number(q.amount_cents),2000,'short human call does not qualify; historical active earnings retained');
 await db.exec(`update crm_voice_calls set answered_by='unknown' where answered_by='human'`);w=(await db.query('select * from crm_hourly_windows($1,$2,$3)',[U,'2025-01-02','2025-01-03'])).rows[0];assert.equal(w.qualifies,false);assert.equal(Number(w.human_answers),0);
 await db.exec(`insert into crm_seller_agreements(user_id,version)values('${U}','20261027-v1')`);assert.equal((await db.query('select crm_seller_training_ready_v3($1) ok',[U])).rows[0].ok,false);
 const version=(await db.query('select crm_current_agreement_version($1) v',[U])).rows[0].v;await db.query('select crm_sign_pay_agreement($1,$2,$3,$4,$5)',[U,version,'hash','text','Rep']);assert.equal((await db.query('select crm_seller_training_ready_v3($1) ok',[U])).rows[0].ok,true);
 await db.query('select crm_set_pay_plan_v2($1,$2,$3,$4,$5,$6,$7,$8)',[A,U,'hourly',0,2500,25,20,'Paid after admin review.']);assert.equal((await db.query('select crm_seller_training_ready_v3($1) ok',[U])).rows[0].ok,false);await assert.rejects(db.query('select crm_sign_pay_agreement($1,$2,$3,$4,$5)',[U,version,'hash','text','Rep']),/terms changed/);
 await db.exec('set role authenticated');await assert.rejects(db.query('select crm_hourly_windows($1,$2,$3)',[U,'2025-01-01','2025-01-03']),/permission denied/);
 }finally{await db.close();}});
test('pay-specific contracts and metric labels do not mix compensation models',async()=>{
 const A=require('../lib/seller-agreement.cjs');const db=mode=>({from:()=>({select(){return this;},eq(){return this;},order(){return this;},limit(){return this;},async maybeSingle(){return {data:{id:U,mode,commission_bps:1250,hourly_cents:2500,dials_per_hour:25,min_answered_seconds:45,payment_terms:'Paid weekly after review.'}};}})});
 const c=await A.current(db('commission'),{id:U}),h=await A.current(db('hourly'),{id:U});assert.match(c.text,/COMMISSION-ONLY/);assert.match(c.text,/12.5%/);assert.doesNotMatch(c.text,/qualified logged-in hour/);assert.match(h.text,/HOURLY-ONLY/);assert.match(h.text,/25.00/);assert.match(h.text,/× 25/);assert.match(h.text,/45 seconds/);assert.doesNotMatch(h.text,/earns 10%|Commission eligibility/);
 const {metrics}=await import('../crm-productivity.mjs');const base={plan:{mode:'commission'},sessions:[]};assert.equal(metrics(base,false).some(([k])=>k.startsWith('Hourly')),false);assert.equal(metrics({...base,plan:{mode:'hourly'}},false).some(([k])=>k==='Hourly payable time'),true);
});
