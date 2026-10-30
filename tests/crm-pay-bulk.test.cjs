const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');const {PGlite}=require('@electric-sql/pglite');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('mixed bulk review is atomic, amount-checked, admin-only and safely retryable',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create table profiles(id uuid primary key,full_name text,role text,status text);
 insert into profiles values('${id(1)}','Rep one','sales','active'),('${id(2)}','Rep two','sales','active'),('${id(3)}','Admin','admin','active');
 create table crm_work_intervals(user_id uuid,started_at timestamptz,ended_at timestamptz);
 create table crm_pay_plans(id uuid default gen_random_uuid(),user_id uuid,mode text,hourly_cents integer,effective_at timestamptz);
 create table crm_voice_calls(user_id uuid,answered_at timestamptz,dialed_at timestamptz,ended_at timestamptz,created_at timestamptz,duration_seconds integer,status text);
 create table crm_access_audit(actor_id uuid,subject_id uuid,action text);
 create table crm_sales_commissions(order_id uuid primary key,sales_user_id uuid,amount_cents integer,status text);
 insert into crm_sales_commissions values('${id(11)}','${id(1)}',1000,'earned'),('${id(12)}','${id(2)}',2000,'earned');
 insert into crm_pay_plans(user_id,mode,hourly_cents,effective_at) values('${id(1)}','hourly',2000,'2025-01-01'),('${id(2)}','hourly',3000,'2025-01-01');
 insert into crm_work_intervals values('${id(1)}','2025-01-01','2025-01-01T01:00:00Z'),('${id(2)}','2025-01-01','2025-01-01T01:00:00Z');`);
 const seller=fs.readFileSync('supabase/migrations/20261027191425_sales_seller_onboarding.sql','utf8');await db.exec(seller.slice(seller.indexOf('create table public.crm_commission_payments'),seller.indexOf('create or replace function public.crm_seller_training_ready')));
 for(const path of ['20261030122834_sales_hourly_payment_review.sql','20261030143414_sales_bulk_pay_review.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+path,'utf8').replace(/^\uFEFF/,''));
 const items=[{kind:'hourly',user_id:id(1),period_start:'2025-01-01T00:00:00Z',period_end:'2025-01-02T00:00:00Z',amount_cents:2000},{kind:'hourly',user_id:id(2),period_start:'2025-01-01T00:00:00Z',period_end:'2025-01-02T00:00:00Z',amount_cents:3000},{kind:'commission',user_id:id(1),order_id:id(11),amount_cents:1000},{kind:'commission',user_id:id(2),order_id:id(12),amount_cents:2000}];
 const run=(action,request,rows=items,ref='',actor=id(3))=>db.query('select crm_bulk_pay_review($1,$2,$3,$4::jsonb,$5) r',[actor,id(request),action,JSON.stringify(rows),ref]);
 await assert.rejects(run('approve',20,items,'',id(1)),/Administrator/);
 await assert.rejects(run('approve',20,[items[0],items[0]]),/Duplicate/);
 const bad=structuredClone(items);bad[1].amount_cents=3001;
 await assert.rejects(run('approve',20,bad),/changed/);
 assert.equal((await db.query('select count(*)::int n from crm_commission_payments')).rows[0].n,0,'commission approvals roll back when later hourly item fails');assert.equal((await db.query('select count(*)::int n from crm_hourly_payments')).rows[0].n,0);
 const result=(await run('approve',20)).rows[0].r;assert.equal(result.amount_cents,8000);assert.equal(result.item_count,4);assert.equal(result.representatives,2);
 assert.deepEqual((await run('approve',20)).rows[0].r,result);
 await assert.rejects(run('approve',20,items,'different'),/different review/);
 const periods=(await db.query('select * from crm_hourly_payments')).rows;
 const paidItems=items.map(i=>i.kind==='hourly'?{...i,id:periods.find(p=>p.user_id===i.user_id).id}:i);
 await assert.rejects(run('record_paid',21,paidItems),/reference/);
 await db.exec(`update crm_sales_commissions set amount_cents=1500 where order_id='${id(12)}'`);
 await assert.rejects(run('record_paid',21,paidItems,'BANK-BATCH-21'),/changed/);
 assert.equal((await db.query('select count(*)::int n from crm_commission_payments where paid_at is not null')).rows[0].n,0,'prior commission payment rolls back');
 await db.exec(`update crm_sales_commissions set amount_cents=2000 where order_id='${id(12)}'`);
 await run('record_paid',21,paidItems,'BANK-BATCH-21');await run('record_paid',21,paidItems,'BANK-BATCH-21');
 assert.equal((await db.query('select count(*)::int n from crm_pay_batches')).rows[0].n,2);
 assert.equal((await db.query('select sum(amount_cents)::int n from crm_hourly_payments where paid_at is not null')).rows[0].n,5000);
 assert.equal((await db.query('select sum(paid_cents)::int n from crm_commission_payments')).rows[0].n,3000);
 await assert.rejects(run('record_paid',22,paidItems,'BANK-BATCH-22'),/already/);
 await db.exec('set role authenticated');await assert.rejects(run('approve',23),/permission denied/);await assert.rejects(db.query('select * from crm_pay_batches'),/permission denied/);
 }finally{await db.close();}
});
test('bulk API refuses sales reps and uses authenticated admin identity',async()=>{
 const S=require('../lib/residential-server.cjs'),C=require('../lib/crm-sales.cjs'),handler=require('../api/crm-pay-bulk.js');const old={database:S.database,body:S.body,access:C.access};let admin=false,calls=0;
 S.body=async()=>({action:'approve',request_id:id(20),admin_id:id(1),items:[{kind:'commission',user_id:id(1),order_id:id(11),amount_cents:1000}]});C.access=async()=>({id:id(3),admin});
 S.database=()=>({rpc:async(name,args)=>{calls++;assert.equal(name,'crm_bulk_pay_review');assert.equal(args.p_admin,id(3));return {data:{item_count:1}};}});
 const run=async()=>{const r={setHeader(){},status(n){this.statusCode=n;return this;},json(){},end(){}};await handler({method:'POST'},r);return r.statusCode;};
 try{assert.equal(await run(),403);assert.equal(calls,0);admin=true;assert.equal(await run(),200);assert.equal(calls,1);}finally{S.database=old.database;S.body=old.body;C.access=old.access;}
});
test('bulk selection respects representatives, type filters and eligibility',async()=>{
 const {payReviewRows,payReviewItems}=await import('../crm-pay-bulk.mjs');
 const h={through:'2025-01-02',rows:[{user_id:'a',name:'A',review_cents:2000,period_start:'2025-01-01'}],periods:[{user_id:'a',id:'p1',amount_cents:1000,paid_at:null},{user_id:'a',id:'p2',amount_cents:9999,paid_at:'done'}]};
 const c={rows:[{sales_user_id:'b',representative:'B',order_id:'o1',amount_cents:500,status:'earned',approval_current:false},{sales_user_id:'b',order_id:'o2',amount_cents:700,status:'earned',approval_current:true},{sales_user_id:'b',order_id:'o3',amount_cents:1000,status:'reversed'},{sales_user_id:'b',order_id:'o4',amount_cents:1000,status:'earned',payment:{paid_at:'done'}}]};
 const rows=payReviewRows(h,c),both=new Set(['hourly','commission']);assert.equal(rows.length,2);
 assert.equal(payReviewItems(rows,new Set(['a','b']),'approve',both).reduce((n,i)=>n+i.amount_cents,0),2500);
 assert.equal(payReviewItems(rows,new Set(['a','b']),'record_paid',both).reduce((n,i)=>n+i.amount_cents,0),1700);
 assert.equal(payReviewItems(rows,new Set(['a']),'approve',new Set(['commission'])).length,0);
});
