const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');const {randomUUID}=require('node:crypto');const {PGlite}=require('@electric-sql/pglite');
const P=require('../lib/residential-pricing.cjs'),S=require('../lib/residential-server.cjs');
const data={pets:'no',parking:'driveway',access_method:'resident',service:'standard',frequency:'weekly',sqft:2000,beds:3,baths:2,name:'Example Customer',email:'test@example.com',phone:'9195550188',profile_address:'1 Profile Ln, Durham NC 27701',property_address:'2 Property Ln',city:'Durham',state:'NC',zip:'27701',property_confirmed:true,service_date:'2099-10-14',arrival_start:'09:00',arrival_end:'12:00',notes:''};
async function dbFixture(){const db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);
create table sales_leads(id uuid primary key default gen_random_uuid(),property_name text,name text,contact_name text,contact_email text,contact_phone text,address text,sales_city text,default_service_type text,lead_source text,lead_notes text,pipeline_stage text,next_step text,task_priority text,task_status text);
create table quickbooks_invoice_links(id uuid primary key,quickbooks_status text,quickbooks_balance numeric,paid_at timestamptz);create table assignment_blocks(id uuid primary key,status text,visibility text,pay_amount numeric,metadata jsonb,quickbooks_invoice_link_id uuid references quickbooks_invoice_links(id));create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);grant usage on schema public,auth,storage to service_role;grant all on all tables in schema public to service_role;`);
for(const file of ['20261008120000_agent_referrals.sql','20261008152842_residential_bookings.sql','20261008210000_residential_customer_accounts.sql','20261009135355_residential_booking_completion.sql'])await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations',file),'utf8'));await db.exec(fs.readFileSync(path.join(__dirname,'../docs/gift-cards.sql'),'utf8'));return db;}
const G=require('../lib/gift-cards.cjs');
test('fulfillment never issues cards for unpaid, mismatched or refunded Stripe payments',async()=>{
 const o={id:randomUUID(),stripe_session:'cs_test',quantity:1,amount_cents:10000,status:'pending'};
 let issued=0;const db={from:()=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:o})}),rpc:async()=>{issued++;return {data:null}}};
 let session={id:'cs_test',metadata:{purpose:'turnly_gift_cards',order_id:o.id},client_reference_id:o.id,mode:'payment',currency:'usd',amount_total:10000,payment_status:'unpaid',payment_intent:'pi_test'};
 const st={checkout:{sessions:{retrieve:async()=>session}},paymentIntents:{retrieve:async()=>({status:'succeeded',amount_received:10000,latest_charge:{amount_refunded:10000}})}};
 assert.equal(await G.fulfill(db,st,'cs_test'),true);assert.equal(issued,0);
 session={...session,payment_status:'paid',amount_total:1};await assert.rejects(G.fulfill(db,st,'cs_test'),/match/);assert.equal(issued,0);
 session={...session,amount_total:10000};await G.fulfill(db,st,'cs_test');assert.equal(issued,0);
});
test('24-character cryptographic card codes and safe input normalization',()=>{
 const codes=new Set(Array.from({length:10000},G.code));assert.equal(codes.size,10000);for(const c of codes)assert.match(c,/^[A-Z0-9]{24}$/);
 assert.equal(G.normalize('abcdef ghijkl mnopqr stuvwx'),'ABCDEFGHIJKLMNOPQRSTUVWX');assert.equal(G.valid('TURNLY100-DEMO'),false);
});
test('gift ledger: idempotent issuance, partial redemption, double-spend prevention, cancellation, NC restriction and refund eligibility',async()=>{
 const db=await dbFixture();try{
 await db.exec(fs.readFileSync(path.join(__dirname,'../docs/gift-card-search.sql'),'utf8'));
 const admin=async()=> (await db.query("select gift_admin_search('cards','','',null,null,1,25,'newest') r")).rows[0].r;
 const order=randomUUID(),code='ABCDEFGHIJKLMNOPQRSTUVWX',other='1234567890ABCDEFGHIJKLMN';
 await db.query("insert into gift_orders(id,token_hash,request_hash,email,name,quantity,amount_cents,terms_version,stripe_session) values($1,'h','h','buyer@example.com','Buyer',2,20000,'2026-10-15.1','cs_test')",[order]);
 const issue=()=>db.query('select gift_issue($1,$2,$3,$4)',[order,'cs_test','pi_test',JSON.stringify([code,other])]);await issue();await issue();
 assert.equal((await db.query('select count(*)::int n from gift_cards')).rows[0].n,2);
 assert.equal((await db.query('select count(*)::int n from gift_events')).rows[0].n,2);
 const create=async(id,c,amount=6000,state='NC')=>db.query('select create_gift_booking($1,$2,$3,$4,$5,$6,$7)',[id,'hash','request',c,JSON.stringify({...S.validate(data),amount_cents:amount,state,gift_expected_cents:Math.min(amount,(await db.query('select balance_cents-reserved_cents n from gift_cards where code=$1',[c])).rows[0].n)}),'awaiting_card','Authorized']);
 assert.equal((await admin()).summary.remaining,20000);
 const first=randomUUID();await create(first,code);await create(first,code);
 let card=(await db.query('select * from gift_cards where code=$1',[code])).rows[0];assert.equal(card.reserved_cents,6000);assert.equal(card.balance_cents,10000);
 const second=randomUUID();await create(second,code,9000);assert.equal((await db.query('select gift_applied_cents from referral_bookings where id=$1',[second])).rows[0].gift_applied_cents,4000);
 await assert.rejects(create(randomUUID(),code),/reserved/);
 await db.query("update referral_bookings set stripe_payment_method='pm',status='scheduled',payment_status='paid' where id=$1",[first]);
 await db.query("update referral_bookings set payment_status='paid' where id=$1",[first]);
 card=(await db.query('select * from gift_cards where code=$1',[code])).rows[0];assert.equal(card.balance_cents,4000);assert.equal(card.reserved_cents,4000);
 await assert.rejects(db.query('select gift_refund_lock($1,null,$2)',[card.id,'Address cannot be served']),/unused/);
 await db.query("update referral_bookings set status='cancelled' where id=$1",[second]);
 card=(await db.query('select * from gift_cards where code=$1',[code])).rows[0];assert.equal(card.balance_cents,4000);assert.equal(card.reserved_cents,0);
 assert.equal((await admin()).summary.remaining,14000);assert.equal((await admin()).summary.available,14000);
 await assert.rejects(create(randomUUID(),other,6000,'SC'),/only in NC/);
 const final=randomUUID();await create(final,code,9000);await db.query("update referral_bookings set stripe_payment_method='pm',status='scheduled',payment_status='paid' where id=$1",[final]);
 card=(await db.query('select * from gift_cards where code=$1',[code])).rows[0];assert.equal(card.balance_cents,0);assert.equal(card.status,'spent');
 assert.equal((await admin()).summary.remaining,10000);
 const events=(await db.query('select kind,amount_cents from gift_events where card_id=$1',[card.id])).rows;
 assert.equal(events.filter(e=>e.kind==='redeemed').reduce((n,e)=>n+e.amount_cents,0),10000);
 assert.equal(events.filter(e=>e.kind==='fully_used').length,1);
 const unused=(await db.query('select * from gift_cards where code=$1',[other])).rows[0];await db.query('select gift_refund_lock($1,null,$2)',[unused.id,'Turnly cannot service the address']);
 await assert.rejects(create(randomUUID(),other),/unavailable/);await db.query('select gift_refund_finish($1,$2)',[unused.id,'re_test']);await db.query('select gift_refund_finish($1,$2)',[unused.id,'re_test']);
 assert.equal((await db.query("select count(*)::int n from gift_events where kind='refunded'")).rows[0].n,1);
 assert.equal((await db.query('select count(*)::int n from sales_leads')).rows[0].n,0);
 assert.equal((await db.query('select agent_id from referral_customers')).rows[0].agent_id,null);
 await db.exec('set role anon');await assert.rejects(db.query('select * from gift_cards'),/permission denied/);await assert.rejects(db.query('select gift_issue($1,$2,$3,$4)',[order,'cs_test','pi_test','[]']),/permission denied/);
 await db.exec('reset role;set role authenticated');await assert.rejects(db.query('select * from gift_orders'),/permission denied/);
 await db.exec('reset role;set role service_role');await assert.rejects(db.query("delete from gift_events"),/permission denied/);
 }finally{await db.close();}
});
test('PDF uses supplied full-page art, produces one page per card and distinct QR payloads',async()=>{
 const {PDFDocument}=require('pdf-lib');const bytes=await G.pdf([{code:'ABCDEFGHIJKLMNOPQRSTUVWX'},{code:'1234567890ABCDEFGHIJKLMN'}]);const doc=await PDFDocument.load(bytes);assert.equal(doc.getPageCount(),2);assert.equal(doc.getPage(0).getWidth(),612);assert.ok(bytes.length>1000000);
});

test('admin search: purchaser, partial code, Eastern date boundaries, totals, stable pagination and private access',async()=>{
 const db=await dbFixture();try{
 await db.exec(fs.readFileSync(path.join(__dirname,'../docs/gift-card-search.sql'),'utf8'));
 const order=randomUUID(),other=randomUUID();
 for(const [id,name,em,paid] of [[order,"Alex O'Neil",'alex@example.com','2026-10-16T03:59:59Z'],[other,'Jamie','jamie@example.com','2026-10-16T04:00:00Z']]){
 await db.query("insert into gift_orders(id,token_hash,request_hash,email,name,quantity,amount_cents,terms_version,status,paid_at) values($1,'h','h',$2,$3,1,10000,'v','paid',$4)",[id,em,name,paid]);
 }
 await db.query("insert into gift_cards(order_id,ordinal,code,balance_cents,reserved_cents) values($1,1,'ABCDEFGHIJKLMNOPQRSTUVWX',7000,2000),($2,1,'1234567890ABCDEFGHIJKLMN',10000,0)",[order,other]);
 const search=async(mode='cards',q='',status='',from=null,to=null,page=1,size=25)=> (await db.query('select gift_admin_search($1,$2,$3,$4,$5,$6,$7,$8) r',[mode,q,status,from,to,page,size,'newest'])).rows[0].r;
 let r=await search('cards',"O'Neil");assert.equal(r.total,1);assert.equal(r.summary.remaining,7000);assert.equal(r.summary.reserved,2000);assert.equal(r.summary.available,5000);
 assert.equal((await search('cards','ALEX@')).total,1);assert.equal((await search('cards','stuvwx')).total,1);assert.equal((await search('cards','ABCDEF GHIJKL MNOPQR STUVWX')).total,1);
 assert.equal((await search('cards','%')).total,0);assert.equal((await search('cards','_')).total,0);assert.equal((await search('cards',order)).total,1);
 assert.equal((await search('cards','','','2026-10-15','2026-10-15')).total,1);assert.equal((await search('cards','','','2026-10-16','2026-10-16')).total,1);
 r=await search('cards','','',null,null,1,1);assert.equal(r.rows.length,1);assert.equal(r.total,2);assert.equal(r.summary.remaining,17000);assert.notEqual(r.rows[0].id,(await search('cards','','',null,null,2,1)).rows[0].id);
 assert.equal((await search('orders','stuvwx')).rows[0].id,order);assert.equal((await search('orders','Jamie')).summary.paid,10000);assert.equal((await search('cards','','spent')).total,0);
 await assert.rejects(search('cards','','','2026-10-16','2026-10-15'),/Start date/);
 await db.exec('set role anon');await assert.rejects(search(),/permission denied/);await db.exec('reset role;set role authenticated');await assert.rejects(search(),/permission denied/);await db.exec('reset role;set role service_role');assert.equal((await search()).total,2);
 }finally{await db.close();}
});


test('direct guest booking is idempotent, needs no account, restricts NC and denies public RPC access',async()=>{
 const db=await dbFixture();try{
 await db.exec(fs.readFileSync(path.join(__dirname,'../docs/direct-booking.sql'),'utf8'));
 const id=randomUUID(), d=S.validate(data);
 const create=(bid=id,hash='request',state='NC')=>db.query('select create_direct_booking($1,$2,$3,$4,$5,$6)',[bid,'token',hash,JSON.stringify({...d,state}),'awaiting_card','Authorized']);
 await create();await create();
 const rows=(await db.query('select * from referral_bookings')).rows;
 assert.equal(rows.length,1);assert.equal(rows[0].agent_id,null);assert.equal(rows[0].agent_name,'Turnly Residential');assert.equal(rows[0].status,'awaiting_card');assert.equal(rows[0].gift_applied_cents,0);
 assert.equal((await db.query('select count(*)::int n from auth.users')).rows[0].n,0);
 await assert.rejects(create(id,'different'),/changed/);
 await assert.rejects(create(randomUUID(),'request','SC'),/only in NC/);
 await db.exec('set role anon');await assert.rejects(create(),/permission denied/);
 await db.exec('reset role;set role authenticated');await assert.rejects(create(),/permission denied/);
 }finally{await db.close();}
});

test('gift checkout uses dashboard payment methods, exact totals and reusable session without issuing cards',async()=>{
 let order,creates=0;const id=randomUUID(),token='a'.repeat(64);
 const db={from(table){assert.equal(table,'gift_orders');let patch;return{upsert(v){order??={...v,status:'pending',created_at:new Date().toISOString()};return Promise.resolve({data:null})},select(){return this},eq(){return patch?(Object.assign(order,patch),Promise.resolve({data:null})):this},single:async()=>({data:order}),update(v){patch=v;return this}}}};
 const session={id:'cs_fixture',status:'open',url:'https://checkout.stripe.com/fixture'},stripe={checkout:{sessions:{retrieve:async()=>session,create:async(p,o)=>{creates++;assert(!('payment_method_types'in p));assert.equal(p.line_items[0].quantity,10);assert.equal(p.line_items[0].price_data.unit_amount,10000);assert.equal(p.metadata.purpose,'turnly_gift_cards');assert.equal(o.idempotencyKey,'gift-checkout-v2-'+id);return session}}}};
 const context={module:{exports:{}},console,require:p=>p==='../lib/residential-server.cjs'?{...S,body:async r=>r.body,database:()=>db,rate:async()=>{},stripe:()=>stripe}:p==='../lib/gift-cards.cjs'?{ready:()=>true,TERMS:'fixture'}:p==='../lib/crm-sales.cjs'?{attribution:async()=>({})}:require('../lib/agent-referrals.cjs')};
 vm.runInNewContext(fs.readFileSync('api/gift-cards.js','utf8'),context);
 const input={action:'checkout',id,token,accepted:true,terms:'fixture',quantity:10,name:'Buyer',email:'buyer@example.test'};
 async function request(body){let result;const res={setHeader(){},end(s){result=JSON.parse(s)}};await context.module.exports({method:'POST',body},res);return{status:res.statusCode,...result}};
 assert.equal((await request(input)).url,session.url);assert.equal((await request(input)).url,session.url);assert.equal(creates,1);assert.equal(order.amount_cents,100000);assert.equal(order.status,'pending');assert.equal((await request({...input,quantity:2})).status,409);
});

test('paid Stripe fulfillment issues cards once, emails the PDF once and appears in admin totals',async()=>{
 const sql=await dbFixture();try{
 await sql.exec(fs.readFileSync(path.join(__dirname,'../docs/gift-card-search.sql'),'utf8'));
 const id=randomUUID();await sql.query("insert into gift_orders(id,token_hash,request_hash,email,name,quantity,amount_cents,terms_version,stripe_session) values($1,'h','h','buyer@example.test','Fixture Buyer',2,20000,'v','cs_fixture')",[id]);
 const db={from(table){assert.ok(['gift_orders','gift_cards','gift_events'].includes(table));let filters=[],patch,insert,sort;const q={select(){return q},eq(k,v){filters.push([k,v]);return q},order(k){sort=k;return q},update(v){patch=v;return q},insert(v){insert=Array.isArray(v)?v:[v];return q},maybeSingle:async()=>{const r=await run();return{...r,data:r.data?.[0]}},then(ok,bad){return run().then(ok,bad)}};async function run(){let params=[];const where=filters.map(([k,v])=>{params.push(v);return `${k}=$${params.length}`}).join(' and ');if(insert){for(const row of insert){const keys=Object.keys(row);await sql.query(`insert into ${table}(${keys}) values(${keys.map((k,i)=>'$'+(i+1))})`,keys.map(k=>typeof row[k]==='object'?JSON.stringify(row[k]):row[k]));}return{data:null};}if(patch){const set=Object.entries(patch).map(([k,v])=>{params.push(v);return`${k}=$${params.length}`}).join(',');await sql.query(`update ${table} set ${set} where ${where}`,params);return{data:null};}return{data:(await sql.query(`select * from ${table}${where?' where '+where:''}${sort?' order by '+sort:''}`,params)).rows};}return q;},async rpc(name,args){assert.equal(name,'gift_issue');await sql.query('select gift_issue($1,$2,$3,$4)',[args.p_order,args.p_session,args.p_intent,JSON.stringify(args.p_codes)]);return{data:null};}};
 let emails=0;const ctx={module:{exports:{}},require:p=>require(p.startsWith('./')?'../lib/'+p.slice(2):p),__dirname:path.resolve(__dirname,'../lib'),Buffer,process:{env:{}},AbortSignal,fetch:async(url,opts)=>{assert.equal(url,'https://api.resend.com/emails');const body=JSON.parse(opts.body);assert.deepEqual(body.to,['buyer@example.test']);assert.equal(body.attachments.length,1);const pdf=await require('pdf-lib').PDFDocument.load(Buffer.from(body.attachments[0].content,'base64'));assert.equal(pdf.getPageCount(),2);emails++;return{ok:true,json:async()=>({id:'fixture_email'})};}};
 ctx.providedPdf=G.pdf;vm.runInNewContext(fs.readFileSync('lib/gift-cards.cjs','utf8')+'\npdf=providedPdf;',ctx);
 const st={checkout:{sessions:{retrieve:async()=>({id:'cs_fixture',client_reference_id:id,metadata:{purpose:'turnly_gift_cards',order_id:id},mode:'payment',currency:'usd',amount_total:20000,payment_status:'paid',payment_intent:'pi_fixture'})}},paymentIntents:{retrieve:async()=>({status:'succeeded',amount_received:20000,latest_charge:{amount_refunded:0,disputed:false}})}};
 await ctx.module.exports.fulfill(db,st,'cs_fixture');await ctx.module.exports.fulfill(db,st,'cs_fixture');assert.equal(emails,1);
 const order=(await sql.query('select * from gift_orders')).rows[0];assert.equal(order.status,'paid');assert.equal(order.email_status,'accepted');
 const cards=(await sql.query('select * from gift_cards')).rows;assert.equal(cards.length,2);assert.notEqual(cards[0].code,cards[1].code);
 const r=(await sql.query("select gift_admin_search('orders','','',null,null,1,25,'newest') r")).rows[0].r;assert.equal(r.total,1);assert.equal(r.summary.paid,20000);
 assert.equal((await sql.query("select count(*)::int n from gift_events where kind='email_accepted'")).rows[0].n,2);
 }finally{await sql.close();}
});

test('review-only request ignores gift credit and uses the ordinary request path',async()=>{
 let selected;const db={rpc:async(name)=>{selected=name;return{error:{message:'fixture stops before saving'}}}};
 const overrides={'../lib/residential-server.cjs':{...S,body:async r=>r.body,database:()=>db,rate:async()=>{},validate:()=>({...data,quote:{review_required:true}})},'../lib/gift-cards.cjs':{card:()=>{throw Error('Request must not inspect or reserve the card')}},'../lib/service-coverage.cjs':{verify:async()=>({approved:true})},'../lib/booking-calendar.cjs':{load:async()=>({settings:{}}),error:()=>null}};
 const ctx={module:{exports:{}},console,require:p=>overrides[p]||require(p.startsWith('../')?p:p)};
 vm.runInNewContext(fs.readFileSync('api/residential-booking.js','utf8'),ctx);
 let response;await ctx.module.exports({method:'POST',body:{...data,action:'request',gift:'ABCDEFGHIJKLMNOPQRSTUVWX',id:randomUUID(),token:'a'.repeat(64)}},{setHeader(){},end(v){response=JSON.parse(v)}});
 assert.equal(selected,'create_direct_booking',JSON.stringify(response));
});
