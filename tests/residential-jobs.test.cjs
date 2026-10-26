const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const J=require('../lib/residential-jobs.cjs');
const booking=()=>({id:randomUUID(),name:'Test Customer',status:'scheduled',payment_status:'card_saved',property_address:'1 Test Lane',city:'Durham',state:'NC',zip:'27701',sqft:1800,beds:3,baths:2,service_date:'2026-10-12',arrival_start:'09:00:00',arrival_end:'12:00:00',quote:{service_label:'Deep clean'},frequency:'weekly',notes:'Use side entrance.'});
function fixture(b,templates=[]){let job=null;const calls=[];return {calls,get job(){return job},set job(v){job=v},from(table){if(table==='checklist_templates')return {select(){return this},eq(){return this},then(ok){return Promise.resolve({data:templates}).then(ok)}};assert.equal(table,'assignment_blocks');let op='read',value;const q={select(){return q},eq(){return q},upsert(v,opts){assert.equal(opts.ignoreDuplicates,true);op='insert';value=v;return q},update(v){op='update';value=v;return q},async run(){if(op==='insert'&&!job)job=structuredClone(value);if(op==='update')Object.assign(job,value);return {data:job}},single(){return q.run()},maybeSingle(){return q.run()},then(ok,no){return q.run().then(ok,no)}};return q},async rpc(name,args){calls.push({name,args});b.status=args.p_cancel?'cancelled':'completed';return {data:null}}};}
test('confirmed bookings become one pending assignment with correct Eastern window and no private billing fields',async()=>{
 const b=booking(),db=fixture(b);await J.syncBooking(db,b);assert.equal(db.job.id,b.id);assert.equal(db.job.status,'pending');assert.equal(db.job.visibility,'pending');assert.equal(db.job.pay_amount,0);assert.equal(db.job.start_window,'2026-10-12T13:00:00.000Z');
 assert.equal(db.job.metadata.source,'residential_booking');assert.equal(db.job.email,undefined);assert.equal(db.job.stripe_customer,undefined);
 db.job.status='claimed';db.job.assigned_to_name='Cleaner';await J.syncBooking(db,b);assert.equal(db.job.status,'claimed');assert.equal(db.job.assigned_to_name,'Cleaner');
 assert.equal(J.assignmentFor({...b,service_date:'2026-12-12'}).start_window,'2026-12-12T14:00:00.000Z');
});
test('unfinished requests and removed bookings never create assignments',async()=>{
 for(const status of ['awaiting_card','requested','review_required','needs_reschedule']){const b={...booking(),status},db=fixture(b);await J.syncBooking(db,b);assert.equal(db.job,null);}
 const removed={...booking(),assignment_deleted_at:new Date().toISOString()},removedDb=fixture(removed);assert.equal(await J.syncBooking(removedDb,removed),null);assert.equal(removedDb.job,null);
 const b={...booking(),status:'cancelled'},db=fixture(b);assert.equal(await J.syncBooking(db,b),null);
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

test('a retained premature assignment re-enters approval only after card confirmation',async()=>{
 const b=booking(),db=fixture(b);db.job={id:b.id,status:'cancelled',metadata:{source:J.source,awaiting_booking:true}};
 await J.syncBooking(db,b);assert.equal(db.job.status,'pending');assert.equal(db.job.visibility,'pending');assert.equal(db.job.metadata.awaiting_booking,false);assert.equal(db.calls.length,0);
});

test('residential checklist matches exact counts, preserves an attached checklist, and never guesses',async()=>{
 const {matchingResidentialChecklist,residentialRecurrence}=await import('../residential-assignment.mjs');
 const t={id:'three-two',name:'Residential | Deep | 3 bed / 2 bath',scope_type:'residential',residential_service:'deep',residential_beds:3,residential_baths:2,sections:[{id:'kitchen',title:'Kitchen',items:[{id:'counter',label:'Clean counters',type:'check'}]}]};
 assert.equal(matchingResidentialChecklist([t],3,2,'deep'),t);
 assert.equal(matchingResidentialChecklist([t],13,2,'deep'),null);
 assert.equal(matchingResidentialChecklist([t],null,2,'deep'),null);
 assert.equal(matchingResidentialChecklist([t,{...t,id:'duplicate'}],3,2,'deep'),null);
 assert.equal(matchingResidentialChecklist([{...t,residential_baths:2.5}],3,2,'deep'),null);
 assert.ok(matchingResidentialChecklist([{...t,residential_baths:2.5}],3,2.5,'deep'));
 assert.deepEqual(residentialRecurrence('biweekly'),{frequency:'weekly',interval:2});
 const b=booking(),db=fixture(b,[t]);await J.syncBooking(db,b);
 assert.equal(db.job.metadata.checklist_template_id,t.id);
 assert.equal(db.job.metadata.beds,3);assert.equal(db.job.metadata.customer_name,b.name);
 assert.equal(db.job.property_checklist_items[0].task,'Clean counters');
 db.job.property_checklist_items=[{task:'Admin customized'}];await J.syncBooking(db,b);
 assert.equal(db.job.property_checklist_items[0].task,'Admin customized');
 const unmatched=fixture(b,[{...t,residential_beds:12}]);await J.syncBooking(unmatched,b);
 assert.deepEqual(unmatched.job.property_checklist_items,[]);
});

test('over-limit residential bookings stay pending with no checklist and explicit review reason',async()=>{
 for(const [beds,baths] of [[8,2],[2,7.5],[2,2.25]]){
 const b={...booking(),beds,baths},db=fixture(b);await J.syncBooking(db,b);
 assert.equal(db.job.status,'pending');assert.deepEqual(db.job.property_checklist_items,[]);
 assert.equal(db.job.metadata.checklist_review_required,true);assert.match(db.job.metadata.checklist_review_reason,/Room counts/);
 }
});
