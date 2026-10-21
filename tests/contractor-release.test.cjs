const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const {release}=require('../api/contractor-release-job.js');

test('release UI strictly enforces ownership, status and 48-hour boundary',async()=>{
  const {canReleaseJob}=await import('../contractor-release-policy.mjs');
  const now=Date.now(), job={claimed_by:'owner',status:'claimed',start_window:new Date(now+48*3600000+1).toISOString()};
  assert.equal(canReleaseJob(job,'owner',now),true);
  for(const change of [{start_window:new Date(now+48*3600000).toISOString()},{start_window:null},{claimed_by:'other'},{assigned_to:'other'},{status:'in_progress'},{started_at:'2026-01-01'},{completed_at:'2026-01-01'}])assert.equal(canReleaseJob({...job,...change},'owner',now),false);
});

test('API uses authenticated user, not caller-supplied identity',async()=>{
  const id=randomUUID(), actor=randomUUID(); let args;
  const db={auth:{getUser:async()=>({data:{user:{id:actor}}})},rpc:async(name,input)=>{args=input;return {data:null};}};
  await assert.rejects(release(db,{headers:{}},{id}),e=>e.status===401);
  await release(db,{headers:{authorization:'Bearer test'}},{id,p_actor:randomUUID()});
  assert.deepEqual(args,{p_actor:actor,p_job:id});
});

test('database releases atomically, audits, and rejects late, foreign, or started jobs',async()=>{
  const db=new PGlite(), owner=randomUUID(), other=randomUUID(), id=randomUUID();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create table profiles(id uuid,role text,status text);
      create table assignment_blocks(id uuid primary key,status text,visibility text,claimed_by uuid,claimed_by_name text,claimed_by_email text,claimed_at timestamptz,assigned_to uuid,assigned_to_name text,assigned_to_email text,accepted_at timestamptz,started_at timestamptz,completed_at timestamptz,start_window timestamptz,pay_amount numeric);
      create table admin_audit_log(actor_id uuid,action text,entity text,entity_id text,before_value text,after_value text,source text);
      grant usage on schema public to service_role,authenticated,anon;
      grant all on all tables in schema public to service_role;`);
    await db.exec(fs.readFileSync('supabase/migrations/20261021185103_contractor_release_job.sql','utf8'));
    await db.query("insert into profiles values ($1,'contractor','active'),($2,'contractor','active')",[owner,other]);
    await db.query("insert into assignment_blocks(id,status,visibility,claimed_by,assigned_to,start_window,pay_amount) values ($1,'claimed','claimed',$2,$2,now()+interval '49 hours',80)",[id,owner]);
    await db.exec('set role authenticated');
    await assert.rejects(db.query('select release_contractor_job($1,$2)',[owner,id]),/permission denied/);
    await db.exec('set role service_role');
    await assert.rejects(db.query('select release_contractor_job($1,$2)',[other,id]),/only release/);
    for(const update of ["start_window=clock_timestamp()+interval '48 hours'","start_window=null","start_window=now()+interval '49 hours',started_at=now()","started_at=null,status='completed'"]) {
      await db.exec('update assignment_blocks set '+update);
      await assert.rejects(db.query('select release_contractor_job($1,$2)',[owner,id]));
    }
    await db.exec("update assignment_blocks set status='claimed',started_at=null,start_window=now()+interval '49 hours'");
    await db.query('select release_contractor_job($1,$2)',[owner,id]);
    const job=(await db.query('select * from assignment_blocks')).rows[0];
    assert.equal(job.status,'open'); assert.equal(job.visibility,'open'); assert.equal(job.claimed_by,null); assert.equal(job.assigned_to,null); assert.equal(Number(job.pay_amount),80);
    assert.equal((await db.query('select * from admin_audit_log')).rows.length,1);
    await assert.rejects(db.query('select release_contractor_job($1,$2)',[owner,id]),/only release/);
  } finally {await db.close();}
});
