const {test}=require('node:test'),assert=require('node:assert/strict'),{PGlite}=require('@electric-sql/pglite'),fs=require('node:fs');
test('36% migration recalculates unfinished residential work, protects history and payment reservations, and prices future jobs',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;
 create table property_units(id uuid primary key,customer_price numeric,contractor_pay numeric);
 create table referral_bookings(id uuid primary key,amount_cents int,cleaner_payout_rate numeric default 0.40,status text);
 create table contractor_payouts(assignment_id uuid);
 create table assignment_blocks(id uuid primary key,unit_id uuid,pay_amount numeric,status text,start_window timestamptz,visibility text,metadata jsonb,completed_at timestamptz,paid_out boolean,paid_at timestamptz,paid_amount numeric,payment_status text,pay_status text,payout_status text,quickbooks_payment_status text);
 insert into property_units values('11111111-1111-4111-8111-111111111111',250,95);
 insert into referral_bookings select ('00000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,31500,0.40,'requested' from generate_series(1,10) i;
 insert into assignment_blocks(id,pay_amount,status,metadata) select id,126,'in_progress',jsonb_build_object('source','residential_booking','cleaner_payout_rate',0.40) from referral_bookings;
 update assignment_blocks set status='completed' where id::text like '%0002';
 update assignment_blocks set status='cancelled' where id::text like '%0003';
 update assignment_blocks set paid_out=true where id::text like '%0004';
 update assignment_blocks set payment_status='processing' where id::text like '%0005';
 insert into contractor_payouts select id from assignment_blocks where id::text like '%0006';
 update assignment_blocks set completed_at=now() where id::text like '%0007';
 update assignment_blocks set paid_amount=10 where id::text like '%0008';
 update assignment_blocks set metadata='{}',unit_id='11111111-1111-4111-8111-111111111111',pay_amount=95 where id::text like '%0009';
 update assignment_blocks set metadata='{"scope_type":"residential","customer_price":195}',pay_amount=78 where id::text like '%0010';
 delete from referral_bookings where id::text like '%0010';`);
 await db.exec(fs.readFileSync('supabase/migrations/20261109191732_residential_contractor_pay_36.sql','utf8'));
 let rows=(await db.query('select pay_amount,metadata from assignment_blocks order by id')).rows;
 assert.deepEqual(rows.map(r=>Number(r.pay_amount)),[113.4,126,126,126,126,126,126,126,95,70.2]);
 assert.equal(rows[0].metadata.residential_rate_change.previous_pay,126);
 assert.equal(rows[9].metadata.cleaner_payout_rate,0.36);
 assert.deepEqual((await db.query('select cleaner_payout_rate from referral_bookings order by id')).rows.map(r=>Number(r.cleaner_payout_rate)),[.36,.4,.4,.4,.4,.4,.4,.4,.4]);
 await db.exec(`create trigger set_new_clean_payout before insert on assignment_blocks for each row execute function apply_new_clean_payout();
 insert into referral_bookings(id,amount_cents,status) values('22222222-2222-4222-8222-222222222222',25000,'scheduled');
 insert into assignment_blocks(id,unit_id,pay_amount,status,metadata) values
 ('22222222-2222-4222-8222-222222222222',null,0,'open','{"source":"residential_booking"}'),
 ('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111',0,'open','{}'),
 ('44444444-4444-4444-8444-444444444444',null,0,'open','{"scope_type":"residential","customer_price":195.55}'),
 ('55555555-5555-4555-8555-555555555555',null,100,'completed','{"scope_type":"residential","customer_price":250}'),
 ('66666666-6666-4666-8666-666666666666',null,100,'open','{"scope_type":"residential"}');`);
 rows=(await db.query("select pay_amount,status,metadata from assignment_blocks where id::text not like '00000000%' order by id")).rows;
 assert.deepEqual(rows.map(r=>Number(r.pay_amount)),[90,95,70.4,100,0]);
 assert.equal(rows[4].status,'pending');assert.equal(rows[4].metadata.pay_review_required,true);
 assert.equal(Number((await db.query("select cleaner_payout_rate from referral_bookings where id='22222222-2222-4222-8222-222222222222'")).rows[0].cleaner_payout_rate),.36);
 }finally{await db.close();}
});
