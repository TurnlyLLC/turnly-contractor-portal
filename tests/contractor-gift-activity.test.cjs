const {test}=require('node:test'),assert=require('node:assert/strict'),{PGlite}=require('@electric-sql/pglite'),fs=require('node:fs');
test('local counts exclude unpaid, refunds, disputes, unknown areas and issued-card failures',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create table gift_orders(id int,status text,paid_at timestamptz,refunded_cents int,disputed boolean);create table gift_cards(id int,order_id int,status text,balance_cents int,reserved_cents int);`);
 await db.exec(fs.readFileSync('supabase/migrations/20261111120945_contractor_gift_activity.sql','utf8'));
 await db.exec(`insert into gift_orders values(1,'paid',now(),0,false,'NC:Durham'),(2,'pending',null,0,false,'NC:Durham'),(3,'paid',now(),10000,false,'NC:Durham'),(4,'paid',now(),0,true,'NC:Durham'),(5,'paid',now(),0,false,null),(6,'paid',now(),0,false,'NC:Raleigh');
 insert into gift_cards values(1,1,'active',10000,0),(2,1,'spent',0,0),(3,1,'active',5000,0),(4,1,'active',10000,10000),(5,2,'active',10000,0),(6,3,'active',10000,0),(7,4,'active',10000,0),(8,5,'active',10000,0),(9,6,'active',10000,0),(10,1,'suspended',10000,0);`);
 const rows=(await db.query("select * from contractor_gift_activity(array['NC:Durham','NC:Asheville']) order by zone")).rows;
 assert.deepEqual(rows.map(r=>[r.zone,Number(r.sold),Number(r.awaiting_redemption)]),[['NC:Asheville',0,0],['NC:Durham',4,1]]);
 await db.exec('set role authenticated');await assert.rejects(db.query("select * from contractor_gift_activity(array['NC:Durham'])"),/permission denied/);
 }finally{await db.close();}
});
test('API derives count scope from stored contractor preferences',async()=>{
 const Z=require('../lib/contractor-job-zones.cjs'),calls=[];
 const db={from:()=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:{role:'contractor',status:'active',allowed_regions:['Durham']}})}),rpc:async(name,args)=>{calls.push({name,args});return {data:[]}}};
 await Z.run(db,'self',{action:'preferences',p_zones:['NC:Raleigh']});
 assert.deepEqual(calls,[{name:'contractor_gift_activity',args:{p_zones:['NC:Durham']}}]);
});
