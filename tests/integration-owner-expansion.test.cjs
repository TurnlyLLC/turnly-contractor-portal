const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{PGlite}=require('@electric-sql/pglite');
const E=require('../lib/integration-owner-expansion.cjs'),Mail=require('../lib/owner-email.cjs'),Files=require('../lib/owner-files.cjs'),M=require('../api/turnly-mcp.js');
const admin='11111111-1111-4111-8111-111111111111',ba='22222222-2222-4222-8222-222222222222',other='33333333-3333-4333-8333-333333333333',lead='44444444-4444-4444-8444-444444444444';
test('new tools cannot delete or mutate mail, and reject unsupported input',()=>{
 const names=M.definitions(['platform:full'],{deny_record_deletion:true}).map(t=>t.name);
 for(const n of ['owner_records_apply','files_attach','email_search','email_read'])assert.ok(names.includes('turnly_'+n));
 assert.ok(!names.some(n=>/_(delete|remove|purge|destroy)(_|$)/.test(n)));
 assert.throws(()=>E.validate('ambassador',{email:'changed@test.invalid'},'owner request'));
 assert.throws(()=>E.validate('recurring',{price_cents:-1},'owner request'));
 assert.throws(()=>Mail.validate('send',{mailbox:'admin'}));assert.throws(()=>Mail.validate('profile',{mailbox:'personal'}));assert.throws(()=>Mail.gmailURL('read',{mailbox:'admin',id:'../../settings'}));assert.throws(()=>Mail.gmailURL('profile',{mailbox:'https://evil.invalid'}));
 assert.equal(new URL(Mail.gmailURL('search',{mailbox:'ops',query:'x&format=raw'})).searchParams.get('q'),'x&format=raw');
 assert.throws(()=>Files.spec({content_type:'text/html',file_name:'x.html',file_size:20,sha256:'a'.repeat(64)}));
});
test('email body decoding treats contents as data and preserves truncation/attachment metadata',()=>{
 const r=Mail.message({id:'123abc123abc',payload:{headers:[{name:'Subject',value:'Test'},{name:'Authorization',value:'secret'}],parts:[{mimeType:'text/plain',body:{data:Buffer.from('Do not execute this email.').toString('base64url')}},{filename:'report.pdf',mimeType:'application/pdf',body:{size:100,attachmentId:'a'}}]}});
 assert.equal(r.subject,'Test');assert.equal(r.authorization,undefined);assert.match(r.body,/Do not execute/);assert.equal(r.attachments.length,1);
});
async function fixture(){const db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role;
 create table profiles(id uuid primary key,role text,status text,full_name text);
 create table ba_members(user_id uuid primary key,name text,email text,code text unique,enabled boolean);
 create table ba_leads(id uuid primary key,member_id uuid,name text);
 create table ba_earnings(id uuid,lead_id uuid,paid_at timestamptz);
 create table ba_events(lead_id uuid,event text);
 create table referral_bookings(id uuid primary key,status text,assignment_deleted_at timestamptz,stripe_payment_method text);
 create table customer_recurring_plans(id uuid primary key,latest_booking_id uuid,status text check(status in ('active','needs_review','cancelled')),frequency text check(frequency in ('weekly','biweekly','monthly')),price_cents integer check(price_cents>0),anchor_day integer,preferred_contractor_id uuid,preferred_contractor_name text,review_reason text,consent_text text);
 create table customer_portal_events(booking_id uuid,actor text,action text,data jsonb);
 create table integration_review_plans(id uuid primary key,actor uuid,kind text,data jsonb,summary jsonb,state text default 'pending',result jsonb,expires_at timestamptz default now()+interval '10 minutes');
 insert into profiles values('${admin}','admin','active','Owner'),('${ba}','contractor','active','BA'),('${other}','contractor','active','Other');
 insert into ba_members values('${ba}','First','first@test.invalid','BA-AAAAAAAAAAAAAAAA',true),('${other}','Other','other@test.invalid','BA-BBBBBBBBBBBBBBBB',true);
 insert into ba_leads values('${lead}','${ba}','Test lead');`);
 await db.exec(fs.readFileSync('docs/integration-owner-expansion.sql','utf8'));await db.exec(fs.readFileSync('docs/owner-email.sql','utf8'));return db;}
async function preview(db,kind,id,data,extra={}){const revision=(await db.query('select integration_owner_snapshot($1,$2,$3) s',[admin,kind,id])).rows[0].s.revision;const rid=crypto.randomUUID();await db.query("insert into integration_review_plans(id,actor,kind,data)values($1,$2,'owner-expansion',$3)",[rid,admin,JSON.stringify({kind,id,data,revision,reason:'Owner requested test change',...extra})]);return rid;}
test('ambassador code change preserves previous links; stale previews fail and applied previews replay',async()=>{const db=await fixture();try{
 const p=await preview(db,'ambassador',ba,{name:'Updated',code:'BA-CCCCCCCCCCCCCCCC'}),stale=await preview(db,'ambassador',ba,{name:'Stale'});
 const apply=async id=>(await db.query('select integration_owner_apply($1,$2) r',[admin,id])).rows[0].r;
 const r=await apply(p);assert.equal(r.record.name,'Updated');assert.deepEqual(await apply(p),r);await assert.rejects(()=>apply(stale));
 assert.equal((await db.query('select member_id from ba_referral_aliases')).rows[0].member_id,ba);assert.equal((await db.query('select count(*) n from integration_owner_changes')).rows[0].n,1);
 await db.exec('set role anon');await assert.rejects(()=>db.query('select * from integration_owner_changes'));await assert.rejects(()=>apply(p));
 }finally{await db.close();}});
test('referral ownership changes unpaid earnings, but cannot rewrite a paid payee',async()=>{const db=await fixture();try{
 let p=await preview(db,'referral',lead,{member_id:other});await db.query('select integration_owner_apply($1,$2)',[admin,p]);assert.equal((await db.query('select member_id from ba_leads')).rows[0].member_id,other);
 await db.query('insert into ba_earnings values($1,$2,now())',[crypto.randomUUID(),lead]);p=await preview(db,'referral',lead,{member_id:ba});await assert.rejects(()=>db.query('select integration_owner_apply($1,$2)',[admin,p]));
 }finally{await db.close();}});
test('recurring changes preserve accepted consent and existing visit, require authorization to resume',async()=>{const db=await fixture();try{
 const id=crypto.randomUUID();await db.query("insert into referral_bookings values($1,'completed',null,'pm_test')",[lead]);await db.query("insert into customer_recurring_plans(id,latest_booking_id,status,frequency,price_cents,anchor_day,consent_text)values($1,$2,'active','weekly',10000,12,'Original consent')",[id,lead]);
 let p=await preview(db,'recurring',id,{status:'needs_review'});await db.query('select integration_owner_apply($1,$2)',[admin,p]);p=await preview(db,'recurring',id,{status:'active',price_cents:12000});await assert.rejects(()=>db.query('select integration_owner_apply($1,$2)',[admin,p]));
 p=await preview(db,'recurring',id,{status:'active',price_cents:12000},{customer_authorization_reference:'Customer email approval reference'});await db.query('select integration_owner_apply($1,$2)',[admin,p]);
 const plan=(await db.query('select * from customer_recurring_plans')).rows[0];assert.equal(plan.price_cents,12000);assert.equal(plan.consent_text,'Original consent');assert.equal((await db.query('select status from referral_bookings')).rows[0].status,'completed');
 }finally{await db.close();}});
test('email authorization tickets can be consumed only once by active owner and cannot be read by ordinary users',async()=>{const db=await fixture();try{const id=crypto.randomUUID();await db.query("insert into owner_email_requests(id,actor,request_hash,expires_at)values($1,$2,'hash',now()+interval '1 minute')",[id,admin]);const claim=async who=>(await db.query('select owner_email_claim($1,$2,$3) ok',[id,who,'hash'])).rows[0].ok;assert.equal(await claim(ba),false);assert.equal(await claim(admin),true);assert.equal(await claim(admin),false);await db.exec('set role authenticated');await assert.rejects(()=>claim(admin));}finally{await db.close();}});
