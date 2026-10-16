const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const uid=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
test('residential separation preserves legacy notes and assignments are atomic, authorized and audited',async()=>{
 const db=new PGlite();
 try {
 await db.exec(`create schema auth; create role anon; create role authenticated;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table profiles(id uuid primary key,full_name text,email text,role text,status text);
 create table sales_leads(id uuid primary key,lead_source text,default_service_type text,lead_notes text,sales_owner_id uuid,sales_owner_name text,last_activity_at timestamptz,property_name text,name text,contact_name text,contact_email text,contact_phone text,address text,sales_city text,default_scope text,next_step text,created_at timestamptz);
 create table residential_inquiries(id uuid primary key,payload jsonb,created_at timestamptz default now());
 create table sales_activities(id bigint generated always as identity,lead_id uuid,user_id uuid,user_name text,activity_type text,activity_text text,metadata jsonb);
 insert into profiles values('${uid(1)}','Admin','admin@example.test','admin','active'),('${uid(2)}','A','a@example.test','sales_team','active'),('${uid(3)}','B','b@example.test','sales','active'),('${uid(4)}','Disabled','x@example.test','sales','disabled');
 insert into sales_leads(id,lead_source,default_service_type,lead_notes) values('${uid(10)}','','','commercial notes stay'),('${uid(11)}','residential_website_contact_form','Residential cleaning','residential notes stay');`);
 const migration=fs.readdirSync('supabase/migrations').filter(n=>n.endsWith('_residential_crm_operators.sql')).map(n=>'supabase/migrations/'+n).at(-1);
 await db.exec(fs.readFileSync(migration,'utf8'));
 assert.deepEqual((await db.query('select business_segment,lead_notes from sales_leads order by id')).rows,[{business_segment:'commercial',lead_notes:'commercial notes stay'},{business_segment:'residential',lead_notes:'residential notes stay'}]);
 for(let n=12;n<16;n++)await db.query('insert into sales_leads(id,lead_source,lead_notes) values($1,$2,$3)',[uid(n),'residential_website_contact_form','note '+n]);
 const resIds=[11,12,13,14,15].map(uid),reps=[uid(2),uid(3)];
 const assign=(ids,ops,only=true)=>db.query('select assign_residential_leads($1::uuid[],$2::uuid[],$3) as count',[ids,ops,only]);
 await assert.rejects(assign(resIds,reps),/Only active administrators/);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid(2)]);
 await assert.rejects(assign(resIds,reps),/Only active administrators/);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid(1)]);
 await assert.rejects(assign([uid(10),uid(11)],reps),/non-residential/);
 await assert.rejects(assign(resIds,[uid(4)]),/active sales-team/);
 await assert.rejects(assign(resIds,[uid(2),uid(2)]),/distinct active operator/);
 assert.equal((await db.query('select count(*)::int as count from sales_activities')).rows[0].count,0);
 assert.equal((await assign(resIds,reps)).rows[0].count,5);
 assert.deepEqual((await db.query('select sales_owner_id,count(*)::int as count from sales_leads where business_segment=\'residential\' group by sales_owner_id order by sales_owner_id')).rows,[{sales_owner_id:uid(2),count:3},{sales_owner_id:uid(3),count:2}]);
 assert.equal((await assign(resIds,reps)).rows[0].count,0);
 assert.equal((await assign(resIds,[uid(3)],false)).rows[0].count,3);
 assert.equal((await db.query('select count(*)::int as count from sales_activities')).rows[0].count,8);
 assert.equal((await db.query('select lead_notes from sales_leads where id=$1',[uid(10)])).rows[0].lead_notes,'commercial notes stay');
 // Force the audit write to fail and prove ownership changes roll back with it.
 await db.exec("alter table sales_activities add constraint test_failure check(activity_text <> 'Assigned to A.') not valid;");
 await assert.rejects(assign(resIds,[uid(2)],false),/test_failure/);
 assert.equal((await db.query('select count(*)::int as count from sales_leads where sales_owner_id=$1',[uid(3)])).rows[0].count,5);
 assert.equal((await db.query("select prosecdef from pg_proc where proname='assign_residential_leads'")).rows[0].prosecdef,false);
 await db.query('insert into residential_inquiries(id,payload) values($1,$2)',[uid(30),{lead_source:'residential_website_contact_form',contact_name:'Homeowner',lead_notes:'Keep inquiry notes'}]);
 assert.equal((await db.query('select business_segment,lead_notes from sales_leads where id=$1',[uid(30)])).rows[0].lead_notes,'Keep inquiry notes');
 await db.query('insert into residential_inquiries(id,payload) values($1,$2)',[uid(31),{source:'customer_portal',lead_notes:'Private support message'}]);
 assert.equal((await db.query('select id from sales_leads where id=$1',[uid(31)])).rows.length,0);
 } finally {await db.close();}
});
