const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const J=require('../lib/residential-jobs.cjs');
const booking=()=>({id:randomUUID(),name:'Test Customer',status:'scheduled',payment_status:'card_saved',property_address:'1 Test Lane',city:'Durham',state:'NC',zip:'27701',sqft:1800,beds:3,baths:2,service_date:'2026-10-12',arrival_start:'09:00:00',arrival_end:'12:00:00',quote:{service_label:'Deep clean'},frequency:'weekly',notes:'Use side entrance.'});
function fixture(b){let job=null;const calls=[];return {calls,get job(){return job},set job(v){job=v},from(table){assert.equal(table,'assignment_blocks');let op='read',value;const q={select(){return q},eq(){return q},upsert(v,opts){assert.equal(opts.ignoreDuplicates,true);op='insert';value=v;return q},update(v){op='update';value=v;return q},async run(){if(op==='insert'&&!job)job=structuredClone(value);if(op==='update')Object.assign(job,value);return {data:job}},single(){return q.run()},maybeSingle(){return q.run()},then(ok,no){return q.run().then(ok,no)}};return q},async rpc(name,args){calls.push({name,args});b.status=args.p_cancel?'cancelled':'completed';return {data:null}}};}
test('confirmed bookings become one pending assignment with correct Eastern window and no private billing fields',async()=>{
 const b=booking(),db=fixture(b);await J.syncBooking(db,b);assert.equal(db.job.id,b.id);assert.equal(db.job.status,'pending');assert.equal(db.job.visibility,'pending');assert.equal(db.job.pay_amount,0);assert.equal(db.job.start_window,'2026-10-12T13:00:00.000Z');
 assert.equal(db.job.metadata.source,'residential_booking');assert.equal(db.job.email,undefined);assert.equal(db.job.stripe_customer,undefined);
 db.job.status='claimed';db.job.assigned_to_name='Cleaner';await J.syncBooking(db,b);assert.equal(db.job.status,'claimed');assert.equal(db.job.assigned_to_name,'Cleaner');
 assert.equal(J.assignmentFor({...b,service_date:'2026-12-12'}).start_window,'2026-12-12T14:00:00.000Z');
});
test('unconfirmed requests never create contractor assignments',async()=>{
 for(const status of ['awaiting_card','requested','review_required','cancelled','needs_reschedule']){const b={...booking(),status},db=fixture(b);assert.equal(await J.syncBooking(db,b),null);assert.equal(db.job,null);}
});
test('completion waits for paid status so service-morning collection is not skipped',async()=>{
 const b=booking(),db=fixture(b);await J.syncBooking(db,b);db.job.status='completed';await J.syncBooking(db,b);assert.equal(db.calls.length,0);b.payment_status='paid';await J.syncBooking(db,b);assert.equal(db.calls[0].args.p_cancel,false);assert.equal(b.status,'completed');
});
test('cancellation propagates both ways but does not rewrite an uncertain payment',async()=>{
 const b=booking(),db=fixture(b);await J.syncBooking(db,b);b.status='cancelled';await J.syncBooking(db,b);assert.equal(db.job.status,'cancelled');assert.equal(db.job.visibility,'closed');
 b.status='scheduled';b.payment_status='uncertain';await J.syncBooking(db,b);assert.equal(db.calls.length,0);b.payment_status='card_saved';await J.syncBooking(db,b);assert.equal(b.status,'cancelled');
});
test('a colliding unrelated assignment is never modified',async()=>{
 const b=booking(),db=fixture(b);db.job={id:b.id,status:'open',metadata:{source:'other'}};await assert.rejects(J.syncBooking(db,b),/conflicts/);assert.equal(db.job.status,'open');
});
