const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../lib/contractor-earnings.cjs'),C=require('../lib/contractor-crm.cjs'),M=require('../api/turnly-mcp.js');
const now=new Date('2026-11-17T21:00:00Z');
test('year-to-date separates earned work, legacy payments, payout mirrors, reservations and net tips',()=>{
 const jobs=[
  {id:'legacy',status:'completed',pay_amount:100,completed_at:'2026-01-01T05:00:00Z',metadata:{payment:{added_fee_amount:20,fee_amount:5,status:'paid',paid_at:'2026-01-03',paid_amount:110}}},
  {id:'ledger',status:'completed',pay_amount:80,completed_at:'2026-06-01',paid_out:true,paid_at:'2026-06-02',paid_amount:80},
  {id:'reserved',status:'completed',pay_amount:90,completed_at:'2026-07-01'},
  {id:'old-work',status:'completed',pay_amount:40,completed_at:'2025-12-31T23:00:00Z',paid_out:true,paid_at:'2026-01-01T05:00:00Z',paid_amount:40},
  {id:'active',status:'claimed',pay_amount:500,start_window:'2026-11-17'},
 ];
 const payouts=[{assignment_id:'ledger',status:'completed',amount_cents:8000,completed_at:'2026-06-02'}, {assignment_id:'reserved',status:'reserved',amount_cents:9000}];
 const tips=[{status:'succeeded',net_cents:1500,created_at:'2026-07-02',paid_at:'2026-07-03',paid_amount_cents:1500},{status:'failed',net_cents:8000,created_at:'2026-07-02'}];
 const s=E.summarize(jobs,payouts,tips,now);
 assert.equal(s.ytd_earnings_cents,30000);assert.equal(s.ytd_paid_cents,24500);assert.equal(s.outstanding_cents,9000);
 assert.equal(s.assignments.paid_count,3);assert.equal(s.assignments.reserved_cents,9000);assert.equal(s.assignments.all_time_earned_cents,32500);
});
test('Eastern year boundary, undated paid work and future dates are explicit, never guessed',()=>{
 const jobs=[{id:'a',status:'completed',pay_amount:10,completed_at:'2026-01-01T04:59:59Z',paid_at:'2026-01-01T04:59:59Z'},
 {id:'b',status:'completed',pay_amount:20,payment_status:'paid'},
 {id:'c',status:'completed',pay_amount:30,start_window:'2026-11-18',paid_at:'2026-11-18'},
 {id:'d',status:'completed',pay_amount:40,start_window:'2026-01-01',paid_at:'2026-01-01',paid_amount:0}];
 const s=E.summarize(jobs,[],[],now);assert.equal(s.ytd_earnings_cents,4000);assert.equal(s.ytd_paid_cents,0);
 assert.equal(s.assignments.undated_paid_cents,2000);assert.equal(s.assignments.undated_earned_cents,2000);assert.equal(s.assignments.inferred_paid_amount_count,3);
 assert.equal(s.assignments.all_time_paid_cents,6000);assert.equal(s.period_through,'2026-11-17');
});
test('fast totals read all pages, enforce contractor ownership and expose a read-only tool',async()=>{
 const worker='22222222-2222-4222-8222-222222222222';let pages=0;
 const jobs=Array.from({length:501},(_,i)=>({id:String(i),status:'completed',assigned_to:worker,claimed_by:null,pay_amount:1,completed_at:'2026-02-01'}));
 jobs.push({id:'other',status:'completed',assigned_to:worker,claimed_by:'33333333-3333-4333-8333-333333333333',pay_amount:9999,completed_at:'2026-02-01'});
 const db={from(table){return{select(){return this},eq(){return this},or(){return this},order(){return this},async maybeSingle(){assert.equal(table,'profiles');return{data:{id:worker,full_name:'Example',role:'contractor'}}},async range(a,b){if(table==='assignment_blocks'){pages++;return{data:jobs.slice(a,b+1)}}return{data:[]}}}}};
 const s=await C.run(db,'admin',{action:'earnings',id:worker},()=>{throw Error('Totals must not call Stripe')});
 assert.equal(pages,2);assert.equal(s.earnings.all_time_earnings_cents,50100);assert.equal(s.earnings.assignments.earned_count,501);
 const tool=M.definitions(['contractors:read']).find(x=>x.name==='turnly_contractors_earnings');assert.ok(tool);assert.equal(tool.annotations.readOnlyHint,true);assert.ok(!tool.inputSchema.required?.includes('confirm'));
});
test('payment panel uses the same precomputed earned and paid totals exposed to Alice',async()=>{
 const {earningsOverview}=await import('../contractor-crm.mjs');
 const s=E.summarize([{id:'one',status:'completed',pay_amount:100,completed_at:'2026-01-01',paid_at:'2026-02-01',paid_amount:90}],[],[],now);
 const html=earningsOverview([],now,s);assert.match(html,/Earned in 2026/);assert.match(html,/Paid in 2026/);assert.match(html,/\$100\.00/);assert.match(html,/\$90\.00/);assert.match(html,/Through 2026-11-17 Eastern/);
});
