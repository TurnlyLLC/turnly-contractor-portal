const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {PGlite}=require('@electric-sql/pglite');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('hire reservation is exclusive, encrypted data is private, deletion preserves history and blocks hiring',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create table profiles(id uuid primary key);`);
 await db.exec(fs.readFileSync('supabase/migrations/20261019162553_applicant_intake.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261028164524_applicant_hiring.sql','utf8'));
 await db.exec(`insert into auth.users values('${id(1)}');insert into profiles values('${id(2)}');insert into recruiting_applications(id,role,name,email,phone,city,state,service_city,answers,consent_version,payload_hash) values('${id(3)}','cleaner','Test','test@example.test','9195550100','Durham','NC','Durham','{}','v1','hash'),('${id(4)}','cleaner','Delete','delete@example.test','9195550100','Durham','NC','Durham','{}','v1','hash');`);
 const reserve=()=>db.query('select * from reserve_applicant_hire($1,$2,$3,false)',[id(3),id(2),'encrypted']);
 assert.equal((await reserve()).rows[0].attempts,1);await assert.rejects(reserve(),/already processing/);
 await assert.rejects(db.query('select delete_applicant($1,$2)',[id(3),id(1)]),/hiring record/);
 await db.exec('update recruiting_hires set processing_at=null');assert.equal((await reserve()).rows[0].attempts,2);
 await db.query('select delete_applicant($1,$2)',[id(4),id(1)]);assert.ok((await db.query('select deleted_at from recruiting_applications where id=$1',[id(4)])).rows[0].deleted_at);
 await assert.rejects(db.query('select reserve_applicant_hire($1,$2,$3,false)',[id(4),id(2),'secret']),/unavailable/);
 await db.exec('set role authenticated');await assert.rejects(db.query('select * from recruiting_hires'),/permission denied/);await assert.rejects(reserve(),/permission denied/);
 }finally{await db.close();}
});
function fixture(role='cleaner',existing=false){
 const a={id:id(3),name:'Test Person',email:'test@example.test',role,service_city:'Durham',answers:{service_cities:['Durham','Raleigh'],services:['residential']},version:1};
 const tables={recruiting_applications:[a],recruiting_hires:[],profiles:existing?[{id:id(2),email:a.email,role:role==='cleaner'?'contractor':'brand_ambassador',status:'active'}]:[],ba_members:[]};
 let user=existing?{id:id(2),email:a.email}:null,creates=0,mails=0,failMail=false;
 const db={from(table){let filters=[],op='select',values;const q={select(){return q},eq(k,v){filters.push(r=>r[k]===v);return q},is(k,v){filters.push(r=>v===null?r[k]==null:r[k]===v);return q},update(v){op='update';values=v;return q},upsert(v){op='upsert';values=v;return q},single(){return q.then(x=>({...x,data:x.data[0]}))},maybeSingle(){return q.then(x=>({...x,data:x.data[0]||null}))},then(resolve){let rows=tables[table].filter(r=>filters.every(f=>f(r)));if(op==='update')rows.forEach(r=>Object.assign(r,values));if(op==='upsert'){let r=tables[table].find(r=>(r.id||r.user_id)===(values.id||values.user_id));if(r)Object.assign(r,values);else tables[table].push({...values});}return Promise.resolve(resolve({data:rows.map(r=>({...r}))}));}};return q},async rpc(_n,v){let j=tables.recruiting_hires[0];if(!j){j={application_id:v.p_id,user_id:v.p_user,encrypted_payload:v.p_payload,existing_account:v.p_existing,attempts:0,created_at:new Date().toISOString()};tables.recruiting_hires.push(j)}j.attempts++;return{data:{...j}}},auth:{admin:{async getUserById(){return{data:{user}}},async createUser(v){creates++;user={id:v.id,email:v.email};assert.ok(v.app_metadata.turnly_force_password_change);return{data:{user}}}}}};
 const context={module:{exports:{}},require:p=>p.startsWith('./')?require('../lib/'+p.slice(2)):require(p),process:{env:{RESEND_API_KEY:'fixture',REFERRAL_FROM_EMAIL:'test@example.test',CONTRACTOR_DRAFT_KEY:'test-secret'}},Date,AbortSignal,fetch:async()=>{mails++;return{ok:!failMail,json:async()=>failMail?{}:{id:'provider-receipt'}}}};
 vm.runInNewContext(fs.readFileSync('lib/applicant-hiring.cjs','utf8'),context);
 return{run:()=>context.module.exports.hire(db,id(1),id(3)),tables,creates:()=>creates,mails:()=>mails,fail:v=>failMail=v};
}
for(const role of ['cleaner','brand_ambassador'])test(role+' hiring creates account once and preserves onboarding gate',async()=>{const f=fixture(role);assert.equal((await f.run()).email_sent,true);await f.run();assert.equal(f.creates(),1);assert.equal(f.mails(),1);assert.equal(f.tables.profiles[0].contractor_approved,false);assert.equal(f.tables.recruiting_applications[0].status,'hired');assert.equal(f.tables.recruiting_hires[0].encrypted_payload,null);if(role==='brand_ambassador')assert.equal(f.tables.ba_members[0].must_change_password,true);});
test('mail failure can retry without recreating account or resetting onboarding',async()=>{const f=fixture();f.fail(true);await assert.rejects(f.run(),/welcome email/);f.tables.profiles[0].contractor_approved=true;f.fail(false);await f.run();assert.equal(f.creates(),1);assert.equal(f.tables.profiles[0].contractor_approved,true);});
test('existing account password is untouched',async()=>{const f=fixture('cleaner',true);assert.equal((await f.run()).existing_account,true);assert.equal(f.creates(),0);});
test('welcome emails have correct destination and app links only for cleaners',()=>{const {welcome}=require('../lib/applicant-hiring.cjs');const a={name:'Test',email:'test@example.test'};const c=welcome({...a,role:'cleaner'},'temporary');assert.match(c.text,/id6818176573/);assert.match(c.text,/com.rork.turnlyproandroid/);assert.match(c.text,/Temporary password/);const b=welcome({...a,role:'brand_ambassador'},null);assert.match(b.text,/ba.turnlypros.com/);assert.doesNotMatch(b.text,/apps.apple.com|Temporary password/);});
