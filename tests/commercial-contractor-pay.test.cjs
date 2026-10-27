const {test}=require('node:test'),assert=require('node:assert/strict'),{PGlite}=require('@electric-sql/pglite'),fs=require('node:fs');
test('commercial inserts and repairs use unit presets; residential stays at 40 percent; committed pay is protected',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;
 create table property_units(id uuid primary key,customer_price numeric,contractor_pay numeric);
 create table referral_bookings(id uuid primary key,amount_cents int,cleaner_payout_rate numeric);
 create table contractor_payouts(assignment_id uuid);
 create table assignment_blocks(id uuid primary key,unit_id uuid,pay_amount numeric,status text,start_window timestamptz,visibility text,metadata jsonb,claimed_by uuid,assigned_to uuid,started_at timestamptz,completed_at timestamptz,paid_out boolean,paid_at timestamptz,payment_status text,pay_status text,payout_status text,quickbooks_payment_status text);
 insert into property_units values('11111111-1111-4111-8111-111111111111',280,95);
 insert into referral_bookings values('22222222-2222-4222-8222-222222222222',25000,0.4);
 insert into assignment_blocks(id,unit_id,pay_amount,status,start_window,metadata) select ('00000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'11111111-1111-4111-8111-111111111111',112,'pending',now()+interval '2 days','{"cleaner_payout_policy":"40_percent_new_cleans"}' from generate_series(1,4) i;
 update assignment_blocks set claimed_by='33333333-3333-4333-8333-333333333333',status='claimed' where id::text like '%0002';
 update assignment_blocks set paid_out=true where id::text like '%0003';
 insert into contractor_payouts select id from assignment_blocks where id::text like '%0004';`);
 await db.exec(fs.readFileSync('supabase/migrations/20261027150000_residential_only_percentage_pay.sql','utf8'));
 const repaired=(await db.query('select pay_amount from assignment_blocks order by id')).rows.map(r=>Number(r.pay_amount));assert.deepEqual(repaired,[95,112,112,112]);
 await db.exec('create trigger set_new_clean_payout before insert on assignment_blocks for each row execute function apply_new_clean_payout()');
 await db.exec(`insert into assignment_blocks(id,unit_id,pay_amount,status,metadata) values('44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111',112,'open','{}'),('55555555-5555-4555-8555-555555555555',null,77,'open','{}'),('22222222-2222-4222-8222-222222222222',null,1,'open','{"source":"residential_booking"}');`);
 const rows=(await db.query("select id,pay_amount,metadata from assignment_blocks where id::text not like '00000000%' order by id")).rows;
 assert.deepEqual(rows.map(r=>Number(r.pay_amount)),[100,95,77]);assert.equal(rows[1].metadata.cleaner_payout_policy,'property_unit_preset');assert.equal(rows[1].metadata.cleaner_payout_rate,undefined);
 }finally{await db.close();}
});
