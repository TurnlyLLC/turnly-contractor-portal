const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const {summarize}=require('../lib/crm-sales.cjs');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('paid orders count once per order, buyers by normalized email; pending orders never create revenue',()=>{
 const paid={paid_at:'2026-01-01',quantity:2,amount_cents:20000,email:'Agent@Example.test',name:'Agent',buyer_kind:'realtor',status:'paid'};
 const s=summarize([{...paid,id:id(10)},{...paid,id:id(11),email:'agent@example.test',refunded_cents:10000},{...paid,id:id(12),paid_at:null}],[{status:'earned',amount_cents:500},{status:'held',amount_cents:0},{status:'rate_not_set'}]);
 assert.equal(s.purchases,2);assert.equal(s.realtor_buyers,1);assert.equal(s.cards,4);assert.equal(s.gross_cents,40000);assert.equal(s.refund_cents,10000);assert.equal(s.commission_cents,500);assert.equal(s.clients.length,1);
});
test('database enforces owner isolation, month reminders, single attribution, refunds and no-new-lead alerts',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create table profiles(id uuid primary key,full_name text,role text,status text);
 create function current_user_has_role(text[]) returns boolean language sql stable as $$select exists(select 1 from profiles where id=auth.uid() and role=any($1) and status='active')$$;
 create function current_user_can_use_sales_portal() returns boolean language sql stable as $$select current_user_has_role(array['admin','sales','sales_team'])$$;
 create table sales_leads(id uuid primary key default gen_random_uuid(),business_segment text default 'residential',sales_owner_id uuid,sales_owner_name text,sales_city text,sales_state text,pipeline_stage text default 'new_leads',do_not_contact boolean default false,contact_name text,name text,property_name text,next_step_due_at timestamptz,task_due_at timestamptz,task_status text,sales_confirmation_ref text,last_activity_at timestamptz);
 create table sales_activities(id uuid primary key default gen_random_uuid(),lead_id uuid,user_id uuid,user_name text,activity_type text,activity_text text,metadata jsonb);
 create table gift_orders(id uuid primary key default gen_random_uuid(),email text,name text,quantity int,amount_cents int,status text default 'pending',paid_at timestamptz);
 create table sales_tasks(id uuid,lead_id uuid);create table sales_quotes(id uuid,lead_id uuid);create table sales_contracts(id uuid,lead_id uuid);create table sales_walkthroughs(id uuid,lead_id uuid);
 create function assign_residential_leads(uuid[],uuid[],boolean) returns integer language plpgsql as $$declare n integer;begin update sales_leads set sales_owner_id=$2[1] where id=any($1) and sales_owner_id is null;get diagnostics n=row_count;return n;end$$;
 alter table sales_leads enable row level security;create policy existing on sales_leads to authenticated using(true) with check(true);
 alter table sales_activities enable row level security;create policy existing on sales_activities to authenticated using(true) with check(true);
 grant usage on schema public,auth to authenticated;grant select,update,insert on all tables in schema public to authenticated;
 insert into profiles values('${id(1)}','Admin','admin','active'),('${id(2)}','Alice','sales','active'),('${id(3)}','Bob','sales','active');
 select set_config('test.uid','${id(1)}',false);`);
 const migration=fs.readdirSync('supabase/migrations').find(n=>n.endsWith('_crm_sales_operations.sql'));
 await db.exec(fs.readFileSync(migration?'supabase/migrations/'+migration:'../crm-sales-operations.sql','utf8'));
 await db.exec(`insert into sales_leads(id,sales_owner_id,contact_name,sales_city)values('${id(10)}','${id(2)}','First','Raleigh'),('${id(11)}','${id(3)}','Second','Durham');
 update sales_leads set pipeline_stage='follow_up' where id='${id(10)}';`);
 let r=(await db.query(`select follow_up_due_at>now()+interval '27 days' and follow_up_due_at<now()+interval '32 days' as scheduled from sales_leads where id='${id(10)}'`)).rows[0];assert.equal(r.scheduled,true);
 assert.equal((await db.query("select count(*)::int n from crm_notifications where kind='leads_exhausted' and not resolved")).rows[0].n,1);
 await db.exec(`insert into sales_leads(id,sales_owner_id,contact_name)values('${id(12)}','${id(2)}','Third');`);
 assert.equal((await db.query("select count(*)::int n from crm_notifications where kind='leads_exhausted' and not resolved")).rows[0].n,0);
 await db.exec(`update sales_leads set do_not_contact=true where id='${id(10)}'`);
 assert.equal((await db.query(`select follow_up_due_at from sales_leads where id='${id(10)}'`)).rows[0].follow_up_due_at,null);
 assert.equal((await db.query("select count(*)::int n from crm_notifications where kind='follow_up' and not resolved")).rows[0].n,0);
 await db.exec(`insert into gift_orders(id,email,name,quantity,amount_cents,sales_user_id,sales_lead_id,buyer_kind,commission_mode,commission_rate) values('${id(20)}','a@example.test','Agent',2,20000,'${id(2)}','${id(12)}','realtor','percent',1000)`);
 assert.equal((await db.query('select count(*)::int n from crm_sales_commissions')).rows[0].n,0);
 await db.exec(`update gift_orders set status='paid',paid_at=now() where id='${id(20)}';update gift_orders set status='paid' where id='${id(20)}'`);
 assert.equal((await db.query(`select amount_cents from crm_sales_commissions where order_id='${id(20)}'`)).rows[0].amount_cents,2000);
 await db.exec(`insert into gift_orders(id,email,name,quantity,amount_cents,sales_user_id,buyer_kind,commission_mode,commission_rate)values('${id(21)}','A@EXAMPLE.TEST','Agent',10,100000,'${id(3)}','realtor','percent',1000);update gift_orders set status='paid',paid_at=now() where id='${id(21)}'`);
 const repeat=(await db.query(`select amount_cents,status from crm_sales_commissions where order_id='${id(21)}'`)).rows[0];assert.equal(repeat.amount_cents,0);assert.equal(repeat.status,'repeat_purchase');
 assert.equal((await db.query("select count(*)::int n from sales_activities where activity_type='purchase'")).rows[0].n,1);
 await db.exec(`update gift_orders set refunded_cents=10000 where id='${id(20)}'`);assert.equal((await db.query(`select amount_cents from crm_sales_commissions where order_id='${id(20)}'`)).rows[0].amount_cents,1000);
 await db.exec(`update gift_orders set disputed=true where id='${id(20)}'`);assert.equal((await db.query(`select status from crm_sales_commissions where order_id='${id(20)}'`)).rows[0].status,'held');
 await db.exec(`select set_config('test.uid','${id(2)}',false);set role authenticated;`);
 assert.equal((await db.query('select count(*)::int n from sales_leads')).rows[0].n,2);
 assert.equal((await db.query(`update sales_leads set pipeline_stage='lost' where id='${id(11)}' returning id`)).rows.length,0);
 await assert.rejects(db.query(`update sales_leads set sales_owner_id='${id(3)}' where id='${id(12)}'`),/reassign/);
 await assert.rejects(db.query('select * from crm_sales_commissions'),/permission denied/);
 await assert.rejects(db.query(`select crm_allocate_region(array['${id(2)}'::uuid],1)`),/Administrator/);
 await db.exec(`reset role;select set_config('test.uid','${id(1)}',false);insert into sales_leads(id,sales_city,sales_region) values('${id(30)}','Raleigh','Triangle'),('${id(31)}','Durham','Triangle');set role authenticated;`);
 assert.equal((await db.query(`select crm_allocate_region(array['${id(2)}'::uuid],10,'Triangle','Raleigh') n`)).rows[0].n,1);
 assert.equal((await db.query(`select crm_allocate_region(array['${id(3)}'::uuid],10,'Triangle','Raleigh') n`)).rows[0].n,0);
 assert.equal((await db.query(`select crm_remove_operator_leads('${id(2)}',true) n`)).rows[0].n,1);
 assert.equal((await db.query(`select sales_owner_id from sales_leads where id='${id(30)}'`)).rows[0].sales_owner_id,null);
 }finally{await db.close();}
});
const {send}=require('../lib/crm-sales.cjs');
function fakeDb(lead){const tables={sales_leads:[lead],crm_sales_links:[],crm_checkout_links:[],crm_sales_messages:[],sales_activities:[]};return {tables,from(table){let mode='select',payload,filters=[],single=false,ignore=false;const q={select(){return q},eq(k,v){filters.push(r=>r[k]===v);return q},single(){single=true;return q},maybeSingle(){single=true;return q},insert(v){mode='insert';payload=v;return q},upsert(v,opts){mode='upsert';payload=v;ignore=opts?.ignoreDuplicates;return q},update(v){mode='update';payload=v;return q},then(resolve,reject){try{let rows=tables[table]||[];let match=rows.filter(r=>filters.every(f=>f(r)));if(mode==='insert'||mode==='upsert'){let prior=mode==='upsert'?rows.find(r=>r.user_id===payload.user_id&&r.lead_id===payload.lead_id):null;if(prior&&ignore)match=[prior];else{let r={id:id(50+rows.length),code:'a'.repeat(32),token:'b'.repeat(32),...payload};rows.push(r);match=[r];}}if(mode==='update')match.forEach(r=>Object.assign(r,payload));resolve({data:single?match[0]||null:match,error:null});}catch(e){reject(e)}}};return q;}};}
test('message sends require owned lead and explicit consent; provider receipts and request IDs prevent double sends',async()=>{
 const lead={id:id(40),sales_owner_id:id(2),business_segment:'residential',contact_name:'Agent',contact_email:'agent@example.test',contact_phone:'+19195550123',pipeline_stage:'new_leads',do_not_contact:false},db=fakeDb(lead),user={id:id(2),full_name:'Sales Member',admin:false};
 const input={lead_id:lead.id,channel:'email',request_id:id(60),consent:true};let calls=0;const oldFetch=global.fetch,oldKey=process.env.RESEND_API_KEY,oldFrom=process.env.REFERRAL_FROM_EMAIL;process.env.RESEND_API_KEY='fixture-only';process.env.REFERRAL_FROM_EMAIL='Turnly <sales@example.test>';
 global.fetch=async(url,options)=>{calls++;assert.equal(url,'https://api.resend.com/emails');assert.deepEqual(JSON.parse(options.body).to,['agent@example.test']);assert.match(JSON.parse(options.body).text,/gift-cards.html\?ref=/);return {ok:true,json:async()=>({id:'fixture-message'})};};
 try{
  await assert.rejects(send(db,user,{...input,consent:false}),/permission/);assert.equal(calls,0);
  await assert.rejects(send(db,{...user,id:id(3)},input),/another sales member/);assert.equal(calls,0);
  lead.do_not_contact=true;await assert.rejects(send(db,user,input),/opted out/);assert.equal(calls,0);lead.do_not_contact=false;
  assert.equal((await send(db,user,{...input,recipient:'tampered@example.test'})).status,'accepted');assert.equal(calls,1);
  assert.equal((await send(db,user,input)).status,'accepted');assert.equal(calls,1);assert.equal(db.tables.crm_sales_messages.length,1);assert.equal(db.tables.sales_activities.length,1);assert.equal(lead.pipeline_stage,'link_sent');
 }finally{global.fetch=oldFetch;if(oldKey===undefined)delete process.env.RESEND_API_KEY;else process.env.RESEND_API_KEY=oldKey;if(oldFrom===undefined)delete process.env.REFERRAL_FROM_EMAIL;else process.env.REFERRAL_FROM_EMAIL=oldFrom;}
});
