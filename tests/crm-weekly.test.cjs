const {test}=require('node:test'),assert=require('node:assert/strict');
const {summarizeWeekly}=require('../lib/crm-weekly.cjs');
test('weekly attribution deduplicates outreach and excludes failed, prepared, other-member and boundary activity',()=>{
 const start=Date.parse('2026-11-09T05:00:00Z'),end=start+7*86400000,t=new Date(start).toISOString();
 const calls=[{user_id:'a',lead_id:'l1',call_sid:'CA',dialed_at:t},{user_id:'a',lead_id:'l1',call_sid:'CB',dialed_at:t},{user_id:'a',lead_id:'prepared',created_at:t},{user_id:'b',lead_id:'other',call_sid:'CC',dialed_at:t},{user_id:'a',lead_id:'next',call_sid:'CD',dialed_at:new Date(end).toISOString()}];
 const messages=[{user_id:'a',lead_id:'l1',status:'accepted',channel:'email',created_at:t},{user_id:'a',lead_id:'l2',status:'accepted',channel:'sms',created_at:t},{user_id:'a',lead_id:'failed',status:'failed',channel:'sms',created_at:t}];
 const orders=[{id:'o',sales_user_id:'a',paid_at:t,quantity:2,amount_cents:20000,refunded_cents:5000},{id:'n',sales_user_id:'a',paid_at:new Date(end).toISOString(),quantity:1,amount_cents:10000}];
 const commissions=[{order_id:'o',sales_user_id:'a',status:'earned',amount_cents:1500},{order_id:'n',sales_user_id:'a',status:'earned',amount_cents:1000}];
 assert.deepEqual(summarizeWeekly('a',calls,messages,orders,commissions,start,end),{leads_contacted:2,emails_sent:1,texts_sent:1,sales_made:1,cards_sold:2,sales_cents:20000,refund_cents:5000,commission_cents:1500});
 assert.equal(summarizeWeekly('none',calls,messages,orders,commissions,start,end).sales_made,0);
 commissions[0].status='held';assert.equal(summarizeWeekly('a',calls,messages,orders,commissions,start,end).commission_cents,0);
});
test('Monday weeks and Eastern boundaries handle daylight savings and year rollover',async()=>{
 const {weekOf,reportRange}=await import('../crm-report-weeks.mjs');
 assert.deepEqual(weekOf('2026-11-15'),{from:'2026-11-09',to:'2026-11-15'});
 assert.deepEqual(weekOf('2027-01-01'),{from:'2026-12-28',to:'2027-01-03'});
 const spring=reportRange('2026-03-02','2026-03-08'),fall=reportRange('2026-10-26','2026-11-01');
 assert.equal((Date.parse(spring.to)-Date.parse(spring.from))/3600000,167);
 assert.equal((Date.parse(fall.to)-Date.parse(fall.from))/3600000,169);
});
test('team totals filter people and escape names, while employee metrics remain private',async()=>{
 const {weeklyOverview,metrics}=await import('../crm-productivity.mjs');
 const row={name:'<Rep>',logged_seconds:3600,hourly_cents:1500,plan:{mode:'commission'},sales_made:2};
 const html=weeklyOverview([row]);assert.ok(html.includes('&lt;Rep&gt;'));assert.ok(html.includes('$15.00'));assert.ok(html.includes('1.00 h'));
 assert.ok(weeklyOverview([row],'missing').includes('No matching sales members'));
 assert.ok(!metrics(row,false).some(([title])=>title==='Hourly earned'||title==='Paid sales'));
});
