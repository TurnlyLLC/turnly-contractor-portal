const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto'),{PGlite}=require('@electric-sql/pglite');
const A=require('../lib/ambassadors.cjs');
async function dbFixture(){const db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);
create table sales_leads(id uuid primary key default gen_random_uuid(),property_name text,name text,contact_name text,contact_email text,contact_phone text,address text,sales_city text,default_service_type text,lead_source text,lead_notes text,pipeline_stage text,next_step text,task_priority text,task_status text);
create table quickbooks_invoice_links(id uuid primary key,quickbooks_status text,quickbooks_balance numeric,paid_at timestamptz);create table assignment_blocks(id uuid primary key,status text,visibility text,pay_amount numeric,metadata jsonb,quickbooks_invoice_link_id uuid references quickbooks_invoice_links(id));create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);grant usage on schema public,auth,storage to service_role;grant all on all tables in schema public to service_role;`);
for(const file of ['20261008120000_agent_referrals.sql','20261008152842_residential_bookings.sql','20261008210000_residential_customer_accounts.sql','20261009135355_residential_booking_completion.sql'])await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations',file),'utf8'));return db;}
test('first-clean attribution, fixed milestones, duplicate events, private access and payout history',async()=>{
 const db=await dbFixture();try{
 await db.exec("create type user_role as enum ('admin','contractor','sales','sales_team','property_manager','customer'); create table profiles(id uuid primary key,role user_role); alter table referral_customers alter column agent_id drop not null; alter table referral_bookings alter column agent_id drop not null;");
 for(const f of ['20261015172413_direct_residential_booking.sql','20261019164146_brand_ambassador_portal.sql'])await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations',f),'utf8'));
 const a=randomUUID(),b=randomUUID();await db.query('insert into auth.users values($1),($2)',[a,b]);
 await db.query("insert into ba_members(user_id,name,email,code) values($1,'Ambassador One','one@example.com','BA-1111111111111111'),($2,'Ambassador Two','two@example.com','BA-2222222222222222')",[a,b]);
 const lead=(await db.query("select register_ba_lead('BA-1111111111111111','Customer Example','customer@example.com','+19195550101','yes') id")).rows[0].id;
 const duplicate=(await db.query("select register_ba_lead('BA-2222222222222222','Customer Example','customer@example.com','+19195550101','yes') id")).rows[0].id;assert.equal(duplicate,lead);
 const data={name:'Customer Example',email:'customer@example.com',phone:'+19195550101',profile_address:'Example',property_address:'Example',city:'Raleigh',state:'NC',zip:'27601',beds:2,baths:2,sqft:1000,service:'standard',frequency:'once',quote:{},notes:'',amount_cents:20000,service_date:'2099-01-01',arrival_start:'09:00',arrival_end:'12:00',charge_at:'2099-01-01T11:00:00Z'};
 const id=randomUUID();await db.query("select create_ba_booking($1,'token','hash','BA-1111111111111111',$2,'awaiting_card','yes')",[id,JSON.stringify(data)]);
 assert.equal((await db.query('select * from ba_earnings')).rows.length,0);
 await db.query("update referral_bookings set stripe_payment_method='pm_local',status='scheduled' where id=$1",[id]);
 await db.query("update referral_bookings set stripe_payment_method='pm_local',status='scheduled',payment_status='paid' where id=$1",[id]);
 assert.equal((await db.query('select sum(amount_cents)::integer n from ba_earnings')).rows[0].n,2500);
 await db.query("update referral_bookings set stripe_payment_method='pm_local',status='completed',completed_at=now() where id=$1",[id]);
 await db.query("update referral_bookings set stripe_payment_method='pm_local',status='completed',completed_at=now() where id=$1",[id]);
 assert.equal((await db.query('select sum(amount_cents)::integer n from ba_earnings')).rows[0].n,5000);
 const existing={...data,name:'Existing Customer',email:'existing@example.com',phone:'+19195550102'};
 await db.query("select create_direct_booking($1,'old-token','old-hash',$2,'requested',null)",[randomUUID(),JSON.stringify(existing)]);
 await db.query("select create_ba_booking($1,'new-token','new-hash','BA-1111111111111111',$2,'requested',null)",[randomUUID(),JSON.stringify(existing)]);
 assert.equal((await db.query("select stage from ba_leads where email='existing@example.com'")).rows[0].stage,'ineligible');
 const cancelId=randomUUID(),cancelData={...data,name:'Cancelled Customer',email:'cancel@example.com',phone:'+19195550103'};
 await db.query("select create_ba_booking($1,'cancel-token','cancel-hash','BA-1111111111111111',$2,'requested',null)",[cancelId,JSON.stringify(cancelData)]);
 await db.query("update referral_bookings set status='cancelled' where id=$1",[cancelId]);
 assert.equal((await db.query("select stage from ba_leads where email='cancel@example.com'")).rows[0].stage,'cancelled');
 assert.equal((await db.query('select sum(amount_cents)::integer n from ba_earnings')).rows[0].n,5000);
 const second=randomUUID();await db.query("select create_ba_booking($1,'token2','hash2','BA-2222222222222222',$2,'requested',null)",[second,JSON.stringify(data)]);
 await db.query("update referral_bookings set stripe_payment_method='pm_local',status='completed',completed_at=now() where id=$1",[second]);
 assert.equal((await db.query('select count(*)::int n from ba_earnings')).rows[0].n,2);
 assert.equal((await db.query('select member_id from ba_leads where id=$1',[lead])).rows[0].member_id,a);
 const earning=(await db.query('select id from ba_earnings order by earned_at limit 1')).rows[0].id;
 await db.query("select ba_record_payment($1,$2,'external-ref-1')",[earning,a]);
 await assert.rejects(db.query("select ba_record_payment($1,$2,'external-ref-2')",[earning,a]),/already paid/);
 await db.query("update referral_bookings set payment_status='adjusted' where id=$1",[id]);
 const unpaid=(await db.query('select id from ba_earnings where paid_at is null')).rows[0].id;
 await assert.rejects(db.query("select ba_record_payment($1,$2,'external-ref-3')",[unpaid,a]),/review/);
 assert.equal((await db.query('select review_required from ba_leads where id=$1',[lead])).rows[0].review_required,true);
 assert.equal((await db.query('select sum(amount_cents)::integer n from ba_earnings')).rows[0].n,5000);
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(db.query('select * from ba_leads'),/permission denied/);await assert.rejects(db.query("select register_ba_lead('BA-1111111111111111','X','x@example.com','9195550100','yes')"),/permission denied/);}
 }finally{await db.close();}
});
test('contact consent and stored access are required; metadata cannot grant access',async()=>{
 assert.throws(()=>A.contact({name:'X',email:'x@example.com',phone:'9195550100'}));
 const db={auth:{getUser:async()=>({data:{user:{id:'id',user_metadata:{role:'admin'}}}})},from:t=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:t==='profiles'?{role:'contractor',status:'active'}:null})})};
 await assert.rejects(A.access(db,{headers:{}}),e=>e.status===401);
 await assert.rejects(A.access(db,{headers:{authorization:'Bearer fake'}}),e=>e.status===401);
});
test('HTTP dashboard forces ambassador ownership and strips private profile fields',async()=>{
 const vm=require('node:vm'),S=require('../lib/residential-server.cjs');let selected;
 const member={user_id:'mine',name:'Ambassador',email:'agent@example.com',code:'BA-1111111111111111',enabled:true,session_id:'private-session',must_change_password:false,onboarding_completed_at:'2026-10-19'};
 const db={from(table){return {select(){return this},eq(key,value){selected=value;return this},order(){return this},range:async()=>({data:[{id:'lead',name:'Example Person',stage:'lead'}]}),in:async()=>({data:[]})};}};
 const context={module:{exports:{}},require:p=>p==='../lib/residential-server.cjs'?{...S,database:()=>db}:p==='../lib/ambassadors.cjs'?{...A,access:async()=>({id:'mine',admin:false,member})}:p==='../lib/agent-referrals.cjs'?require('../lib/agent-referrals.cjs'):require(p),console,Buffer,process};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../api/ambassadors.js'),'utf8'),context);
 let output;const res={setHeader(){},end(s){output=JSON.parse(s)}};
 await context.module.exports({method:'POST',headers:{authorization:'Bearer local'},body:{action:'dashboard',member_id:'someone-else'}},res);
 assert.equal(res.statusCode,200);assert.equal(selected,'mine');assert.equal(output.leads[0].name,'Example P.');assert.equal(output.member.session_id,undefined);assert.equal(output.members.length,1);
 await context.module.exports({method:'POST',headers:{authorization:'Bearer local'},body:{action:'create',name:'Escalate'}},res);assert.equal(res.statusCode,403);
});
