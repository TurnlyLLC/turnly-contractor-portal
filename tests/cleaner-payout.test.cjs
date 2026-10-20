const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{PGlite}=require('@electric-sql/pglite');
test('new cleans pay 40% without rewriting old bookings, existing jobs or later status updates',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;
 create table referral_bookings(id uuid primary key,amount_cents int);
 create table property_units(id uuid primary key,customer_price numeric);
 create table assignment_blocks(id uuid primary key,unit_id uuid,pay_amount numeric,metadata jsonb,status text,visibility text);
 insert into referral_bookings values('00000000-0000-4000-8000-000000000001',20000);
 insert into assignment_blocks values('00000000-0000-4000-8000-000000000002',null,100,'{}','open','open');`);
 await db.exec(fs.readFileSync('supabase/migrations/20261020195815_new_clean_payout_40.sql','utf8'));
 await db.exec(`insert into referral_bookings values('00000000-0000-4000-8000-000000000003',20000,default);
 insert into assignment_blocks values('00000000-0000-4000-8000-000000000003',null,0,'{"source":"residential_booking"}','pending','pending');
 insert into assignment_blocks values('00000000-0000-4000-8000-000000000001',null,95,'{"source":"residential_booking"}','pending','pending');
 insert into assignment_blocks values('00000000-0000-4000-8000-000000000004',null,150,'{"customer_price":300.01}','open','open');
 insert into assignment_blocks values('00000000-0000-4000-8000-000000000005',null,150,'{}','open','open');
 update referral_bookings set amount_cents=50000;
 update assignment_blocks set status='completed' where id='00000000-0000-4000-8000-000000000003';`);
 const rows=(await db.query('select * from assignment_blocks order by id')).rows;
 assert.equal(Number(rows[0].pay_amount),95);assert.equal(Number(rows[1].pay_amount),100);assert.equal(Number(rows[2].pay_amount),80);assert.equal(Number(rows[3].pay_amount),120);
 assert.equal(Number(rows[4].pay_amount),0);assert.equal(rows[4].status,'pending');assert.equal(rows[4].metadata.pay_review_required,true);
 }finally{await db.close();}
});
