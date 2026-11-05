const {test}=require('node:test'),assert=require('node:assert/strict');
// Isolate pure calculation and presentation from external provider SDKs.
const U='00000000-0000-4000-8000-000000000001';
const data={};
require.cache[require.resolve('../lib/residential-server.cjs')]={exports:{fail:(m,s=400)=>Object.assign(Error(m),{status:s}),checked:r=>{if(r.error)throw Error(r.error);return r.data;}}};
require.cache[require.resolve('../lib/crm-sales.cjs')]={exports:{all:async(db,table)=>data[table]||[]}};
const P=require('../lib/crm-productivity.cjs');
test('flat amount and configurable thresholds validate precisely',()=>{
 const input={user_id:U,mode:'flat',flat_amount:123.45,lead_target:25,min_attempts:3};
 assert.deepEqual(Object.values(P.validatePlan(input)).slice(0,4),[U,12345,25,3]);
 for(const bad of [{flat_amount:0},{flat_amount:1.001},{lead_target:0},{lead_target:1.5},{min_attempts:0},{min_attempts:NaN}])assert.throws(()=>P.validatePlan({...input,...bad}));
});
test('contractor report strips time while admin retains it',async()=>{
 data.crm_pay_plans=[{id:U,user_id:U,mode:'hourly',hourly_cents:1000,effective_at:'2026-01-01T00:00:00Z'}];data.profiles=[{id:U,full_name:'Test'}];
 const db={rpc:async()=>({data:[{user_id:U,hours_seconds:3600,amount_cents:1000,windows:[{logged_seconds:3600}]}]})};
 const range={from:'2026-11-01T00:00:00Z',to:'2026-11-02T00:00:00Z'};
 const rep=(await P.report(db,{id:U,admin:false},range)).rows[0];
 for(const k of ['logged_seconds','active_seconds','hourly_seconds','sessions','qualification','average_gap_seconds'])assert.equal(k in rep,false,k);
 assert.equal(rep.hourly_cents,1000);
 const admin=(await P.report(db,{id:U,admin:true},range)).rows[0];assert.equal(admin.hourly_seconds,3600);assert.ok(admin.sessions);assert.ok(admin.qualification);
});
test('flat progress displays attempt count, exclusions and safe text',async()=>{
 const {flatBatches}=await import('../crm-flat-pay.mjs');
 const batch={plan:{id:U,flat_cents:10000,lead_target:2,min_attempts:3,effective_at:'2026-11-01'},qualified_count:1,leads:[{name:'<img onerror=alert(1)>',attempts:4,excluded:true},{name:'Ready',attempts:3,qualified:true}]};
 const html=flatBatches([batch],false);assert.match(html,/4 \/ 3/);assert.match(html,/Excluded · do not call/);assert.match(html,/&lt;img/);assert.doesNotMatch(html,/data-flat-approve/);
 batch.qualified_count=2;assert.match(flatBatches([batch],true),/data-flat-approve/);
 batch.payment={leads:batch.leads,paid_at:'2026-11-02',reference:'ACH-test'};assert.match(flatBatches([batch],false),/Paid/);assert.doesNotMatch(flatBatches([batch],true),/data-flat-paid/);
});
test('contractor UI renders without session data or hour totals',async()=>{
 const {mountProductivity,metrics}=await import('../crm-productivity.mjs');
 const row={user_id:U,name:'Test',plan:{mode:'flat',flat_cents:10000,lead_target:25},flat_batches:[],calls:3,answered_calls:1};
 const root={innerHTML:'',querySelector:()=>({}),querySelectorAll:()=>[]};
 await mountProductivity(root,async()=>({admin:false,rows:[row]}));
 assert.match(root.innerHTML,/100.00 per 25 qualifying leads/);assert.doesNotMatch(root.innerHTML,/Login sessions|Logged in|Active work|Hourly payable time/);
 assert.ok(metrics(row,true).some(([k])=>k==='Logged in'));
});
test('flat agreement has exact terms and no hourly or commission entitlement',async()=>{
 const {current}=require('../lib/seller-agreement.cjs');
 const db={from:()=>({select(){return this},eq(){return this},order(){return this},limit(){return this},async maybeSingle(){return {data:{id:U,mode:'flat',flat_cents:12345,lead_target:25,min_attempts:3,payment_terms:'After admin approval.'}}}})};
 const a=await current(db,{id:U});assert.match(a.text,/123.45/);assert.match(a.text,/25 distinct qualifying leads/);assert.match(a.text,/at least 3 outreach attempts/);assert.doesNotMatch(a.text,/3. Hourly compensation|3. Commission eligibility/);
});
