const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{randomUUID}=require('node:crypto'),{PGlite}=require('@electric-sql/pglite');
const root=path.resolve(__dirname,'..');
const sandbox={module:{exports:{}},require:n=>n==='./residential-server.cjs'?{fail:message=>new Error(message)}:n==='./gift-cards.cjs'?{}:require(path.join(root,'lib',n))};
vm.runInNewContext(fs.readFileSync(path.join(root,'lib/customer-repeat-booking.cjs'),'utf8'),sandbox);const R=sandbox.module.exports;
test('returning standard plans show actual per-visit savings and month-end dates do not drift',()=>{
 for(const [frequency,cents] of [['once',19500],['monthly',18000],['biweekly',16500],['weekly',15000]])assert.equal(R.price({sqft:1500},{service:'standard',frequency}).amount_cents,cents);
 assert.equal(R.price({sqft:500},{service:'standard',frequency:'weekly'}).amount_cents,14000);
 assert.throws(()=>R.price({sqft:1500},{service:'deep',frequency:'weekly'}),/standard/);
 assert.equal(R.nextDate('2027-01-31','monthly',31),'2027-02-28');assert.equal(R.nextDate('2027-02-28','monthly',31),'2027-03-31');assert.equal(R.nextDate('2028-01-31','monthly',31),'2028-02-29');assert.equal(R.nextDate('2026-12-28','weekly',28),'2027-01-04');
});
async function fixture(){
 const source=fs.readFileSync(path.join(__dirname,'gift-cards.test.cjs'),'utf8');
 const context={PGlite,fs,path,__dirname,module:{exports:{}}};vm.runInNewContext(source.slice(source.indexOf('async function dbFixture()'),source.indexOf('const G=require'))+'\nmodule.exports=dbFixture;',context);
 const db=await context.module.exports();
 await db.exec(`create table profiles(id uuid primary key,role text,status text,full_name text);
 alter table assignment_blocks add completed_at timestamptz,add completed_by uuid,add claimed_by uuid,add assigned_to uuid;
 alter table residential_accounts add booking_ids uuid[];
 alter table referral_bookings add column if not exists visit_details jsonb;
 create table residential_referral_links(booking_id uuid primary key,user_id uuid,method text);
 create function link_customer_rebooking(uuid,uuid,uuid) returns void language sql as $$update residential_accounts set booking_ids=array_append(booking_ids,$3) where id=$1 and $2=any(booking_ids) and not $3=any(booking_ids)$$;`);
 await db.exec(fs.readFileSync(path.join(root,'docs/customer-portal.sql'),'utf8'));
 await db.exec(fs.readFileSync(path.join(root,'supabase/migrations/20261030191912_customer_portal_repeat_booking.sql'),'utf8'));
 return db;
}
test('rebooking atomically retains edited household answers, gift credit, ownership and preferred contractor',async()=>{
 const db=await fixture();try{
 const account=randomUUID(),anchor=randomUUID(),worker=randomUUID(),order=randomUUID(),code='ABCDEFGHIJKLMNOPQRSTUVWX';
 await db.query("insert into residential_accounts(id,email,name,password_hash) values($1,'owner@example.com','Owner','hash')",[account]);
 await db.query("insert into profiles values($1,'contractor','active','Original Cleaner')",[worker]);
 const agent=(await db.query("insert into referral_agents(name,status) values('Agent','active') returning referral_code")).rows[0];
 const seed={name:'Owner',email:'owner@example.com',phone:'9195550100',profile_address:'Home',property_address:'Home',city:'Durham',state:'NC',zip:'27701',beds:3,baths:2,sqft:1500,service:'standard',frequency:'once',quote:{},amount_cents:19500,service_date:'2026-10-29',arrival_start:'09:00',arrival_end:'12:00',charge_at:'2026-10-29T10:00:00Z',notes:''};
 await db.query('select create_residential_booking($1,$2,$3,$4,$5,$6,$7)',[anchor,'token','anchor',agent.referral_code,JSON.stringify(seed),'requested','Authorized']);
 await db.query("update referral_bookings set stripe_customer='cus_owner',stripe_payment_method='pm_owner',status='completed',payment_status='paid' where id=$1",[anchor]);
 await db.query("insert into assignment_blocks(id,status,completed_by) values($1,'completed',$2)",[anchor,worker]);
 await db.query("insert into gift_orders(id,token_hash,request_hash,email,name,quantity,amount_cents,terms_version,stripe_session) values($1,'t','h','buyer@example.com','Buyer',1,10000,'v1','cs_test')",[order]);
 await db.query('select gift_issue($1,$2,$3,$4)',[order,'cs_test','pi_test',JSON.stringify([code])]);
 const data={service_date:'2099-01-31',arrival_start:'09:00',arrival_end:'12:00',quote:{...R.price({sqft:1500},{service:'standard',frequency:'monthly'})},visit_details:{pets:'yes',pet_details:'Dog in crate',parking:'guest',parking_instructions:'Space 2',access_method:'resident'},gift_code:code,gift_expected_cents:10000,notes:'Updated notes',consent_text:'Authorized recurring',token_hash:'new-token'};
 const book=(request,patch={},email='owner@example.com',plan=null,from=anchor)=>db.query('select customer_portal_book_v2($1,$2,null,$3,$4,$5,$6) as id',[from,email,account,request,JSON.stringify({...data,...patch}),plan]);
 await assert.rejects(book('wrong',{},'other@example.com'),/unavailable/);
 await assert.rejects(book('bad-gift',{gift_expected_cents:9999}),/Gift balance changed/);
 assert.equal((await db.query('select count(*)::int as n from referral_bookings')).rows[0].n,1);
 assert.equal((await db.query('select reserved_cents from gift_cards')).rows[0].reserved_cents,0);
 const id=(await book('good')).rows[0].id;assert.equal((await book('good')).rows[0].id,id);
 await assert.rejects(book('duplicate-plan',{gift_code:null}),/already has a recurring plan/);
 const b=(await db.query('select * from referral_bookings where id=$1',[id])).rows[0],plan=(await db.query('select * from customer_recurring_plans')).rows[0];
 assert.equal(b.frequency,'monthly');assert.equal(b.visit_details.pet_details,'Dog in crate');assert.equal(b.gift_applied_cents,10000);assert.equal(b.amount_cents,18000);assert.equal(plan.preferred_contractor_id,worker);assert.equal(plan.anchor_day,31);
 await assert.rejects(book('renew',{gift_code:null,service_date:'2099-02-28'},'owner@example.com',plan.id,id),/Finish the previous/);
 await db.query("insert into assignment_blocks(id,status) values($1,'qa_pending')",[id]);
 const next=(await book('renew',{gift_code:null,service_date:'2099-02-28'},'owner@example.com',plan.id,id)).rows[0].id;
 assert.notEqual(next,id);assert.equal((await db.query('select count(*)::int as n from customer_recurring_plans')).rows[0].n,1);assert.equal((await db.query('select gift_applied_cents from referral_bookings where id=$1',[next])).rows[0].gift_applied_cents,0);
 await db.query("update customer_recurring_plans set status='cancelled' where id=$1",[plan.id]);await assert.rejects(book('cancelled',{gift_code:null},'owner@example.com',plan.id,next),/Plan changed/);
 assert.equal((await db.query("select has_function_privilege('authenticated','customer_portal_book_v2(uuid,text,uuid,uuid,text,jsonb,uuid)','execute') as allowed")).rows[0].allowed,false);
 }finally{await db.close();}
});
