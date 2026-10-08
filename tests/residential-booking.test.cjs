const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');const {randomUUID}=require('node:crypto');const {PGlite}=require('@electric-sql/pglite');
const P=require('../lib/residential-pricing.cjs'),S=require('../lib/residential-server.cjs');
const data={service:'standard',frequency:'weekly',sqft:2000,beds:3,baths:2,name:'Example Customer',email:'test@example.com',phone:'9195550188',profile_address:'1 Profile Ln, Durham NC 27701',property_address:'2 Property Ln',city:'Durham',state:'NC',zip:'27701',property_confirmed:true,service_date:'2099-10-14',arrival_start:'09:00',arrival_end:'12:00',notes:''};
test('pricing follows all PDF rates, minimums, initial visit rules and custom-review threshold',()=>{
 assert.equal(P.quote({...data,frequency:'once'}).amount_cents,26000);
 assert.equal(P.quote({...data,sqft:500}).amount_cents,17500);
 for(const service of ['deep','move','listing'])assert.equal(P.quote({...data,service,frequency:'once'}).amount_cents,42000);
 for(const [frequency,cents,min] of [['monthly',24000,16500],['biweekly',22000,15000],['weekly',20000,14000]]){
  const q=P.quote({...data,frequency});assert.equal(q.amount_cents,26000);assert.equal(q.maintenance_cents,cents);assert.equal(P.quote({...data,sqft:500,frequency}).maintenance_cents,min);
 }
 assert.equal(P.quote({...data,service:'deep'}).amount_cents,42000);assert.equal(P.quote({...data,service:'deep'}).maintenance_cents,20000);
 assert.equal(P.quote({...data,sqft:3000}).review_required,false);assert.equal(P.quote({...data,sqft:3001}).review_required,true);
 for(const patch of [{sqft:-1},{sqft:NaN},{sqft:10.5},{service:'other'},{frequency:'daily'},{service:'move',frequency:'weekly'}])assert.throws(()=>P.quote({...data,...patch}));
 assert.equal(S.validate({...data,amount_cents:1,quote:{amount_cents:1}}).amount_cents,26000,'client price cannot override server quote');
});
test('schedule validation uses Eastern service dates and DST without charging at checkout',()=>{
 const now=new Date('2026-10-08T14:00:00Z');assert.equal(new Date(P.schedule({...data,service_date:'2026-10-09'},now).charge_at).toISOString(),'2026-10-09T10:00:00.000Z');
 assert.equal(new Date(P.schedule({...data,service_date:'2026-12-09'},now).charge_at).toISOString(),'2026-12-09T11:00:00.000Z');
 assert.throws(()=>P.schedule({...data,service_date:'2026-10-08'},now));assert.throws(()=>P.schedule({...data,arrival_end:'08:00'},now));assert.throws(()=>P.schedule({...data,service_date:'2027-02-30'},now));
 assert.throws(()=>S.validate({...data,property_confirmed:false}));assert.throws(()=>S.validate({...data,baths:1.3}));
});
async function dbFixture(){const db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);
create table sales_leads(id uuid primary key default gen_random_uuid(),property_name text,name text,contact_name text,contact_email text,contact_phone text,address text,sales_city text,default_service_type text,lead_source text,lead_notes text,pipeline_stage text,next_step text,task_priority text,task_status text);
create table quickbooks_invoice_links(id uuid primary key,quickbooks_status text,quickbooks_balance numeric,paid_at timestamptz);create table assignment_blocks(id uuid primary key,status text,quickbooks_invoice_link_id uuid references quickbooks_invoice_links(id));create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);grant usage on schema public,auth,storage to service_role;grant all on all tables in schema public to service_role;`);
for(const file of ['20261008120000_agent_referrals.sql','20261008152842_residential_bookings.sql'])await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations',file),'utf8'));return db;}
test('private database makes booking creation idempotent, retains agent credit and earns exactly one paid completed bonus',async()=>{
 const db=await dbFixture();try{
 const actor=randomUUID();await db.query('insert into auth.users values($1)',[actor]);const a=(await db.query("insert into referral_agents(name,status) values('Agent A','active') returning *")).rows[0],b=(await db.query("insert into referral_agents(name,status) values('Agent B','active') returning *")).rows[0];
 const create='select create_residential_booking($1,$2,$3,$4,$5,$6,$7)';const validated=S.validate(data),id=randomUUID();const args=[id,'tokenhash','payloadhash',a.referral_code,JSON.stringify(validated),'awaiting_card','Authorized'];await db.query(create,args);await db.query(create,args);
 assert.equal((await db.query('select count(*)::int n from referral_bookings')).rows[0].n,1);await assert.rejects(db.query(create,[id,'wrong',...args.slice(2)]));
 const other=randomUUID();await db.query(create,[other,'another','anotherhash',b.referral_code,JSON.stringify(validated),'awaiting_card','Authorized']);assert.equal((await db.query('select agent_id from referral_bookings where id=$1',[other])).rows[0].agent_id,a.id);
 await db.query("update referral_bookings set stripe_payment_method='pm_test',status='scheduled',service_date=(now() at time zone 'America/New_York')::date,payment_status='paid',paid_at=now() where id=$1",[id]);
 assert.equal((await db.query('select bonus_status from referral_ledger')).rows[0].bonus_status,'pending');
 await db.query('select finish_residential_booking($1,$2,false)',[id,actor]);let ledger=(await db.query('select * from referral_ledger')).rows[0];assert.equal(ledger.bonus_status,'earned');assert.equal(Number(ledger.bonus_amount),26);assert.equal(ledger.first_booking_id,id);
 await db.query("update referral_bookings set stripe_payment_method='pm_test2',status='scheduled',service_date=(now() at time zone 'America/New_York')::date,payment_status='paid',paid_at=now() where id=$1",[other]);await db.query('select finish_residential_booking($1,$2,false)',[other,actor]);assert.equal((await db.query('select first_booking_id from referral_ledger')).rows[0].first_booking_id,id);
 await db.query("update referral_bookings set payment_status='adjusted',paid_at=null where id=$1",[id]);assert.equal((await db.query('select bonus_status from referral_ledger')).rows[0].bonus_status,'pending');
 await assert.rejects(db.query('select record_referral_payout($1,$2,$3)',[ledger.id,'Test',actor]),/earned/);
 await db.exec('set role anon');await assert.rejects(db.query('select * from referral_bookings'),/permission denied/);await assert.rejects(db.query('select claim_residential_charges()'),/permission denied/);await db.exec('reset role;set role authenticated');await assert.rejects(db.query('select finish_residential_booking($1,$2,false)',[id,actor]),/permission denied/);
 }finally{await db.close();}
});
test('charge leases only claim due confirmed visits and stop ambiguous retries before 24 hours',async()=>{
 const db=await dbFixture();try{const a=(await db.query("insert into referral_agents(name,status) values('A','active') returning *")).rows[0];let ids=[];
 for(let i=0;i<4;i++){let id=randomUUID();ids.push(id);await db.query('select create_residential_booking($1,$2,$3,$4,$5,$6,$7)',[id,'hash','hash'+i,a.referral_code,JSON.stringify(S.validate(data)),'awaiting_card','Authorized']);}
 await db.query("update referral_bookings set stripe_payment_method='pm',status='scheduled',payment_status='card_saved',service_date=(now() at time zone 'America/New_York')::date,charge_at=now()-interval '1 hour' where id=any($1::uuid[])",[ids.slice(0,3)]);
 await db.query("update referral_bookings set charge_at=now()+interval '2 hours' where id=$1",[ids[1]]);await db.query("update referral_bookings set status='cancelled' where id=$1",[ids[2]]);
 let rows=(await db.query('select * from claim_residential_charges()')).rows;assert.equal(rows.length,1);assert.equal(rows[0].id,ids[0]);const key=rows[0].charge_key;
 assert.equal((await db.query('select * from claim_residential_charges()')).rows.length,0);
 await db.query("update referral_bookings set charge_locked_at=now()-interval '11 minutes' where id=$1",[ids[0]]);assert.equal((await db.query('select * from claim_residential_charges()')).rows[0].charge_key,key);
 await db.query("update referral_bookings set charge_started_at=now()-interval '24 hours',charge_locked_at=null where id=$1",[ids[0]]);assert.equal((await db.query('select * from claim_residential_charges()')).rows.length,0);assert.equal((await db.query('select payment_status from referral_bookings where id=$1',[ids[0]])).rows[0].payment_status,'uncertain');
 }finally{await db.close();}
});
function queryClient(record){let updates=[];return {updates,from(){const q={select(){return q},eq(){return q},update(v){updates.push(v);return q},maybeSingle:async()=>({data:record}),then(fn){return Promise.resolve({data:record}).then(fn)}};return q;}};}
test('card confirmation validates ownership and never marks a customer as paid',async()=>{
 const b={id:randomUUID(),status:'awaiting_card',stripe_customer:'cus_correct',stripe_session:'cs_test',charge_at:'2099-01-01'};const db=queryClient(b);const session={id:'cs_test',mode:'setup',status:'complete',client_reference_id:b.id,metadata:{booking_id:b.id},customer:b.stripe_customer,setup_intent:{status:'succeeded',customer:b.stripe_customer,payment_method:'pm_saved'}};
 const st={checkout:{sessions:{retrieve:async()=>session}}};await S.reconcileSession(db,st,'cs_test');assert.equal(db.updates[0].status,'scheduled');assert.equal(db.updates[0].payment_status,'card_saved');assert.equal(db.updates[0].paid_at,undefined);
 session.customer='cus_forged';await assert.rejects(S.reconcileSession(db,st,'cs_test'),/match/);assert.equal(db.updates.length,1);
});
test('payment reconciliation requires matching customer, amount, currency and durable charge key; refunds revoke payment eligibility',async()=>{
 const b={id:randomUUID(),stripe_customer:'cus_1',amount_cents:26000,charge_key:'key'};const db=queryClient(b);let pi={id:'pi_1',customer:'cus_1',currency:'usd',amount:26000,amount_received:26000,status:'succeeded',metadata:{booking_id:b.id,charge_key:'key'},latest_charge:{refunded:false,amount_refunded:0}};const st={paymentIntents:{retrieve:async()=>pi}};
 await S.reconcilePayment(db,st,pi.id);assert.equal(db.updates.at(-1).payment_status,'paid');pi.amount=1;await assert.rejects(S.reconcilePayment(db,st,pi.id),/match/);pi.amount=26000;pi.latest_charge.amount_refunded=100;await S.reconcilePayment(db,st,pi.id);assert.equal(db.updates.at(-1).payment_status,'adjusted');assert.equal(db.updates.at(-1).paid_at,null);
});
test('webhook rejects forged signatures before reading or writing booking records',async()=>{
 const handler=require('../api/residential-webhook.js');let result;const res={setHeader(){},end(v){result=JSON.parse(v)}};const old=process.env.STRIPE_WEBHOOK_SECRET;process.env.STRIPE_WEBHOOK_SECRET='whsec_test';try{await handler({method:'POST',headers:{'stripe-signature':'forged'},async *[Symbol.asyncIterator](){yield Buffer.from('{}');}},res);assert.equal(res.statusCode,400);assert.match(result.error,/signature/);}finally{if(old===undefined)delete process.env.STRIPE_WEBHOOK_SECRET;else process.env.STRIPE_WEBHOOK_SECRET=old;}
});
const {lookup}=require('../lib/residential-property.cjs');
test('property lookup exposes only home attributes, requires a unique match, and falls back on provider errors',async()=>{
 const old=process.env.RENTCAST_API_KEY;process.env.RENTCAST_API_KEY='test-only';try{
 let call;const r=await lookup(data,async(url,options)=>{call={url,options};return {ok:true,json:async()=>[{formattedAddress:'2 Property Ln, Durham NC 27701',bedrooms:3,bathrooms:2,squareFootage:2000,owner:{name:'Private Owner'},taxAssessments:{private:'irrelevant'}}]};});
 assert.equal(r.found,true);assert.equal(r.sqft,2000);assert.equal(r.owner,undefined);assert.equal(r.taxAssessments,undefined);assert.equal(call.options.headers['X-Api-Key'],'test-only');assert.match(call.url,/api\.rentcast\.io\/v1\/properties\?/);
 assert.equal((await lookup(data,async()=>({ok:true,json:async()=>[{},{}]}))).found,false);assert.equal((await lookup(data,async()=>({ok:false,status:429}))).found,false);
 await assert.rejects(lookup({...data,zip:'bad'}));
 }finally{if(old===undefined)delete process.env.RENTCAST_API_KEY;else process.env.RENTCAST_API_KEY=old;}
});
