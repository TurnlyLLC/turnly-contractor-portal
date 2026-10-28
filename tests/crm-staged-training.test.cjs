const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');const {PGlite}=require('@electric-sql/pglite');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('agreement precedes playbook, every video and section is required, and old review cannot unlock CRM',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create table profiles(id uuid primary key,role text,status text);insert into profiles values('${id(1)}','sales','active'),('${id(2)}','sales','active');create table crm_sales_commissions(order_id uuid primary key,sales_user_id uuid,amount_cents integer,status text);`);
 for(const file of ['20261021123800_crm_required_sales_training.sql','20261027191425_sales_seller_onboarding.sql','20261028122146_sales_staged_playbook.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
 const ready=async user=>(await db.query('select crm_seller_training_ready_v3($1) r',[user||id(1)])).rows[0].r;
 const section=(name,complete)=>db.query('select crm_playbook_section_review($1,$2,$3)',[id(1),name,complete]);
 const ack=()=>db.query('select crm_seller_training_acknowledge_v3($1)',[id(1)]);
 await assert.rejects(section('playbook-0',false),/agreement/);
 await assert.rejects(db.query("select crm_seller_training_record_v3($1,'portal',$2,0,true)",[id(1),id(3)]),/agreement/);
 await db.exec(`insert into crm_training_progress(user_id,version,lesson,completed_at) values('${id(1)}','20261027-v2','introduction',now());insert into crm_training_reviews(user_id,version) values('${id(1)}','20261027-v2');insert into crm_seller_agreements values('${id(1)}','20261027-v1','hash','snapshot','Test Seller','I agree',now());`);
 assert.equal(await ready(),false);await assert.rejects(ack(),/every playbook video/);
 await db.exec(`insert into crm_training_progress(user_id,version,lesson,completed_at) values('${id(1)}','20261027-v2','portal',now());`);
 await assert.rejects(ack(),/every playbook section/);await assert.rejects(section('invalid',false),/Unknown/);await assert.rejects(section('playbook-0',true),/Read this section/);
 await section('playbook-0',false);await assert.rejects(section('playbook-0',true),/Read this section/);
 for(const name of [...Array.from({length:9},(_,i)=>'playbook-'+i),'gift-card-facts']){await section(name,false);await db.exec(`update crm_playbook_sections set started_at=clock_timestamp()-interval '9 seconds' where user_id='${id(1)}'`);await section(name,true);}
 assert.equal(await ready(),false);await ack();assert.equal(await ready(),true);assert.equal(await ready(id(2)),false);await ack();
 await db.exec('set role authenticated');await assert.rejects(db.query('select * from crm_playbook_sections'),/permission denied/);await assert.rejects(ack(),/permission denied/);
 }finally{await db.close();}
});
