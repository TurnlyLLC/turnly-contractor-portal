const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{randomUUID}=require('node:crypto');
const B=require('../lib/integration-background.cjs'),M=require('../api/turnly-mcp.js');
test('approval requires its own permission but no second review attestation',async()=>{
 assert(!M.definitions(['documents:upload','documents:read']).some(t=>t.name==='turnly_background_checks_approve'));
 assert(M.definitions(['platform:full']).some(t=>t.name==='turnly_background_checks_approve'));
 const input={document_id:randomUUID(),expected_updated_at:'2026-11-16T12:00:00Z',background_version:0,expected_submission_id:null,reference:'V1234567'};
 const db={rpc:async(name,args)=>{assert.equal(args.p_approve,true);assert(!Object.hasOwn(args,'p_reviewed'));return {data:{approved:true}};}};
 assert.equal((await B.run(db,randomUUID(),'approve',input)).approved,true);
 assert.equal((await B.run(db,randomUUID(),'approve',{...input,reviewed_and_approved:false})).approved,true);
});
test('transactional approval synchronizes the actual checklist schema and rolls back partial failures',async()=>{
 const {PGlite}=require('@electric-sql/pglite'),db=new PGlite(),actor=randomUUID(),owner=randomUUID(),key=randomUUID(),doc=randomUUID();
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema turnly_private;create schema storage;create schema turnly_backend;
 create table profiles(id uuid primary key,role text,status text,contractor_approved boolean,background_check_status text,background_check_completed_at timestamptz);
 create table assignment_blocks(id uuid primary key,status text,claimed_by uuid,assigned_to uuid);
 create table integration_keys(id uuid primary key,created_by uuid,scopes text[],expires_at timestamptz,revoked_at timestamptz);
 create table contractor_documents(id uuid primary key,profile_id uuid,title text,document_type text,status text,storage_bucket text,storage_path text,expiration_date date,updated_at timestamptz default now(),reviewed_by uuid,reviewed_at timestamptz,review_notes text);
 create table admin_audit_log(actor_id uuid,action text,entity text,entity_id text,before_value jsonb,after_value jsonb,source text);
 create table storage.objects(bucket_id text,name text);
 create table turnly_backend.items(id text primary key,kind text,title text,required integer,active integer,deleted integer,version integer);
 create table turnly_backend.submissions(id text primary key,user_id text,item_id text,item_title text,kind text,version integer,status text,fields_json text,source text,reviewer_note text,reviewed_by text,reviewed_at bigint,created_at bigint);
 grant all on all tables in schema public to service_role;grant usage on schema storage to service_role;grant select on storage.objects to service_role;`);
 await db.exec(fs.readFileSync('supabase/migrations/20261028192235_contractor_background_tracking.sql','utf8'));
 let review=fs.readFileSync('supabase/migrations/20261012120543_contractor_review_center.sql','utf8');await db.exec(review.slice(review.indexOf('create or replace function public.review_contractor_document(')));
 await db.exec(fs.readFileSync('docs/integration-background-schema.sql','utf8'));
 await db.query("insert into profiles(id,role,status,contractor_approved) values($1,'admin','active',false),($2,'contractor','active',true)",[actor,owner]);
 await db.query("insert into integration_keys(id,created_by,scopes) values($1,$2,array['platform:full'])",[key,actor]);
 await db.query("insert into contractor_documents(id,profile_id,title,document_type,status,storage_bucket,storage_path) values($1,$2,'Background Check','background_check','uploaded','contractor-documents','report.pdf')",[doc,owner]);
 await db.exec("insert into storage.objects values('contractor-documents','report.pdf');insert into turnly_backend.items values('bg','background','Background Check',1,1,0,0)");
 const read=async()=> (await db.query('select integration_background_review($1,$2) r',[key,doc])).rows[0].r;
 const approve=(r,confirmed=true)=>db.query('select integration_background_review($1,$2,true,$3,$4,$5,$6,$7) r',[key,doc,r.document.updated_at,r.background.version,r.checklist.submission_id,'V1234567',confirmed]);
 const before=await read();
 await db.query("update integration_keys set scopes=array['documents:read','documents:upload'] where id=$1",[key]);await assert.rejects(approve(before),/authorized/);
 await db.query("update integration_keys set scopes=array['platform:full'] where id=$1",[key]);
 // Force failure after background and checklist writes, proving they roll back together.
 await db.exec("alter table admin_audit_log add constraint test_failure check(false) not valid");await assert.rejects(approve(before));
 assert.equal((await db.query('select count(*)::int n from contractor_background_checks')).rows[0].n,0);
 assert.equal((await db.query('select count(*)::int n from turnly_backend.submissions')).rows[0].n,0);
 assert.equal((await read()).document.status,'uploaded');
 await db.exec('alter table admin_audit_log drop constraint test_failure;set role service_role');
 const done=(await approve(before,false)).rows[0].r;assert.equal(done.document.status,'approved');assert.equal(done.background.sync_state,'synced');assert.equal(done.checklist.state,'done');
 assert.equal((await db.query('select contractor_approved from profiles where id=$1',[owner])).rows[0].contractor_approved,true);
 await assert.rejects(approve(before),/changed/);
 await db.exec('reset role');await db.query("update integration_keys set revoked_at=now() where id=$1",[key]);await assert.rejects(read,/authorized/);
 await db.exec('set role authenticated');await assert.rejects(read,/permission/);
 }finally{await db.close();}
});
