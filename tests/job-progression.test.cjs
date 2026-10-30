const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const root=path.resolve(__dirname,'..'),uid=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
test('travel, arrival and checklist transitions enforce ownership, GPS and completion in PostgreSQL',async()=>{
 const db=new PGlite();
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
 create function auth.uid() returns uuid language sql as $$select '${uid(1)}'::uuid$$;
 create function current_user_has_role(text[]) returns boolean language sql as $$select false$$;
 create table profiles(id uuid,role text,status text);
 insert into profiles values('${uid(1)}','contractor','active'),('${uid(2)}','contractor','active'),('${uid(3)}','contractor','inactive');
 create table assignment_blocks(id uuid primary key,status text,claimed_by uuid,assigned_to uuid,started_by uuid,completed_by uuid,claimed_at timestamptz,started_at timestamptz,completed_at timestamptz,checklist_completed_at timestamptz,updated_at timestamptz,site_latitude double precision,site_longitude double precision,start_latitude double precision,start_longitude double precision,start_location_accuracy double precision,start_distance_miles double precision,start_notes text,metadata jsonb default '{}',start_window timestamptz,recurring_due_at timestamptz,claimed_by_name text,assigned_to_name text,service_type text,title text,property_name text,visibility text,payment_status text,pay_status text,payout_status text,checklist_responses jsonb);
 create table qa_jobs(id uuid primary key,assignment_id uuid,qa_status text,service_date date,cleaner_name text,job_type text,checklist_summary text);
 create table qa_videos(assignment_id uuid,qa_job_id uuid,review_status text);
 create function ensure_assignment_qa_job(uuid) returns uuid language plpgsql as $$begin insert into qa_jobs(id) values($1) on conflict do nothing;return $1;end$$;
 create table residential_referral_links(user_id uuid,booking_id uuid);create table referral_bookings(id uuid,status text,assignment_deleted_at timestamptz,email text);
 insert into referral_bookings values('${uid(10)}','scheduled',null,'test@example.test');
 insert into assignment_blocks(id,status,claimed_by) values('${uid(10)}','claimed','${uid(1)}');`);
 await db.exec(fs.readFileSync(path.join(__dirname,'fixtures/job-progress-functions.sql'),'utf8'));
 await db.exec(fs.readFileSync(path.join(root,'supabase/migrations/20261030185810_contractor_job_progression.sql'),'utf8'));
 const get=async()=>(await db.query('select * from assignment_blocks where id=$1',[uid(10)])).rows[0];
 const advance=(action,over={})=>db.query('select * from advance_contractor_job($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[over.actor||uid(1),uid(10),action,over.lat??35,over.lon??-80,over.accuracy??10,over.at||new Date().toISOString(),35,-80,'Arrived','']);
 await assert.rejects(advance('start_job'),/Head to job/);
 await assert.rejects(advance('head_to_job',{actor:uid(2)}),/not assigned/);
 await assert.rejects(advance('head_to_job',{actor:uid(3)}),/active contractor/);
 await advance('head_to_job');assert.equal((await get()).status,'en_route');assert.ok((await get()).en_route_at);
 const travelTime=(await get()).en_route_at;await advance('head_to_job');assert.deepEqual((await get()).en_route_at,travelTime);
 await assert.rejects(db.query("select customer_portal_change($1,'test@example.test',null,'notes','{}')",[uid(10)]),/no longer editable/);
 await assert.rejects(advance('start_job',{lat:36}),/within 200 metres/);
 await assert.rejects(advance('start_job',{accuracy:101}),/precise location/);
 await assert.rejects(advance('start_job',{lat:NaN}),/precise location/);
 await assert.rejects(advance('start_job',{at:new Date(Date.now()-120000).toISOString()}),/expired/);
 assert.equal((await get()).status,'en_route');
 await advance('start_job');assert.equal((await get()).status,'in_progress');assert.equal((await get()).start_distance_miles,0);assert.equal((await get()).started_by,uid(1));
 const startTime=(await get()).started_at;await advance('start_job');assert.deepEqual((await get()).started_at,startTime);
 const submit=payload=>db.query('select submit_assignment_for_qa($1,$2)',[uid(10),JSON.stringify(payload)]);
 await assert.rejects(submit([]),/completed checklist/);
 await assert.rejects(submit([{required:true,completed:false}]),/every required/);
 await submit([{required:true,completed:true}]);assert.equal((await get()).status,'qa_pending');assert.equal((await get()).payment_status,'pending_qa');assert.ok((await get()).completed_at);
 await submit([{required:true,completed:true}]);assert.equal((await db.query('select count(*)::int as n from qa_jobs')).rows[0].n,1);
 await assert.rejects(advance('head_to_job'),/Accept this job/);
 assert.equal((await db.query("select has_function_privilege('authenticated','advance_contractor_job(uuid,uuid,text,double precision,double precision,double precision,timestamptz,double precision,double precision,text,text)','execute') as allowed")).rows[0].allowed,false);
 assert.equal((await db.query("select has_function_privilege('service_role','advance_contractor_job(uuid,uuid,text,double precision,double precision,double precision,timestamptz,double precision,double precision,text,text)','execute') as allowed")).rows[0].allowed,true);
 }finally{await db.close();}
});
test('customer timeline follows travel, cleaning and submitted checklist independently of payment',async()=>{
 const {jobStage,jobStatusLabel}=await import('../job-stage.mjs');
 for(const [status,stage,label] of [['claimed',0,'Cleaner assigned'],['en_route',1,'Cleaner en route'],['in_progress',2,'Cleaning'],['qa_pending',3,'Complete'],['completed',3,'Complete']]){
 const b={status:'scheduled',job:{status}};assert.equal(jobStage(b),stage);assert.equal(jobStatusLabel(b),label);
 }
 assert.equal(jobStage({status:'cancelled',job:{status:'en_route'}}),-1);
});
