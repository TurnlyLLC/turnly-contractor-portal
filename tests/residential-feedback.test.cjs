const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const F=require('../lib/residential-feedback.cjs');
const booking='11111111-1111-4111-8111-111111111111',cleaner='22222222-2222-4222-8222-222222222222',admin='33333333-3333-4333-8333-333333333333';
async function fixture(){const d=new PGlite();await d.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
create table profiles(id uuid primary key,role text,status text);
create table referral_bookings(id uuid primary key,status text,stripe_customer text,stripe_payment_method text,assignment_deleted_at timestamptz);
create table assignment_blocks(id uuid primary key,claimed_by uuid,assigned_to uuid);
insert into profiles values('${cleaner}','contractor','active'),('${admin}','admin','active');
insert into referral_bookings values('${booking}','scheduled','cus_test','pm_test',null);
insert into assignment_blocks values('${booking}','${cleaner}',null);`);
await d.exec(fs.readFileSync('supabase/migrations/20261030194931_residential_feedback_tips.sql','utf8'));return d;}
const prepare=(d,amount=2500)=>d.query('select (prepare_residential_tip($1,$2,$3)).*',[booking,amount,'Customer explicitly authorized the tip']);
test('completed clean queues one invitation and locks the actual contractor; no tip before completion',async()=>{const d=await fixture();try{
 await assert.rejects(prepare(d));await d.exec(`update referral_bookings set status='completed';update referral_bookings set status='completed';`);
 assert.equal((await d.query('select count(*)::int n from residential_feedback')).rows[0].n,1);
 await d.exec(`update assignment_blocks set claimed_by='${admin}';`);
 const t=(await prepare(d)).rows[0];assert.equal(t.contractor_id,cleaner);assert.equal(t.net_cents,0);assert.equal((await prepare(d)).rows[0].id,t.id);await assert.rejects(prepare(d,3500));
 assert.equal((await d.query('select count(*)::int n from residential_booking_tips')).rows[0].n,1);
}finally{await d.close();}});
test('100% credit only after success; refunds and disputes cannot be undone by delayed webhook; payout records are separate',async()=>{const d=await fixture();try{
 await d.exec("update referral_bookings set status='completed'");const t=(await prepare(d)).rows[0];
 const sync=(status,net)=>d.query('select (sync_residential_tip($1,$2,$3,$4)).*',[t.id,'pi_test',status,net]);
 await assert.rejects(d.query('select mark_residential_tip_paid($1,$2,$3,$4)',[t.id,admin,2500,'ACH 123']));
 assert.equal((await sync('succeeded',2500)).rows[0].net_cents,2500);
 await assert.rejects(d.query('select mark_residential_tip_paid($1,$2,$3,$4)',[t.id,cleaner,2500,'ACH 123']));
 await d.query('select mark_residential_tip_paid($1,$2,$3,$4)',[t.id,admin,2500,'ACH 123']);
 await d.query('select mark_residential_tip_paid($1,$2,$3,$4)',[t.id,admin,2500,'Repeated click']);
 assert.equal((await d.query('select payment_reference from residential_booking_tips')).rows[0].payment_reference,'ACH 123');
 await sync('refunded',1500);const late=(await sync('succeeded',2500)).rows[0];assert.equal(late.net_cents,1500);assert.equal(late.paid_amount_cents,2500);
 await sync('disputed',0);assert.equal((await sync('succeeded',2500)).rows[0].net_cents,0);
}finally{await d.close();}});
test('RLS exposes only beneficiary earnings columns; customer feedback and mutation RPCs are private',async()=>{const d=await fixture();try{
 await d.exec("update referral_bookings set status='completed'");await prepare(d);
 const rights=(await d.query("select has_function_privilege('authenticated','prepare_residential_tip(uuid,integer,text)','execute') prepare,has_table_privilege('authenticated','residential_feedback','select') feedback,has_column_privilege('authenticated','residential_booking_tips','stripe_customer','select') card")).rows[0];assert.deepEqual(rights,{prepare:false,feedback:false,card:false});
 await d.exec(`grant usage on schema auth to authenticated;grant select on profiles to authenticated;set role authenticated;set test.uid='${cleaner}';`);
 assert.equal((await d.query('select id from residential_booking_tips')).rows.length,1);
 await d.exec("set test.uid='44444444-4444-4444-8444-444444444444'");assert.equal((await d.query('select id from residential_booking_tips')).rows.length,0);
}finally{await d.close();}});
test('ratings, explicit tip consent, matching Stripe amount/customer and full credit are enforced',()=>{
 assert.throws(()=>F.validateFeedback({clean_rating:6,contractor_rating:5}));assert.throws(()=>F.tipAmount({authorized:false,amount_cents:2000}));assert.throws(()=>F.tipAmount({authorized:true,amount_cents:100.1}));
 const t={id:'tip',booking_id:booking,stripe_customer:'cus_test',amount_cents:2500,status:'pending'};
 const pi={id:'pi_test',metadata:{source:'residential_tip',tip_id:'tip',booking_id:booking},customer:'cus_test',amount:2500,amount_received:2500,currency:'usd',status:'succeeded',latest_charge:{amount_refunded:0,disputed:false}};
 assert.deepEqual(F.paymentState(pi,t),{status:'succeeded',net_cents:2500});assert.throws(()=>F.paymentState({...pi,customer:'cus_other'},t));assert.throws(()=>F.paymentState({...pi,amount:2501},t));
 assert.equal(F.paymentState({...pi,status:'processing'},t).net_cents,0);assert.equal(F.paymentState({...pi,status:'requires_action'},t).status,'requires_action');
 assert.equal(F.paymentState({...pi,latest_charge:{amount_refunded:500}},t).net_cents,2000);
});
test('saved-card charge retry reuses the same intent and does not credit failures',async()=>{
 let t={id:'tip',booking_id:booking,contractor_id:cleaner,stripe_customer:'cus_test',stripe_payment_method:'pm_test',amount_cents:2500,status:'pending',created_at:new Date().toISOString()},creates=0,confirms=0;
 let pi={id:'pi_test',metadata:{source:'residential_tip',tip_id:'tip',booking_id:booking},customer:'cus_test',amount:2500,amount_received:2500,currency:'usd',status:'requires_confirmation'};
 const db={rpc:async(name,args)=>{if(name==='sync_residential_tip')Object.assign(t,{status:args.p_status,net_cents:args.p_net,stripe_payment_intent:args.p_intent});return {data:{...t}};},from:()=>({select(){return this},eq(){return this},single:async()=>({data:{...t}}),update(data){Object.assign(t,data);return this},then(resolve){resolve({data:null});}})};
 const st={paymentMethods:{retrieve:async()=>({customer:'cus_test'})},paymentIntents:{create:async(data,opts)=>{creates++;assert.equal(data.amount,2500);assert.equal(opts.idempotencyKey,'turnly-tip-create-tip');return pi;},confirm:async(id,params,opts)=>{confirms++;assert.equal(params.use_stripe_sdk,true);pi.status='succeeded';return pi;},retrieve:async()=>pi}};
 const input={authorized:true,amount_cents:2500};assert.equal((await F.charge(db,st,{id:booking,email:'test@example.com'},input)).tip.net_cents,2500);await F.charge(db,st,{id:booking},input);assert.equal(creates,1);assert.equal(confirms,1);
});
