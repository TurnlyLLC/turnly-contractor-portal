const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const user='00000000-0000-4000-8000-000000000001',session='00000000-0000-4000-8000-000000000002';
test('replacement walkthrough completes at its actual duration, rejects skipping, and preserves completed lessons',async()=>{
 const db=new PGlite();try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create table profiles(id uuid primary key,role text,status text);insert into profiles values('${user}','sales','active');create table crm_sales_commissions(order_id uuid primary key,sales_user_id uuid,amount_cents integer,status text);`);
  for(const file of ['20261021123800_crm_required_sales_training.sql','20261027191425_sales_seller_onboarding.sql','20261028122146_sales_staged_playbook.sql','20261028153617_sales_explainer_training.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
  const record=(position,start=false)=>db.query('select crm_seller_training_record_v4($1,\'portal\',$2,$3,$4) p',[user,session,position,start]);
  await assert.rejects(record(0,true),/agreement/);
  await db.exec(`insert into crm_seller_agreements values('${user}','20261027-v1','hash','snapshot','Test Seller','I agree',now());`);
  const duration=require('../lib/crm-training.cjs').LESSONS.find(l=>l.id==='portal').seconds;
  await record(0,true);let result=await record(duration);assert.equal(result.rows[0].p.completed_at,null);
  await db.exec(`update crm_training_progress set watched_seconds=${duration-2},last_position=${duration-2},last_tick=clock_timestamp()-interval '3 seconds' where user_id='${user}';`);
  result=await record(duration);assert.ok(result.rows[0].p.completed_at);
  const completed=result.rows[0].p.completed_at;result=await record(0,true);assert.equal(result.rows[0].p.completed_at,completed);
  await db.exec('set role authenticated');await assert.rejects(record(0,true),/permission denied/);
 }finally{await db.close();}
});
