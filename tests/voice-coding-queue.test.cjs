const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{PGlite}=require('@electric-sql/pglite');
const {checkChanges}=require('../scripts/voice-codex-worker.cjs');
test('automatic publishing refuses deletions and authority/config changes',()=>{
 for(const item of [['D','dashboard.html'],['M','lib/integration-policy.cjs'],['M','supabase/migrations/example.sql'],['A','.env.local'],['M','api/coding-worker.js'],['M','package.json'],['R100','old.html']])assert.throws(()=>checkChanges([item]));
 assert.doesNotThrow(()=>checkChanges([['M','dashboard.html'],['A','tests/dashboard.test.cjs']]));
});
test('coding queue leases one job and never automatically replays a stale job',async()=>{
 const db=new PGlite(),worker='11111111-1111-4111-8111-111111111111',owner='22222222-2222-4222-8222-222222222222';
 try{
 await db.exec('create role anon;create role authenticated;create role service_role;create table profiles(id uuid primary key);');
 await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261117011000_voice_coding_queue.sql'),'utf8'));
 await db.query('insert into profiles values($1)',[owner]);await db.query("insert into portal_coding_workers(id,secret_hash,expires_at) values($1,'hash',now()+interval '1 day')",[worker]);
 await db.query("insert into portal_coding_jobs(owner_id,instructions) values($1,'Update the portal styling'),($1,'Update the training styling')",[owner]);
 const claim=async()=>(await db.query('select portal_coding_claim($1) job',[worker])).rows[0].job;
 const first=await claim();assert.equal(first.state,'running');assert.equal(await claim(),null);
 await db.exec("update portal_coding_jobs set updated_at=now()-interval '6 minutes' where state='running'");
 const second=await claim();assert.notEqual(second.id,first.id);assert.equal((await db.query('select state from portal_coding_jobs where id=$1',[first.id])).rows[0].state,'needs_attention');
 await db.exec('update portal_coding_workers set revoked_at=now()');await assert.rejects(claim,/Invalid worker/);
 }finally{await db.close();}
});
