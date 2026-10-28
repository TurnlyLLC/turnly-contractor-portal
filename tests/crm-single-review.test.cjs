const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const user='00000000-0000-4000-8000-000000000001';
test('one final review completes onboarding without section acknowledgements, but requires signature and both videos',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create table profiles(id uuid primary key,role text,status text);insert into profiles values('${user}','sales','active');create table crm_sales_commissions(order_id uuid primary key,sales_user_id uuid,amount_cents integer,status text);`);
 for(const file of ['20261021123800_crm_required_sales_training.sql','20261027191425_sales_seller_onboarding.sql','20261028122146_sales_staged_playbook.sql','20261028160958_sales_single_playbook_confirmation.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
 const ack=()=>db.query('select crm_seller_training_acknowledge_v4($1)',[user]);
 await assert.rejects(ack(),/agreement/);
 await db.exec(`insert into crm_seller_agreements values('${user}','20261027-v1','hash','snapshot','Test Seller','I agree',now());`);
 await assert.rejects(ack(),/video/);
 await db.exec(`insert into crm_training_progress(user_id,version,lesson,completed_at) values('${user}','20261027-v2','introduction',now());`);
 await assert.rejects(ack(),/video/);
 await db.exec(`insert into crm_training_progress(user_id,version,lesson,completed_at) values('${user}','20261027-v2','portal',now());`);
 await ack();await ack();
 assert.equal((await db.query('select crm_seller_training_ready_v3($1) ready',[user])).rows[0].ready,true);
 assert.equal((await db.query('select count(*)::int n from crm_playbook_sections')).rows[0].n,0);
 assert.equal((await db.query('select count(*)::int n from crm_training_reviews')).rows[0].n,1);
 await db.exec('set role authenticated');await assert.rejects(ack(),/permission denied/);
 }finally{await db.close();}
});
