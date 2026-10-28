const {test}=require('node:test'),assert=require('node:assert/strict');
const {claim}=require('../api/contractor-claim-job.js');
const {randomUUID}=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');
const fs=require('node:fs');
function fixture(items,approval={contractor_approved:true,status:'active'}) {
 const id=randomUUID(),calls=[];
 const profile={id,role:'contractor',status:'active'};
 const db={auth:{getUser:async()=>({data:{user:{id}}})},from(table){return {select(){return this;},eq(){return this;},maybeSingle:async()=>({data:table==='contractor_background_checks'?null:profile}),single:async()=>({data:approval})};},rpc:async(name,args)=>{if(name==='contractor_training_status')return {data:Array.from({length:12},(_,i)=>({profile_id:id,module_number:i+1,lessons_done:5,score:90,waived:false}))};calls.push({name,args});return {data:null};}};
 const remote=async()=>({ok:true,json:async()=>({items})});
 return {db,remote,calls,id};
}
test('claims fail closed for every unfinished required state despite approved profile',async()=>{
 for(const state of ['todo','pending','expired','rejected','needs_resign']){
  const f=fixture([{required:true,state}]);
  await assert.rejects(claim(f.db,{headers:{authorization:'Bearer test'}},{id:randomUUID()},f.remote),/Complete all required/);
  assert.equal(f.calls.length,0);
 }
 const f=fixture([{required:true,state:'done'}]);
 await assert.rejects(claim(f.db,{headers:{authorization:'Bearer test'}},{id:randomUUID()},async()=>{throw Error('offline');}));
 assert.equal(f.calls.length,0);
});
test('done or admin-waived requirements allow claims, optional items do not block',async()=>{
 const f=fixture([{required:true,state:'done',submission:{source:'admin'}},{required:false,state:'todo'}]);
 await claim(f.db,{headers:{authorization:'Bearer test'}},{id:randomUUID(),p_actor:randomUUID()},f.remote);
 assert.equal(f.calls[0].args.p_actor,f.id);
 const pending=fixture([{required:true,state:'done'}],{contractor_approved:false,status:'pending'});
 const status=await claim(pending.db,{headers:{authorization:'Bearer test'}},{action:'eligibility'},pending.remote);
 assert.equal(status.eligible,false);assert.equal(pending.calls.length,0);
});
test('SQL closes old claim paths and serializes successful claims',async()=>{
 const db=new PGlite(),owner=randomUUID(),other=randomUUID(),job=randomUUID();
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema turnly_private;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create table profiles(id uuid primary key,full_name text,email text,role text,status text,contractor_approved boolean);
 create table assignment_blocks(id uuid primary key,status text,visibility text,claimed_by uuid,assigned_to uuid,claimed_by_name text,claimed_by_email text,assigned_to_name text,assigned_to_email text,claimed_at timestamptz,accepted_at timestamptz,preferred_contractor_ids uuid[],declined_contractor_ids uuid[]);
 create function claim_assignment_block(uuid) returns void language sql as $$select$$;
 create function contractor_assignment_matches_scope(assignment_blocks,uuid) returns boolean language sql as $$select true$$;
 grant usage on schema public,auth,turnly_private to authenticated,service_role;
 grant all on all tables in schema public to authenticated,service_role;`);
 await db.exec(fs.readFileSync('supabase/migrations/20261021185731_contractor_onboarding_claim_gate.sql','utf8'));
 await db.exec(`create table academy_learning_progress(user_id uuid,lesson_key text);create table academy_practice_attempts(user_id uuid,module_number integer,score integer);grant all on academy_learning_progress,academy_practice_attempts to service_role;`);
 await db.exec(fs.readFileSync('supabase/migrations/20261022113559_contractor_academy_onboarding.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261022120231_contractor_single_training_requirement.sql','utf8'));
 await db.query("insert into profiles values($1,'One','one@example.invalid','contractor','active',true),($2,'Two','two@example.invalid','contractor','active',false)",[owner,other]);
 await db.query("insert into assignment_blocks(id,status,visibility) values($1,'open','open')",[job]);
 await db.query("select set_config('test.uid',$1,false)",[owner]);await db.exec('set role authenticated');
 await assert.rejects(db.query('select claim_assignment_block($1)',[job]),/permission denied/);
 await assert.rejects(db.query('select claim_onboarded_contractor_job($1,$2)',[owner,job]),/permission denied/);
 await assert.rejects(db.query("update assignment_blocks set claimed_by=$1,status='claimed' where id=$2",[owner,job]),/updated portal/);
 await assert.rejects(db.query("insert into assignment_blocks(id,status,claimed_by) values($1,'claimed',$2)",[randomUUID(),owner]),/cannot create/);
 await db.exec('set role service_role');
 await assert.rejects(db.query('select claim_onboarded_contractor_job($1,$2)',[other,job]),/Complete onboarding/);
 await assert.rejects(db.query('select claim_onboarded_contractor_job($1,$2)',[owner,job]),/required training/);
 await db.query("insert into academy_learning_progress select $1,'M'||lpad(m::text,2,'0')||'_L'||lpad(l::text,2,'0') from generate_series(1,12) m cross join generate_series(1,5) l",[owner]);
 await db.query('insert into academy_practice_attempts select $1,m,90 from generate_series(1,12) m',[owner]);
 await db.query('select claim_onboarded_contractor_job($1,$2)',[owner,job]);
 assert.equal((await db.query('select claimed_by from assignment_blocks')).rows[0].claimed_by,owner);
 await assert.rejects(db.query('select claim_onboarded_contractor_job($1,$2)',[owner,job]),/no longer available/);
 } finally{await db.close();}
});
