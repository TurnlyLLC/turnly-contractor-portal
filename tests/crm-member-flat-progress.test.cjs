const {test}=require('node:test'),assert=require('node:assert/strict');
const U='00000000-0000-4000-8000-000000000001',V='00000000-0000-4000-8000-000000000002';
const plan={id:U,user_id:U,mode:'flat',flat_cents:10000,lead_target:500,min_attempts:3,effective_at:'2026-01-01'};
const batch={plan,qualified_count:5,leads:[{lead_id:U,name:'Owned prospect',attempts:3,qualified:true},{lead_id:V,name:'Private reassigned prospect',attempts:4,qualified:true}]};
require.cache[require.resolve('../lib/residential-server.cjs')]={exports:{checked:r=>r.data,fail:m=>Error(m)}};
require.cache[require.resolve('../lib/crm-sales.cjs')]={exports:{all:async(db,table,fields,scope)=>{
 const filters=[];const q={eq(k,v){filters.push([k,v]);return this},lt(){return this},gte(){return this},gt(){return this}};scope(q);
 if(table==='crm_pay_plans'){assert.deepEqual(filters,[['user_id',U]]);return [plan];}
 if(table==='sales_leads'){assert.deepEqual(filters,[['sales_owner_id',U]]);return [{id:U}];}
 return [];
}}};
test('member batches stay self-scoped, lifetime counts retained, reassigned details hidden',async()=>{
 const P=require('../lib/crm-productivity.cjs');
 const r=await P.report({rpc:async(name,args)=>{assert.equal(name,'crm_flat_progress');assert.deepEqual(args,{p_plan:U});return {data:structuredClone(batch)}}},{id:U,admin:false},{from:'2026-11-16',to:'2026-11-20'});
 const b=r.rows[0].flat_batches[0];assert.equal(b.qualified_count,5);assert.equal(b.leads[0].can_open,true);assert.equal(b.leads[1].can_open,false);assert.equal(b.leads[1].lead_id,undefined);assert.doesNotMatch(JSON.stringify(r),/Private reassigned/);
 for(const key of ['sessions','logged_seconds','active_seconds','hourly_seconds'])assert.equal(key in r.rows[0],false);
});
test('progress shows remaining, authorized deep links, and no member approval actions',async()=>{
 const {flatBatches}=await import('../crm-flat-pay.mjs');
 let b=structuredClone(batch);b.leads[0].can_open=true;b.leads[1].can_open=false;
 const html=flatBatches([b],false);assert.match(html,/<h3>495<\/h3>/);assert.match(html,new RegExp('sales-leads.html#'+U));assert.doesNotMatch(html,new RegExp('sales-leads.html#'+V));assert.doesNotMatch(html,/data-flat-approve/);
 b.qualified_count=501;assert.match(flatBatches([b],false),/<h3>0<\/h3>/);
 b.payment={leads:b.leads,paid_at:'2026-11-19'};assert.match(flatBatches([b],false),/Qualified · approved/);assert.match(flatBatches([b],false),/Paid/);
});
test('lead filters combine text and qualification',async()=>{
 const {bindFlatPay}=await import('../crm-flat-pay.mjs');
 const rows=[{textContent:'Alpha',dataset:{state:'qualified'}},{textContent:'Beta',dataset:{state:'excluded'}}],search={value:''},filter={value:'qualified'};
 const batch={querySelector:s=>s.includes('search')?search:filter,querySelectorAll:()=>rows};
 bindFlatPay({querySelectorAll:s=>s==='[data-flat-batch]'?[batch]:[]},()=>{},()=>{});
 filter.onchange();assert.equal(rows[0].hidden,false);assert.equal(rows[1].hidden,true);
 search.value='Beta';search.oninput();assert.equal(rows[0].hidden,true);
 filter.value='excluded';filter.onchange();assert.equal(rows[1].hidden,false);
});
