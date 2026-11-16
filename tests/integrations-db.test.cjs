const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{PGlite}=require('@electric-sql/pglite');
test('integration database enforces permissions, idempotency, insert-only writes, and queued events',async()=>{
 const db=new PGlite();try{
 await db.exec("create role anon;create role authenticated;create role service_role;create type user_role as enum ('admin','contractor');create table profiles(id uuid primary key,role user_role,status text);create table sales_leads(id uuid primary key default gen_random_uuid(),created_by uuid,property_name text,name text,contact_name text,contact_email text,contact_phone text,sales_city text,sales_state text,lead_source text,business_segment text,prospect_type text,pipeline_stage text,sales_owner_id uuid,created_at timestamptz default now());create table referral_bookings(id uuid primary key default gen_random_uuid(),status text);");
 await db.exec(fs.readFileSync('supabase/migrations/20261116130025_turnly_integration_keys_and_webhooks.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261116131442_integration_role_enum_compatibility.sql','utf8'));
 const owner='11111111-1111-4111-8111-111111111111',key='22222222-2222-4222-8222-222222222222',hook='33333333-3333-4333-8333-333333333333';
 await db.query("insert into profiles values($1,'admin','active')",[owner]);
 await db.query("insert into integration_keys(id,name,secret_hash,prefix,scopes,created_by,expires_at) values($1,'Test','hash','prefix',array['leads:read','leads:create'],$2,now()+interval '1 day')",[key,owner]);
 await db.query("insert into integration_hooks values($1,'Test','https://example.com','encrypted',array['lead.created','lead.updated','booking.created'],true,$2,now())",[hook,owner]);
 assert.equal((await db.query("select integration_use_key('hash','leads:read') k")).rows[0].k,key);
 await assert.rejects(()=>db.query("select integration_use_key('hash','bookings:read')"));
 const data={name:'Person',contact_email:'p@example.com',contact_phone:'',sales_city:'Raleigh',sales_state:'NC'};
 const call=(request,hash='body')=>db.query("select integration_create_lead($1,$2,$3,$4::jsonb) result",[key,request,hash,JSON.stringify(data)]);
 const first=(await call('request-1')).rows[0].result;assert.equal(first.created,true);
 assert.equal((await call('request-1')).rows[0].result.replayed,true);
 await assert.rejects(()=>call('request-1','different'));
 await db.query("update sales_leads set pipeline_stage='contacted',sales_owner_id=$1 where id=$2",[owner,first.id]);
 const duplicate=(await call('request-2')).rows[0].result;assert.equal(duplicate.created,false);
 const lead=(await db.query('select * from sales_leads')).rows[0];assert.equal(lead.pipeline_stage,'contacted');assert.equal(lead.sales_owner_id,owner);
 await db.exec("insert into referral_bookings(status) values('scheduled')");
 const events=(await db.query('select event_type,payload from integration_deliveries')).rows;assert.equal(events.length,3);assert.ok(events.every(e=>!JSON.stringify(e.payload).includes('p@example.com')));assert.ok(events.some(e=>e.event_type==='booking.created'));
 const claim=(await db.query('select * from integration_claim_deliveries()')).rows;assert.equal(claim.length,3);assert.equal((await db.query('select * from integration_claim_deliveries()')).rows.length,0);
 await db.query("update integration_keys set revoked_at=now() where id=$1",[key]);assert.equal((await db.query("select integration_use_key('hash','leads:read') k")).rows[0].k,null);
 await db.exec('set role anon');await assert.rejects(()=>db.query('select * from integration_keys'));await assert.rejects(()=>db.query("select integration_use_key('hash','leads:read')"));await db.exec('reset role');
 }finally{await db.close();}
});

