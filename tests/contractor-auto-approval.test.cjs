const {test}=require('node:test'),assert=require('node:assert/strict');
const {complete,reconcile}=require('../lib/contractor-auto-approval.cjs');
const {PGlite}=require('@electric-sql/pglite');
const fs=require('node:fs'),{randomUUID}=require('node:crypto');
test('only authoritative complete checklists activate accounts',async()=>{
 for(const file of [null,{}, {complete:true,items:[]},{complete:false,items:[{required:true,state:'done'}]},...['todo','in_review','expired','rejected'].map(state=>({complete:true,items:[{required:true,state}]}))]){
 assert.equal(complete(file),false);assert.equal((await reconcile({},randomUUID(),file)).approved,false);
 }
 assert.equal(complete({complete:true,items:[{required:true,state:'done'},{required:false,state:'todo'}]}),true);
});
test('automatic approval is server-only, idempotent and preserves blocked accounts and screening',async()=>{
 const db=new PGlite(),id=randomUUID(),checklist={complete:true,items:[{required:true,state:'done',background:true}]};
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table profiles(id uuid primary key,role text,status text,approval_status text,contractor_approved boolean,contractor_approved_at timestamptz,contractor_approved_by uuid);
 create table contractors(profile_id uuid,contractor_approved boolean,status text,approval_status text);
 create table contractor_background_checks(profile_id uuid,status text,sync_state text);
 create table progress(profile_id uuid,waived boolean,lessons_done int,score int);
 create function contractor_training_status(uuid) returns setof progress language sql as $$select * from public.progress where profile_id=$1$$;
 create table admin_audit_log(actor_id uuid,actor_name text,action text,entity text,entity_id text,before_value text,after_value text,source text);
 grant all on all tables in schema public to service_role;`);
 await db.exec(fs.readFileSync('supabase/migrations/20261110202809_contractor_automatic_onboarding_approval.sql','utf8'));
 await db.query("insert into profiles values($1,'contractor','pending','pending',false,null,null)",[id]);
 await db.query('insert into contractors(profile_id) values($1)',[id]);
 await db.exec('set role authenticated');await assert.rejects(db.query('select auto_approve_completed_contractor($1,$2)',[id,checklist]),/permission denied/);await db.exec('reset role');
 const approve=async()=> (await db.query('select auto_approve_completed_contractor($1,$2) as result',[id,checklist])).rows[0].result;
 assert.equal((await approve()).approved,false);
 await db.query('insert into progress select $1,false,5,90 from generate_series(1,12)',[id]);
 for(const status of ['suspended','inactive','disabled','rejected','deletion_pending','deleted']){
 await db.query('update profiles set status=$1',[status]);assert.equal((await approve()).approved,false);
 }
 await db.exec("update profiles set status='pending',approval_status='rejected'");assert.equal((await approve()).approved,false);
 await db.exec("update profiles set approval_status='pending'");
 await db.query("insert into contractor_background_checks values($1,'awaiting_review','synced')",[id]);assert.equal((await approve()).approved,false);
 await db.exec("update contractor_background_checks set status='approved',sync_state='pending'");assert.equal((await approve()).approved,false);
 await db.exec("update contractor_background_checks set sync_state='synced'");
 checklist.items[0].required=false;assert.equal((await approve()).approved,false);checklist.items[0].required=true;checklist.items[0].state='todo';assert.equal((await approve()).approved,false);checklist.items[0].state='done';checklist.items[0].background=false;assert.equal((await approve()).approved,false);checklist.items[0].background=true;assert.deepEqual(await approve(),{approved:true,changed:true});assert.deepEqual(await approve(),{approved:true,changed:false});
 assert.equal((await db.query('select count(*)::int n from admin_audit_log')).rows[0].n,1);
 assert.equal((await db.query('select contractor_approved from contractors')).rows[0].contractor_approved,true);
 }finally{await db.close();}
});
