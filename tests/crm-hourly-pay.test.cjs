const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const U='00000000-0000-4000-8000-000000000001',A='00000000-0000-4000-8000-000000000002';
const start='2025-01-01T00:00:00Z',end='2025-01-02T00:00:00Z';
test('hourly review calculates union at historical rates, requires admin approval, snapshots periods and prevents duplicate pay',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create table profiles(id uuid primary key,full_name text,role text,status text);
 insert into profiles values('${U}','Rep','sales','active'),('${A}','Admin','admin','active');
 create table crm_work_intervals(user_id uuid,started_at timestamptz,ended_at timestamptz);
 create table crm_pay_plans(id uuid default gen_random_uuid(),user_id uuid,mode text,hourly_cents integer,effective_at timestamptz);
 create table crm_voice_calls(user_id uuid,answered_at timestamptz,dialed_at timestamptz,ended_at timestamptz,created_at timestamptz,duration_seconds integer,status text);
 create table crm_access_audit(actor_id uuid,subject_id uuid,action text);
 insert into crm_pay_plans(user_id,mode,hourly_cents,effective_at) values('${U}','hourly',2000,'${start}'),('${U}','hourly',4000,'2025-01-01T00:30:00Z');
 insert into crm_work_intervals values('${U}','${start}','2025-01-01T01:00:00Z'),('${U}','${start}','2025-01-01T01:00:00Z');
 insert into crm_voice_calls values('${U}','2025-01-01T00:20:00Z','${start}','2025-01-01T00:40:00Z','${start}',1200,'completed');`);
 await db.exec(fs.readFileSync('supabase/migrations/20261030122834_sales_hourly_payment_review.sql','utf8').replace(/^\uFEFF/,''));
 const quote=async()=>(await db.query('select * from crm_hourly_quote($1,$2,$3)',[U,start,end])).rows[0];
 const q=await quote();assert.equal(Number(q.hours_seconds),3600);assert.equal(Number(q.amount_cents),3000);
 const review=(actor,action,expected=3000,id=null,ref='',from=start,to=end)=>db.query('select crm_hourly_payment_review($1,$2,$3,$4,$5,$6,$7,$8) id',[actor,U,action,from,to,expected,id,ref]);
 await assert.rejects(review(U,'approve'),/Administrator/);
 await assert.rejects(review(A,'record_paid',3000,A,'ACH-1'),/not found/);
 await assert.rejects(review(A,'approve',6000),/changed/);
 await assert.rejects(review(A,'approve',3000,null,'',start,new Date(Date.now()+60000).toISOString()),/completed period/);
 const id=(await review(A,'approve')).rows[0].id;
 assert.equal((await review(A,'approve')).rows[0].id,id,'retry approval is idempotent');
 await assert.rejects(review(A,'approve',3000,null,'',start,'2025-01-03T00:00:00Z'),/period changed/);
 let totals=(await db.query('select crm_hourly_summary($1,$2) r',[U,end])).rows[0].r[0];
 assert.equal(Number(totals.pending_cents),0);assert.equal(Number(totals.approved_cents),3000);assert.equal(Number(totals.paid_cents),0);
 await assert.rejects(review(A,'record_paid',3000,id,''),/reference/);
 await assert.rejects(review(A,'record_paid',4000,id,'ACH-1'),/changed/);
 await review(A,'record_paid',3000,id,'ACH-1');await review(A,'record_paid',3000,id,'ACH-1');
 await assert.rejects(review(A,'record_paid',3000,id,'ACH-2'),/already/);
 totals=(await db.query('select crm_hourly_summary($1,$2) r',[U,end])).rows[0].r[0];assert.equal(Number(totals.approved_cents),0);assert.equal(Number(totals.paid_cents),3000);
 assert.equal((await db.query('select count(*)::int n from crm_hourly_payments')).rows[0].n,1);
 assert.equal((await db.query('select count(*)::int n from crm_access_audit')).rows[0].n,2);
 await db.exec(`insert into crm_work_intervals values('${U}','2025-01-02T00:00:00Z','2025-01-02T01:00:00Z');`);
 totals=(await db.query('select crm_hourly_summary($1,$2) r',[U,'2025-01-03'])).rows[0].r[0];assert.equal(Number(totals.pending_cents),4000);assert.equal(Number(totals.review_cents),4000);
 await db.exec('set role authenticated');await assert.rejects(db.query('select * from crm_hourly_payments'),/permission denied/);await assert.rejects(db.query('select crm_hourly_summary(null,now())'),/permission denied/);await db.exec('reset role');
 }finally{await db.close();}
});
test('hourly API scopes read requests to the signed-in rep and rejects all rep mutations',async()=>{
 const S=require('../lib/residential-server.cjs'),C=require('../lib/crm-sales.cjs'),handler=require('../api/crm-hourly-pay.js');
 const A=require('../lib/seller-agreement.cjs'),oldCurrent=A.current;A.current=async()=>({mode:'hourly'});
 const old={database:S.database,body:S.body,access:C.access,all:C.all};let action='list',calls=0;
 S.body=async()=>({action,user_id:A,through:end,amount_cents:1000});C.access=async()=>({id:U,admin:false});
 S.database=()=>({rpc:async(name,args)=>{calls++;assert.equal(name,'crm_hourly_summary');assert.equal(args.p_user,U);return {data:[]};}});
 C.all=async(db,table,columns,filter)=>{const q={eq(k,v){assert.equal(k,'user_id');assert.equal(v,U);return q;}};filter(q);return [];};
 const invoke=async()=>{const res={setHeader(){},status(n){this.statusCode=n;return this;},json(){},end(){}};await handler({method:'POST'},res);return res.statusCode;};
 try{assert.equal(await invoke(),200);action='approve';assert.equal(await invoke(),403);action='record_paid';assert.equal(await invoke(),403);assert.equal(calls,1);}finally{S.database=old.database;S.body=old.body;C.access=old.access;C.all=old.all;A.current=oldCurrent;}
});
