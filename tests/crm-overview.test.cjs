const {test}=require('node:test'),assert=require('node:assert/strict');
const O=require('../lib/crm-overview.cjs');
test('Eastern day and Monday week boundaries handle DST and invalid dates',()=>{
 const now=Date.parse('2026-11-09T18:00:00Z');
 const fall=O.periods('2026-11-01',now);assert.equal((Date.parse(fall.daily.to)-Date.parse(fall.daily.from))/3600000,25);
 const spring=O.periods('2026-03-08',now);assert.equal((Date.parse(spring.daily.to)-Date.parse(spring.daily.from))/3600000,23);
 const today=O.periods(null,now);assert.equal(today.day,'2026-11-09');assert.equal(today.weekly.from,'2026-11-09T05:00:00.000Z');
 assert.throws(()=>O.periods('2026-02-30',now));assert.throws(()=>O.periods('2026-11-10',now));
});
test('team totals deduplicate leads across reps, honor boundaries and exclude failed outreach and unattributed sales',()=>{
 const report={from:'2026-11-09T05:00:00Z',to:'2026-11-10T05:00:00Z',rows:[{user_id:'a',name:'A',logged_seconds:3600,active_seconds:1800,hourly_cents:500},{user_id:'b',name:'B',logged_seconds:7200,active_seconds:3600,hourly_cents:0}]};
 const at='2026-11-09T14:00:00Z';
 const calls=[{user_id:'a',lead_id:'L',call_sid:'CA1',dialed_at:at},{user_id:'a',lead_id:'L',call_sid:'CA2',dialed_at:at},{user_id:'b',lead_id:'L',call_sid:'CA3',dialed_at:at},{user_id:'a',lead_id:'prepared',dialed_at:at}];
 const messages=[{user_id:'a',lead_id:'L',status:'accepted',provider_id:'m1',created_at:at},{user_id:'b',lead_id:'M',status:'accepted',provider_id:'m2',created_at:at},{user_id:'b',lead_id:'failed',status:'failed',provider_id:'m3',created_at:at},{user_id:'a',lead_id:'tomorrow',status:'accepted',provider_id:'m4',created_at:report.to}];
 const orders=[{sales_user_id:'a',paid_at:at},{sales_user_id:null,paid_at:at},{sales_user_id:'b',paid_at:null},{sales_user_id:'b',paid_at:report.to}];
 const r=O.combine(report,orders,calls,messages);assert.deepEqual(r.totals,{logged_seconds:10800,active_seconds:5400,hourly_cents:500,sales:1,leads_contacted:2});assert.equal(r.rows[0].leads_contacted,1);assert.equal(r.rows[1].leads_contacted,2);
});
test('non-admin cannot request team overview or reach data access',async()=>{
 await assert.rejects(O.overview(null,{admin:false},{}),e=>e.status===403);
});
