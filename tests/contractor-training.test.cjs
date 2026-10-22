const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite'),fs=require('node:fs'),training=require('../lib/contractor-training.cjs');
test('training uses all lessons and passing quiz, while waivers retain real progress',()=>{
 const id=randomUUID(),rows=Array.from({length:12},(_,i)=>({profile_id:id,module_number:i+1,lessons_done:5,score:90,waived:false}));
 assert.equal(training.items(rows,id).length,1);assert.equal(training.items(rows,id)[0].title,'Contractor training');assert.equal(training.merge({items:[{required:true,state:'done'}]},training.items(rows,id)).requiredCount,2);assert.equal(training.merge({items:[{required:true,state:'done'}]},training.items(rows,id)).complete,true);
 rows[0].lessons_done=4;assert.equal(training.merge({items:[]},training.items(rows,id)).complete,false);
 rows.forEach(r=>r.waived=true);assert.equal(training.merge({items:[]},training.items(rows,id)).complete,true);
 rows.forEach(r=>r.waived=false);rows[1].score=80;assert.equal(training.merge({items:[]},training.items(rows,id)).complete,false);
 assert.throws(()=>training.items([],id),/unavailable|incomplete/);
});
test('training switches are admin only, isolated, audited and reject stale saves',async()=>{
 const db=new PGlite(),admin=randomUUID(),a=randomUUID(),b=randomUUID();
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create table profiles(id uuid primary key,role text,status text);create table academy_learning_progress(user_id uuid,lesson_key text);create table academy_practice_attempts(user_id uuid,module_number integer,score integer);
 grant usage on schema public to service_role,authenticated;grant all on all tables in schema public to service_role;`);
 // This test exercises training state independently; the claim function is exercised in claim-gate.test.
 await db.exec(fs.readFileSync('supabase/migrations/20261022113559_contractor_academy_onboarding.sql','utf8').split('create or replace function public.claim_onboarded')[0]);
 await db.exec(fs.readFileSync('supabase/migrations/20261022120231_contractor_single_training_requirement.sql','utf8').split('create or replace function public.claim_onboarded')[0]);
 await db.query("insert into profiles values($1,'admin','active'),($2,'contractor','active'),($3,'contractor','active')",[admin,a,b]);
 await db.exec('set role authenticated');await assert.rejects(db.query('select * from contractor_training_requirements'),/permission denied/);
 await assert.rejects(db.query('select set_contractor_training_requirement($1,$2,1,false,null)',[admin,a]),/permission denied/);
 await db.exec('set role service_role');
 await assert.rejects(db.query('select set_contractor_training_requirement($1,$2,1,false,null)',[a,a]),/admin/);
 await db.query('select set_contractor_training_requirement($1,$2,1,false,null)',[admin,a]);
 let rows=(await db.query('select * from contractor_training_status(null)')).rows;
 assert.equal(rows.filter(r=>r.waived).length,1);const saved=rows.find(r=>r.profile_id===a&&r.module_number===1);
 await assert.rejects(db.query('select set_contractor_training_requirement($1,$2,1,true,null)',[admin,a]),/changed/);
 await db.query('select set_contractor_training_requirement($1,$2,1,true,$3)',[admin,a,saved.revision]);
 assert.equal((await db.query('select * from contractor_training_status($1)',[a])).rows.some(r=>r.waived),false);
 assert.equal((await db.query('select count(*)::int n from contractor_training_requirement_events')).rows[0].n,2);
 const revisions=async()=>Object.fromEntries((await db.query('select * from contractor_training_status($1)',[a])).rows.map(r=>[r.module_number,r.revision]));
 const before=await revisions();
 await db.query('select set_contractor_training_required($1,$2,false,$3)',[admin,a,JSON.stringify(before)]);
 assert.equal((await db.query('select * from contractor_training_status($1)',[a])).rows.filter(r=>r.waived).length,12);
 assert.equal((await db.query('select * from contractor_training_status($1)',[b])).rows.filter(r=>r.waived).length,0);
 await assert.rejects(db.query('select set_contractor_training_required($1,$2,true,$3)',[admin,a,JSON.stringify(before)]),/changed/);
 await db.query('select set_contractor_training_required($1,$2,true,$3)',[admin,a,JSON.stringify(await revisions())]);
 assert.equal((await db.query('select * from contractor_training_status($1)',[a])).rows.filter(r=>r.waived).length,0);
 }finally{await db.close();}
});

test('API blocks an approved contractor with unfinished training and fails closed on progress outage',async()=>{
 const {claim}=require('../api/contractor-claim-job.js'),id=randomUUID(),req={headers:{authorization:'Bearer test'}};
 let waived=false,offline=false,claimed=false;
 const rows=()=>Array.from({length:12},(_,i)=>({profile_id:id,module_number:i+1,lessons_done:0,score:0,waived}));
 const db={auth:{getUser:async()=>({data:{user:{id}}})},from:()=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:{id,role:'contractor',status:'active'}}),single:async()=>({data:{contractor_approved:true,status:'active'}})}),rpc:async name=>name==='contractor_training_status'?{data:offline?null:rows(),error:offline?{}:null}:(claimed=true,{data:null})};
 const remote=async()=>({ok:true,json:async()=>({complete:true,items:[{required:true,state:'done'}]})});
 await assert.rejects(claim(db,req,{id:randomUUID()},remote),/Complete all required/);assert.equal(claimed,false);
 waived=true;await claim(db,req,{id:randomUUID()},remote);assert.equal(claimed,true);
 offline=true;await assert.rejects(claim(db,req,{action:'eligibility'},remote),/unavailable/);
});
