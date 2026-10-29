const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const {personal,confirm}=require('../lib/imported-contractor-email.cjs');
test('email confirmation rejects relay, unverified, pending and mismatched identities',async()=>{
 assert.equal(personal('person@indeedemail.com'),false);assert.equal(personal('person@gmail.com'),true);
 for(const user of [{id:'other',email:'a@gmail.com',email_confirmed_at:'now'},{id:'me',email:'a@indeedemail.com',email_confirmed_at:'now'},{id:'me',email:'a@gmail.com'},{id:'me',email:'a@gmail.com',email_confirmed_at:'now',new_email:'pending@gmail.com'}]){
  let called=false;await assert.rejects(confirm({auth:{getUser:async()=>({data:{user}})},rpc:async()=>{called=true}},'me','token'));assert.equal(called,false);
 }
});
test('verified email sync preserves account identity, original email and private permissions',async()=>{
 const db=new PGlite(),id='00000000-0000-4000-8000-000000000001';try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid,email text,email_confirmed_at timestamptz,email_change text);create table profiles(id uuid,email text,role text);create table recruiting_applications(hired_user_id uuid,role text,email text,answers jsonb,updated_at timestamptz,version int);insert into auth.users values('${id}','personal@example.com',now(),'');insert into profiles values('${id}','relay@indeedemail.com','contractor');insert into recruiting_applications values('${id}','cleaner','relay@indeedemail.com','{"needs_personal_email":true,"original_import_email":"relay@indeedemail.com"}',now(),1);`);
 await db.exec(fs.readFileSync('supabase/migrations/20261029160003_imported_contractor_personal_email.sql','utf8'));
 await db.query('select confirm_imported_contractor_email($1)',[id]);
 const a=(await db.query('select * from recruiting_applications')).rows[0];assert.equal(a.email,'personal@example.com');assert.equal(a.answers.original_import_email,'relay@indeedemail.com');assert.equal(a.answers.needs_personal_email,false);assert.equal(a.hired_user_id,id);
 await db.exec('set role authenticated');await assert.rejects(db.query('select confirm_imported_contractor_email($1)',[id]),/permission denied/);
 }finally{await db.close();}
});
