const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const P=require('../lib/customer-portal.cjs');
const id='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
test('receipt signup grants only its booking, cannot overwrite existing identities, and is private',async()=>{
 const d=new PGlite();try{
 await d.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(email text);
 create table residential_accounts(id uuid primary key default gen_random_uuid(),email text unique,name text,password_hash text,verified_at timestamptz not null default now());
 create table referral_bookings(id uuid primary key,token_hash text,status text,assignment_deleted_at timestamptz,email text,name text);
 insert into referral_bookings values('${id}','proof','scheduled',null,'owner@example.com','Owner'),('${other}','other-proof','scheduled',null,'owner@example.com','Owner');`);
 await d.exec(fs.readFileSync('supabase/migrations/20261020113642_booking_customer_signup.sql','utf8'));
 const hash='scrypt-v1:'+ 'a'.repeat(32)+':'+ 'b'.repeat(128);
 const create=async(booking,token)=>{await d.exec('set role service_role');try{return await d.query('select create_booking_customer($1,$2,$3) created',[booking,token,hash]);}finally{await d.exec('reset role');}};
 await assert.rejects(create(id,'wrong'));
 assert.equal((await create(id,'proof')).rows[0].created,true);
 const a=(await d.query('select * from residential_accounts')).rows[0];assert.deepEqual(a.booking_ids,[id]);assert.equal(a.verified_at,null);
 assert.deepEqual(await P.scope(null,a),{ids:[id]});assert.deepEqual(await P.scope(null,{email:a.email,booking_ids:null}),{email:a.email});
 assert.equal((await create(other,'other-proof')).rows[0].created,false);
 assert.deepEqual((await d.query('select booking_ids from residential_accounts')).rows[0].booking_ids,[id]);
 await d.query('select link_customer_rebooking($1,$2,$3)',[a.id,other,other]);assert.deepEqual((await d.query('select booking_ids from residential_accounts')).rows[0].booking_ids,[id]);
 await d.query('select link_customer_rebooking($1,$2,$3)',[a.id,id,other]);assert.deepEqual((await d.query('select booking_ids from residential_accounts')).rows[0].booking_ids,[id,other]);
 await d.exec("delete from residential_accounts;insert into auth.users values('owner@example.com')");assert.equal((await create(id,'proof')).rows[0].created,false);
 const permissions=(await d.query("select has_function_privilege('anon','create_booking_customer(uuid,text,text)','execute') a,has_function_privilege('authenticated','create_booking_customer(uuid,text,text)','execute') u")).rows[0];assert.equal(permissions.a,false);assert.equal(permissions.u,false);
 }finally{await d.close();}
});
test('booking login claim requires receipt ownership and the signed-in email',async()=>{
 const calls=[];const db={from(){return {select(){return this},eq(k,v){calls.push([k,v]);return this},maybeSingle:async()=>({data:{id,email:'owner@example.com'}})}},rpc:async(name,args)=>{calls.push([name,args]);return {data:null}}};
 await assert.rejects(P.claimBooking(db,{id:other,email:'other@example.com',booking_ids:[other]},{booking:id,booking_token:'a'.repeat(64)}),/email used/);
 assert.equal(calls.some(c=>c[0]==='link_customer_rebooking'),false);
 await P.claimBooking(db,{id:other,email:'owner@example.com',booking_ids:[other]},{booking:id,booking_token:'a'.repeat(64)});
 assert.equal(calls.filter(c=>c[0]==='link_customer_rebooking').length,1);
 assert.equal(calls.some(c=>c[0]==='token_hash'),true);
});
