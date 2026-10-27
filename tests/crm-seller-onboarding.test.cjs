const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
async function fixture(){const db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create table profiles(id uuid primary key,role text,status text);insert into profiles values('${id(1)}','sales','active'),('${id(2)}','admin','active');create table crm_sales_commissions(order_id uuid primary key,sales_user_id uuid,amount_cents integer,status text);insert into crm_sales_commissions values('${id(3)}','${id(1)}',1000,'earned');`);await db.exec(fs.readFileSync('supabase/migrations/20261021123800_crm_required_sales_training.sql','utf8'));await db.exec(fs.readFileSync('supabase/migrations/20261027191425_sales_seller_onboarding.sql','utf8'));return db;}
test('new introduction, review and current signature are all required; old completion does not bypass',async()=>{const db=await fixture();try{
 const ready=async()=>(await db.query('select crm_seller_training_ready($1) r',[id(1)])).rows[0].r;
 await db.exec(`insert into crm_training_progress(user_id,version,lesson,completed_at) values('${id(1)}','20261021-v1','introduction',now()),('${id(1)}','20261021-v1','portal',now());insert into crm_training_reviews values('${id(1)}','20261021-v1',now());`);
 assert.equal(await ready(),false);
 await assert.rejects(db.query('select crm_seller_training_acknowledge($1)',[id(1)]),/Finish the introduction/);
 await db.exec(`insert into crm_training_progress(user_id,version,lesson,completed_at) values('${id(1)}','20261027-v2','introduction',now());`);
 await db.query('select crm_seller_training_acknowledge($1)',[id(1)]);assert.equal(await ready(),false);
 await db.exec(`insert into crm_seller_agreements values('${id(1)}','20261027-v1','hash','snapshot','Test Seller','I agree',now());`);assert.equal(await ready(),true);
 await db.exec('set role authenticated');await assert.rejects(db.query('select * from crm_seller_agreements'),/permission denied/);await assert.rejects(db.query('select crm_seller_training_ready($1)',[id(1)]),/permission denied/);
 await db.exec('reset role;set role service_role');await assert.rejects(db.query("update crm_seller_agreements set signer_name='Changed'"),/permission denied/);
 }finally{await db.close();}});
test('commission approval is admin only, amount checked, and never sends or records money twice',async()=>{const db=await fixture();try{
 const review=(actor,action,amount=1000,ref='')=>db.query('select crm_commission_payment_review($1,$2,$3,$4,$5)',[id(actor),id(3),action,ref,amount]);
 await assert.rejects(review(1,'approve'),/Administrator/);
 await assert.rejects(review(2,'record_paid',1000,'ACH-1'),/Approve/);
 await assert.rejects(review(2,'approve',2000),/changed/);
 await review(2,'approve');let row=(await db.query('select * from crm_commission_payments')).rows[0];assert.equal(row.paid_at,null);
 await assert.rejects(review(2,'record_paid'),/reference/);
 await db.exec("update crm_sales_commissions set amount_cents=500");await assert.rejects(review(2,'record_paid',500,'ACH-1'),/Approve/);
 await review(2,'approve',500);await review(2,'record_paid',500,'ACH-1');
 await assert.rejects(review(2,'record_paid',500,'ACH-1'),/already/);
 row=(await db.query('select * from crm_commission_payments')).rows[0];assert.equal(row.paid_cents,500);assert.equal(row.reference,'ACH-1');
 await db.exec("update crm_sales_commissions set status='held',amount_cents=0");await assert.rejects(review(2,'approve',0),/not eligible/);
 assert.equal((await db.query('select paid_cents from crm_commission_payments')).rows[0].paid_cents,500);
 }finally{await db.close();}});
test('purchase links cannot be generated before onboarding',async()=>{const C=require('../lib/crm-sales.cjs');let accessed=false;const db={rpc:async()=>({data:false}),from:()=>{accessed=true;throw Error('unexpected database write');}};await assert.rejects(C.link(db,{id:id(1),admin:false}),e=>e.status===403);assert.equal(accessed,false);});
test('earnings API scopes every sale and payment to the authenticated representative and rejects approval',async()=>{
 const S=require('../lib/residential-server.cjs'),C=require('../lib/crm-sales.cjs'),handler=require('../api/crm-earnings.js');
 const saved={database:S.database,body:S.body,access:C.access,all:C.all};let action='list',calls=0;
 S.database=()=>({});S.body=async()=>({action,order_id:id(3)});C.access=async()=>({id:id(1),admin:false});
 C.all=async(db,table,cols,filter)=>{const filters=[];const q={eq:(k,v)=>{filters.push([k,v]);return q;},not:()=>q};filter(q);assert.deepEqual(filters,[['sales_user_id',id(1)]]);calls++;return [];};
 const invoke=async()=>{let result;const res={setHeader(){},status(n){this.statusCode=n;return this;},json(v){result=v;},end(v){result=JSON.parse(v);}};await handler({method:'POST'},res);return {status:res.statusCode,result};};
 try{assert.equal((await invoke()).status,200);assert.equal(calls,3);action='approve';assert.equal((await invoke()).status,403);assert.equal(calls,3);}finally{Object.assign(S,{database:saved.database,body:saved.body});Object.assign(C,{access:saved.access,all:saved.all});}
});
test('signing requires consent, current text, completed training and the authenticated identity',async()=>{
 const S=require('../lib/residential-server.cjs'),C=require('../lib/crm-sales.cjs'),T=require('../lib/crm-training.cjs'),A=require('../lib/seller-agreement.cjs'),handler=require('../api/crm-onboarding.js');
 const saved={database:S.database,body:S.body,access:C.access,status:T.status,ready:T.ready};let completed=false,stored=null,input={action:'sign',name:'Test Seller',consent:false,version:A.VERSION,hash:A.HASH,user_id:id(2)};
 S.database=()=>({from:()=>({upsert:async v=>{stored=v;return {data:null};},select(){return this;},eq(){return this;},maybeSingle:async()=>({data:stored})})});S.body=async()=>input;C.access=async()=>({id:id(1),admin:false});T.status=async()=>({ready:completed});T.ready=async()=>true;
 const invoke=async()=>{const res={setHeader(){},status(n){this.statusCode=n;return this;},json(){},end(){}};await handler({method:'POST'},res);return res.statusCode;};
 try{assert.equal(await invoke(),400);input.consent=true;assert.equal(await invoke(),403);assert.equal(stored,null);completed=true;input.hash='changed';assert.equal(await invoke(),400);input.hash=A.HASH;assert.equal(await invoke(),200);assert.equal(stored.user_id,id(1));assert.equal(stored.agreement_text,A.TEXT);assert.equal(stored.signer_name,'Test Seller');}finally{Object.assign(S,{database:saved.database,body:saved.body});C.access=saved.access;T.status=saved.status;T.ready=saved.ready;}
});
