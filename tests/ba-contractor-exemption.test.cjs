const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto'),{PGlite}=require('@electric-sql/pglite');
const A=require('../lib/ambassadors.cjs');
const done={completed:8,total:8,complete:true},none={completed:0,total:8,complete:false};

test('standard ambassadors still need onboarding, training and the current agreement',()=>{
 const m={enabled:true,onboarding_completed_at:null};
 assert.deepEqual(A.readiness(m,none,false,false),{referrals_ready:false,referral_access:{basis:null,training_optional:false,agreement_optional:false,onboarding_optional:false}});
 assert.equal(A.readiness({enabled:true,onboarding_completed_at:'2026-11-01'},done,true,false).referral_access.basis,'standard');
 assert.equal(A.readiness({enabled:true,onboarding_completed_at:'2026-11-01'},done,false,false).referrals_ready,false);
});
test('approved contractors with the ambassador role share immediately; disabled members never do',()=>{
 const r=A.readiness({enabled:true,onboarding_completed_at:null},none,false,true);
 assert.equal(r.referrals_ready,true);assert.equal(r.referral_access.basis,'approved_contractor');assert.equal(r.referral_access.training_optional,true);
 assert.equal(A.readiness({enabled:false,onboarding_completed_at:'x'},done,true,true).referrals_ready,false);
});
test('qualification requires active status, approval and both roles',()=>{
 const ok={status:'active',contractor_approved:true},roles=['contractor','brand_ambassador'];
 assert.equal(A.qualifiesAsContractor({enabled:true},ok,roles),true);
 assert.equal(A.qualifiesAsContractor({enabled:false},ok,roles),false);
 for(const status of ['inactive','disabled','suspended','rejected','pending'])assert.equal(A.qualifiesAsContractor({enabled:true},{...ok,status},roles),false);
 assert.equal(A.qualifiesAsContractor({enabled:true},{...ok,contractor_approved:false},roles),false);
 assert.equal(A.qualifiesAsContractor({enabled:true},{...ok,contractor_approved:null},roles),false);
 assert.equal(A.qualifiesAsContractor({enabled:true},ok,['brand_ambassador']),false);
 assert.equal(A.qualifiesAsContractor({enabled:true},ok,['contractor']),false);
 assert.equal(A.qualifiesAsContractor({enabled:true},null,roles),false);
});

