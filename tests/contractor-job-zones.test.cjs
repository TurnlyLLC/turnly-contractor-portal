const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{randomUUID}=require('node:crypto'),{PGlite}=require('@electric-sql/pglite');
const Z=require('../lib/contractor-job-zones.cjs');
async function fixture(){const db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema turnly_private;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.uid',true),'')::uuid$$;
create function public.current_profile_is_admin() returns boolean language sql stable as $$select false$$;
create table profiles(id uuid primary key,role text,status text,contractor_approved boolean,market text,region text,allowed_regions text[] default '{}',allowed_property_ids uuid[] default '{}',allowed_property_names text[] default '{}');
create table assignment_blocks(id uuid primary key,property_name text,address text,property_id uuid,portal_property_id uuid,recurring_property_id uuid,recurring_portal_property_id uuid,site_latitude float8,site_longitude float8,metadata jsonb default '{}',status text default 'open',visibility text default 'open',claimed_by uuid,assigned_to uuid,preferred_contractor_ids uuid[],declined_contractor_ids uuid[],start_window timestamptz default now());
create table referral_bookings(id uuid primary key,property_address text,city text,state text,zip text);
create table portal_properties(id uuid primary key,address text,city text,state text);
create table map_geocodes(address_key text primary key,latitude float8,longitude float8,result text);
grant usage on schema public,auth to authenticated,service_role;grant select on all tables in schema public to authenticated,service_role;`);
await db.exec(fs.readFileSync('supabase/migrations/20261029175710_contractor_job_zones.sql','utf8'));return db;}
test('same exact zones protect both boards; multi-zone, no-zone, geography, property limits and own work',async()=>{
 const db=await fixture();try{
 const person=randomUUID(),blank=randomUUID();await db.query("insert into profiles(id,role,status,contractor_approved,allowed_regions) values($1,'contractor','active',true,array['Durham']),($2,'contractor','active',true,'{}')",[person,blank]);
 const jobs={};for(const [key,address,meta,lat,lon] of [['durhamHome','1 Main St, Durham NC 27701',{source:'residential_booking'},null,null],['durhamWork','2 Main St, Durham NC 27701',{},null,null],['raleighHome','3 Main St, Raleigh NC 27601',{source:'residential_booking'},null,null],['raleighWork','4 Main St, Raleigh NC 27601',{},null,null],['virginia','1 Durham Rd, Reston VA 20190',{},null,null],['outside','5 Main St, Durham NC 27701',{},40,-80],['nearDurham','6 Main St, Hillsborough NC 27278',{},36.02,-79.03],['unknown','Somewhere',{},null,null]]){const id=randomUUID();jobs[key]=id;await db.query('insert into assignment_blocks(id,address,metadata,site_latitude,site_longitude) values($1,$2,$3,$4,$5)',[id,address,JSON.stringify(meta),lat,lon]);}
 const board=async(id=person)=>(await db.query('select contractor_job_board($1) rows',[id])).rows[0].rows;
 let rows=await board();assert.deepEqual(rows.map(r=>r.id).sort(),[jobs.durhamHome,jobs.durhamWork,jobs.nearDurham].sort());assert.equal(rows.find(r=>r.id===jobs.durhamHome).contractor_job_category,'residential');assert.equal(rows.find(r=>r.id===jobs.durhamWork).contractor_job_category,'commercial');assert.equal((await board(blank)).length,0);
 await db.query("update profiles set allowed_regions=array['Durham','Raleigh'] where id=$1",[person]);assert.equal((await board()).length,5);
 await db.query("update profiles set allowed_regions=array['NC:Durham'],allowed_property_names=array['Raleigh Tower'] where id=$1",[person]);await db.query("update assignment_blocks set property_name='Raleigh Tower',preferred_contractor_ids=array[$1::uuid] where id=$2",[person,jobs.raleighWork]);assert.equal((await board()).length,0,'property and preferred access cannot bypass zones');
 await db.query("update profiles set allowed_property_names='{}',allowed_regions='{}',market='Durham' where id=$1",[person]);assert.equal((await board()).length,3,'legacy exact market remains available');
 await db.query("update profiles set allowed_regions=array['NC'] where id=$1",[person]);assert.equal((await board()).length,0,'state wildcard does not grant every city');
 await db.query("update profiles set allowed_regions=array['Durham'] where id=$1",[person]);
 await db.exec(`alter table assignment_blocks enable row level security;create policy contractor_board on assignment_blocks for select to authenticated using(claimed_by=auth.uid() or (status='open' and contractor_assignment_matches_scope(assignment_blocks,auth.uid())));`);
 await db.query("update assignment_blocks set claimed_by=$1,status='claimed' where id=$2",[person,jobs.raleighWork]);
 await db.query("select set_config('request.uid',$1,false)",[person]);await db.exec('set role authenticated');
 const visible=(await db.query('select id from assignment_blocks')).rows.map(r=>r.id);assert.ok(visible.includes(jobs.raleighWork),'previously claimed job stays visible');assert.ok(!visible.includes(jobs.raleighHome),'other-zone open job stays private');
 await assert.rejects(db.query('select contractor_job_board($1)',[person]),/permission denied/);await db.exec('reset role;set role anon');await assert.rejects(db.query('select contractor_assignment_matches_scope(j,$1) from assignment_blocks j',[person]),/permission denied/);
 }finally{await db.close();}
});
test('preference saves are scoped to the signed-in contractor and validated against available zones',async()=>{
 const p={id:'self',role:'contractor',status:'active',allowed_regions:['Durham']};let saved;
 const db={from(){const q={select(){return q},eq(key,id){assert.equal(id,'self');return q},maybeSingle:async()=>({data:p}),update(v){saved=v;return q},then(fn){return Promise.resolve({data:null}).then(fn)}};return q;},rpc:async(name,args)=>{assert.equal(name,'contractor_job_board');assert.equal(args.p_actor,'self');return{data:[]};}};
 assert.deepEqual((await Z.run(db,'self',{action:'board'})).selected,['NC:Durham']);
 const r=await Z.run(db,'self',{zones:['NC:Durham','NC:Raleigh','NC:Raleigh'],id:'another'});assert.deepEqual(saved,{allowed_regions:['Durham','Raleigh']});assert.deepEqual(r.selected,['NC:Durham','NC:Raleigh']);
 for(const zones of [[],['NC'],['VA:Reston'],'Durham'])await assert.rejects(Z.run(db,'self',{zones}),/Select one/);
 p.role='property_manager';await assert.rejects(Z.run(db,'self',{zones:['NC:Durham']}),/contractor account/);
});
