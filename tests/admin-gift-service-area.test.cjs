const {test}=require('node:test'),assert=require('node:assert/strict'),{PGlite}=require('@electric-sql/pglite'),fs=require('node:fs'),{randomUUID}=require('node:crypto');
test('admin assignment moves existing paid cards between local totals and audits without changing balances',async()=>{
 const db=new PGlite(),actor=randomUUID(),other=randomUUID(),order=randomUUID();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table profiles(id uuid,role text,status text);
 create table gift_orders(id uuid,status text,paid_at timestamptz,refunded_cents int,disputed boolean);
 create table gift_cards(id uuid,order_id uuid,status text,balance_cents int,reserved_cents int);
 create table gift_events(order_id uuid,card_id uuid,kind text,actor uuid,details jsonb);`);
 await db.exec(fs.readFileSync('supabase/migrations/20261111120945_contractor_gift_activity.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261111121824_admin_gift_service_area.sql','utf8'));
 await db.query("insert into profiles values($1,'admin','active'),($2,'contractor','active')",[actor,other]);
 await db.query("insert into gift_orders values($1,'paid',now(),0,false,null)",[order]);
 await db.query("insert into gift_cards values($1,$3,'active',10000,0),($2,$3,'active',10000,0)",[randomUUID(),randomUUID(),order]);
 const save=(zone,expected=null,who=actor)=>db.query('select gift_assign_service_area($1,$2,$3,$4)',[who,order,zone,expected]);
 const total=async zone=>Number((await db.query('select sold from contractor_gift_activity(array[$1])',[zone])).rows[0].sold);
 assert.equal(await total('NC:Durham'),0);
 await assert.rejects(save('NC:Durham',null,other),/admin access/);
 await assert.rejects(save('VA:Reston'),/available service/);
 await save('NC:Durham');assert.equal(await total('NC:Durham'),2);
 await assert.rejects(save('NC:Raleigh'),/changed/);
 await save('NC:Raleigh','NC:Durham');assert.equal(await total('NC:Durham'),0);assert.equal(await total('NC:Raleigh'),2);
 await save(null,'NC:Raleigh');assert.equal(await total('NC:Raleigh'),0);
 assert.equal((await db.query('select count(*)::int n from gift_events')).rows[0].n,6);
 assert.equal(Number((await db.query('select sum(balance_cents) n from gift_cards')).rows[0].n),20000);
 await db.exec('set role authenticated');await assert.rejects(save('NC:Durham'),/permission denied/);
 }finally{await db.close();}
});