test('migration: audited idempotent grant, pause on lost approval, register_ba_lead gate, backfill',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth; create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);create schema turnly_private;
 create function auth.uid() returns uuid language sql as 'select null::uuid';
 create function public.current_profile_is_admin() returns boolean language sql as 'select false';
 create table profiles(id uuid primary key,status text,contractor_approved boolean);
 create table app_user_access(user_id uuid primary key references profiles(id),roles text[] not null,updated_by uuid,updated_at timestamptz default now());
 create table ba_members(user_id uuid primary key references profiles(id),name text,email text,code text unique,enabled boolean not null default true,onboarding_completed_at timestamptz,session_id text,must_change_password boolean default false);
 create table ba_leads(id uuid primary key default gen_random_uuid(),member_id uuid references ba_members(user_id),name text,email text,phone text,consent_version text,created_at timestamptz default now());
 create table ba_events(id bigint generated always as identity primary key,lead_id uuid,event text);`);
 const pre=randomUUID(),c=randomUUID(),s=randomUUID();
 await db.query("insert into profiles values($1,'active',true),($2,'active',true),($3,'active',false)",[pre,c,s]);
 await db.query("insert into app_user_access(user_id,roles) values($1,'{contractor,brand_ambassador}'),($2,'{contractor}'),($3,'{brand_ambassador}')",[pre,c,s]);
 await db.query("insert into ba_members(user_id,name,email,code) values($1,'Pre','p@x.com','BA-PPPPPPPPPPPPPPPP'),($2,'C','c@x.com','BA-CCCCCCCCCCCCCCCC'),($3,'S','s@x.com','BA-SSSSSSSSSSSSSSSS')",[pre,c,s]);
 const sql=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261113124042_app_portal_consistency.sql'),'utf8');
 await db.exec(sql);
 const audit=async id=>(await db.query('select event,source from ba_exemption_audit where user_id=$1 order by id',[id])).rows;
 assert.deepEqual(await audit(pre),[{event:'granted',source:'backfill_20261106'}]);
 assert.deepEqual(await audit(c),[]);assert.deepEqual(await audit(s),[]);
 await db.exec(sql); // re-running is idempotent
 assert.equal((await audit(pre)).length,1);
 // No fabricated onboarding: exemption never sets completion.
 assert.equal((await db.query('select onboarding_completed_at from ba_members where user_id=$1',[pre])).rows[0].onboarding_completed_at,null);
 // Leads: exempt contractor works, standard un-onboarded ambassador does not.
 await db.query("select register_ba_lead('BA-PPPPPPPPPPPPPPPP','Customer','cust@x.com','+19195550101','yes')");
 await assert.rejects(db.query("select register_ba_lead('BA-SSSSSSSSSSSSSSSS','Other','o@x.com','+19195550102','yes')"),/inactive/);
 // Admin adds the ambassador role to an approved contractor: granted via trigger.
 await db.query("update app_user_access set roles='{contractor,brand_ambassador}' where user_id=$1",[c]);
 assert.deepEqual((await audit(c)).map(r=>r.event),['granted']);
 // Approval lost: paused once, link blocked, history kept.
 await db.query("update profiles set contractor_approved=false where id=$1",[pre]);
 await db.query("update profiles set contractor_approved=false where id=$1",[pre]);
 assert.deepEqual((await audit(pre)).map(r=>r.event),['granted','paused']);
 await assert.rejects(db.query("select register_ba_lead('BA-PPPPPPPPPPPPPPPP','New','n@x.com','+19195550103','yes')"),/inactive/);
 assert.equal((await db.query('select count(*)::int n from ba_leads where member_id=$1',[pre])).rows[0].n,1);
 await db.query("update profiles set contractor_approved=true where id=$1",[pre]);
 assert.deepEqual((await audit(pre)).map(r=>r.event),['granted','paused','restored']);
 // Disabled membership and suspended profile block even exempt contractors.
 await db.query("update ba_members set enabled=false where user_id=$1",[c]);
 await assert.rejects(db.query("select register_ba_lead('BA-CCCCCCCCCCCCCCCC','D','d@x.com','+19195550104','yes')"),/inactive/);
 await db.query("update profiles set status='suspended' where id=$1",[pre]);
 await assert.rejects(db.query("select register_ba_lead('BA-PPPPPPPPPPPPPPPP','E','e@x.com','+19195550105','yes')"),/inactive/);
 // Standard onboarding keeps a paused contractor's link working.
 await db.query("update profiles set status='active',contractor_approved=false where id=$1",[pre]);
 await db.query("update ba_members set onboarding_completed_at=now() where user_id=$1",[pre]);
 await db.query("select register_ba_lead('BA-PPPPPPPPPPPPPPPP','F','f@x.com','+19195550106','yes')");
 // App bridge does not replace the portal session, rejects foreign/expired sessions,
 // and survives a separate portal login while respecting reset/disable/logout.
 const sid=randomUUID(),foreign=randomUUID(),expired=randomUUID();
 await db.query('insert into auth.sessions values($1,$2,null),($3,$4,null),($5,$2,now()-interval \'1 minute\')',[sid,pre,foreign,c,expired]);
 await db.query("update ba_members set session_id='portal-session' where user_id=$1",[pre]);
 const session=async(s,register=false)=>(await db.query('select ba_app_session($1,$2,$3) ok',[pre,s,register])).rows[0].ok;
 assert.equal(await session(sid),false);assert.equal(await session(sid,true),true);assert.equal(await session(sid,true),true);
 assert.equal(await session(foreign,true),false);assert.equal(await session(expired,true),false);
 assert.equal((await db.query('select session_id from ba_members where user_id=$1',[pre])).rows[0].session_id,'portal-session');
 await db.query("update ba_members set session_id='another-portal-session' where user_id=$1",[pre]);
 assert.equal(await session(sid),true);
 await db.query('update ba_members set enabled=false where user_id=$1',[pre]);
 assert.equal(await session(sid,true),false);
 await db.query('update ba_members set enabled=true where user_id=$1',[pre]);
 assert.equal(await session(sid),false);assert.equal(await session(sid,true),true);
 await db.query('update ba_members set must_change_password=true where user_id=$1',[pre]);
 assert.equal(await session(sid),false);
 await db.query('update ba_members set must_change_password=false where user_id=$1',[pre]);
 assert.equal(await session(sid,true),true);
 await db.query('delete from auth.sessions where id=$1',[sid]);
 assert.equal(await session(sid),false);assert.equal(await session(sid,true),false);
 const permissions=(await db.query("select has_function_privilege('anon','public.ba_app_session(uuid,uuid,boolean)','execute') anon,has_function_privilege('authenticated','public.ba_app_session(uuid,uuid,boolean)','execute') authenticated,has_function_privilege('service_role','public.ba_app_session(uuid,uuid,boolean)','execute') service")).rows[0];
 assert.deepEqual(permissions,{anon:false,authenticated:false,service:true});
 // Completed onboarding must not keep links alive after the ambassador role is removed.
 await db.query("delete from app_user_access where user_id=$1",[pre]);
 await assert.rejects(db.query("select register_ba_lead('BA-PPPPPPPPPPPPPPPP','G','g@x.com','+19195550107','yes')"),/inactive/);
 }finally{await db.close();}
});
