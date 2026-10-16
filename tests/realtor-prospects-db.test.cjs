const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
test('realtors enter Prospects once, all contact data survives and existing sales edits remain authoritative',async()=>{
 const db=new PGlite();
 try {
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table referral_agents(id uuid primary key default gen_random_uuid(),name text,brokerage text,email text,phone text,city text,address text,state text,website text,postal_code text,phone_1 text,phone_2 text,phone_3 text,email_2 text,email_3 text,email_1_phone text,email_2_phone text,email_3_phone text,source_key text,source_file text,source_row int,city_rank int,status text,notes text,follow_up_on date,sms_consent boolean,referral_code text,activated_at timestamptz,created_by uuid,created_at timestamptz default now(),updated_at timestamptz default now());
 create table sales_leads(id uuid primary key default gen_random_uuid(),business_segment text default 'commercial',property_name text,name text,company_name text,contact_name text,contact_email text,contact_phone text,address text,sales_city text,sales_state text,sales_website text,lead_source text,lead_notes text,pipeline_stage text default 'new_leads',next_step text,next_step_due_at timestamptz,created_at timestamptz default now(),last_activity_at timestamptz, constraint sales_leads_pipeline_stage_check check(pipeline_stage in ('new_leads','contacted','walkthrough','quote_sent','contract_out','active','lost')));
 insert into sales_leads(property_name,pipeline_stage,lead_notes)values('Commercial','walkthrough','Preserve commercial notes');
 insert into referral_agents(name,email,phone,phone_2,email_3,notes,status,referral_code,sms_consent)values('Realtor A','a@example.test','111','222','alt@example.test','Source notes','active','DO-NOT-COPY',false),('Realtor B','b@example.test','333',null,null,'Do not call again','not_interested',null,false);`);
 const before=(await db.query('select jsonb_agg(to_jsonb(a) order by name) as data from referral_agents a')).rows[0].data;
 const path=fs.readdirSync('supabase/migrations').filter(n=>n.endsWith('_realtor_gift_sales.sql')).map(n=>'supabase/migrations/'+n).at(-1)||'../realtor-prospects.sql';
 await db.exec(fs.readFileSync(path,'utf8'));
 const rows=(await db.query("select * from sales_leads where prospect_type='realtor' order by name")).rows;
 assert.equal(rows.length,2);assert.equal(rows[0].pipeline_stage,'contacted');assert.equal(rows[1].pipeline_stage,'lost');
 assert.equal(rows[0].source_contact.phone_2,'222');assert.equal(rows[0].source_contact.email_3,'alt@example.test');assert.equal(rows[0].source_contact.referral_code,undefined);assert.equal(rows[0].lead_notes,'Source notes');
 assert.deepEqual((await db.query('select jsonb_agg(to_jsonb(a) order by name) as data from referral_agents a')).rows[0].data,before);
 await db.exec('select ensure_realtor_crm_prospect(a) from referral_agents a');
 assert.equal((await db.query('select count(*)::int n from sales_leads')).rows[0].n,3);
 await db.exec("update sales_leads set contact_email='edited@example.test',lead_notes='Sales conversation stays',pipeline_stage='link_sent' where name='Realtor A';update referral_agents set email='source-change@example.test',phone='444',notes='Updated original notes' where name='Realtor A';");
 const updated=(await db.query("select * from sales_leads where name='Realtor A'")).rows[0];
 assert.equal(updated.contact_email,'edited@example.test');assert.equal(updated.contact_phone,'444');assert.equal(updated.source_contact.email,'source-change@example.test');assert.equal(updated.source_contact.notes,'Updated original notes');assert.equal(updated.lead_notes,'Sales conversation stays');assert.equal(updated.pipeline_stage,'link_sent');
 assert.equal((await db.query("select lead_notes from sales_leads where property_name='Commercial'")).rows[0].lead_notes,'Preserve commercial notes');
 await db.exec("insert into referral_agents(name,email,status)values('New realtor','new@example.test','new');");
 assert.equal((await db.query("select count(*)::int n from sales_leads where name='New realtor' and business_segment='residential'")).rows[0].n,1);
 await db.exec("grant select,update on referral_agents to authenticated;set role authenticated;update referral_agents set phone='555' where name='Realtor A';reset role;");
 assert.equal((await db.query("select contact_phone from sales_leads where name='Realtor A'")).rows[0].contact_phone,'555');
 await db.exec("set role authenticated");await assert.rejects(db.query('select ensure_realtor_crm_prospect(null)'),/permission denied/);
 }finally{await db.close();}
});
