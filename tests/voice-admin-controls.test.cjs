const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const policy=require('../lib/integration-policy.cjs'),C=require('../lib/integration-catalog.cjs'),M=require('../api/turnly-mcp.js');
test('later booking release preserves explicit contractor pay and assignment',()=>{
 const J=require('../lib/residential-jobs.cjs');
 const patch=J.approvalAssignmentPatch({amount_cents:20000},{pay_amount:95,assigned_to:'contractor',metadata:{contractor_pay_override:true,unit_contractor_pay:95,cleaner_payout_policy:'admin_assignment_override'}},{},'admin');
 assert.equal(patch.pay_amount,95);assert.equal(patch.visibility,'preferred');assert.equal(patch.metadata.unit_contractor_pay,95);
 assert.equal(J.approvalAssignmentPatch({amount_cents:20000},{metadata:{}},{},'admin').pay_amount,72);
});
test('voice retains every published non-deletion action and rejects deletion',()=>{
 const p={deny_record_deletion:true},catalog=policy.catalog(C.catalog(),p);
 for(const name of Object.keys(C.actions))assert.equal(!!catalog.actions[name],!policy.deletesRecords(name));
 assert.throws(()=>policy.enforce('applicants.delete',p));
 assert.ok(!M.definitions(['platform:full'],p).some(t=>t.name.includes('delete')));
 assert.ok(M.definitions(['platform:full'],p).some(t=>t.name.includes('assignments_reassign')));
});
test('assignment changes preserve history, prevent stale writes and protect pending payouts',async()=>{
 const db=new PGlite(),admin='11111111-1111-4111-8111-111111111111',contractor='22222222-2222-4222-8222-222222222222',job='33333333-3333-4333-8333-333333333333';
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table profiles(id uuid primary key,role text,status text,full_name text,email text);
 create table integration_keys(id uuid primary key,name text,secret_hash text,prefix text,scopes text[],created_by uuid,expires_at timestamptz,revoked_at timestamptz);
 create table owner_voice_sessions(id uuid,key_id uuid);
 create table integration_operations(key_id uuid,request_key text,body_hash text,operation text,state text default 'pending',response jsonb);
 create table assignment_blocks(id uuid primary key,assigned_to uuid,assigned_to_name text,assigned_to_email text,claimed_by uuid,claimed_by_name text,claimed_by_email text,preferred_contractor_ids uuid[],preferred_contractor_names text[],visibility text,pay_amount numeric,status text,updated_at timestamptz,paid_at timestamptz,paid_out boolean,payment_status text,pay_status text,payout_status text,quickbooks_payment_status text,metadata jsonb,completion_notes text);
 create table contractor_payouts(assignment_id uuid);create table global_payout_requests(assignment_id uuid);
 insert into profiles values('${admin}','admin','active','Owner','owner@test'),('${contractor}','contractor','active','Cleaner','cleaner@test');
 insert into assignment_blocks(id,assigned_to,claimed_by,pay_amount,status,updated_at,metadata,completion_notes) values('${job}','${admin}','${admin}',100,'in_progress','2026-01-01','{"checklist":{"done":true}}','Retain notes');`);
 // The accept function references the production row type lazily; assignment and policy tests do not call it.
 await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261117010000_voice_admin_controls.sql'),'utf8'));
 const change=async(expected,patch)=>(await db.query('select integration_assignment_change($1,$2,$3,$4,$5) value',[admin,job,expected,JSON.stringify(patch),'Owner requested'])).rows[0].value;
 const assigned=await change('2026-01-01',{contractor_id:contractor});assert.equal(assigned.claimed_by,contractor);
 await assert.rejects(()=>change('2026-01-01',{pay_amount:150}),/conflict/);
 const paid=await change(assigned.updated_at,{pay_amount:150.25});assert.equal(paid.pay_amount,150.25);
 const saved=(await db.query('select * from assignment_blocks')).rows[0];assert.equal(saved.completion_notes,'Retain notes');assert.equal(saved.metadata.checklist.done,true);assert.equal(saved.status,'in_progress');
 await db.query('insert into contractor_payouts values($1)',[job]);await assert.rejects(()=>change(paid.updated_at,{pay_amount:160}),/payout/);
 await db.query('insert into integration_keys(id,created_by,deny_record_deletion) values($1,$2,true)',[contractor,admin]);
 await assert.rejects(()=>db.query("select integration_action_claim($1,'request123','hash','applicants.delete')",[contractor]),/record_deletion_denied/);
 assert.equal((await db.query("select integration_action_claim($1,'request124','hash','assignments.set_pay') value",[contractor])).rows[0].value.replayed,false);
 }finally{await db.close();}
});
