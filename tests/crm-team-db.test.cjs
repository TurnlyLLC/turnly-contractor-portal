const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
test('CRM access gates enforce temporary passwords, revoked sessions and inactive users at database level',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
 create table auth.users(id uuid primary key,raw_user_meta_data jsonb,raw_app_meta_data jsonb);
 create table auth.sessions(id uuid primary key,user_id uuid,created_at timestamptz);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('session_id',current_setting('test.session',true))$$;
 create table profiles(id uuid primary key,role text,status text,full_name text);
 create table sales_leads(id int primary key);
 create table sales_tasks(id int);create table sales_activities(id int);create table sales_quotes(id int);create table sales_contracts(id int);create table sales_walkthroughs(id int);
 alter table sales_leads enable row level security;create policy old_permissive on sales_leads to authenticated using(true) with check(true);
 grant usage on schema public,auth to authenticated;grant select,update,insert on profiles,sales_leads to authenticated;
 insert into profiles values('00000000-0000-4000-8000-000000000001','sales_team','active','Sam'),('00000000-0000-4000-8000-000000000002','admin','active','Admin');
 insert into sales_leads values(1);
 insert into auth.sessions values('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000001',now()+interval '1 second');
 select set_config('test.uid','00000000-0000-4000-8000-000000000001',false),set_config('test.session','00000000-0000-4000-8000-000000000010',false);`);
 const path=fs.readdirSync('supabase/migrations').find(n=>n.endsWith('_crm_team_access.sql'));
 await db.exec(fs.readFileSync(path?'supabase/migrations/'+path:'../crm-team-access.sql','utf8').replace(/^\uFEFF/,''));
 await db.exec(fs.readFileSync('supabase/migrations/20261016184213_crm_access_performance.sql','utf8').replace(/^\uFEFF/,''));
 await db.exec(`insert into crm_user_access(user_id,username)values('00000000-0000-4000-8000-000000000001','sam');set role authenticated;`);
 assert.equal((await db.query('select * from sales_leads')).rows.length,0);
 await assert.rejects(db.query("update profiles set role='admin' where id=auth.uid()"),/administrator/);
 await assert.rejects(db.query("update crm_user_access set must_change_password=false"),/permission denied/);
 await db.exec('reset role;update crm_user_access set must_change_password=false;set role authenticated;');
 assert.equal((await db.query('select * from sales_leads')).rows.length,1);
 await db.exec("reset role;update crm_user_access set valid_after=now()+interval '1 hour';set role authenticated;");
 assert.equal((await db.query('select * from sales_leads')).rows.length,0);
 await db.exec("reset role;update crm_user_access set valid_after='1970-01-01',enabled=false;set role authenticated;");
 assert.equal((await db.query('select * from sales_leads')).rows.length,0);
 await assert.rejects(db.query("update profiles set status='active',role='admin' where id=auth.uid()"),/administrator/);
 await db.exec("reset role;insert into auth.users values(gen_random_uuid(),'{\"role\":\"admin\"}','{}');");
 assert.equal((await db.query('select raw_user_meta_data->>\'role\' role from auth.users')).rows[0].role,'contractor');
 for(let i=0;i<3;i++)assert.equal((await db.query("select crm_allow_login('a',2) ok")).rows[0].ok,i<2);
 }finally{await db.close();}
});
