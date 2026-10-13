const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const eligibility=require('../lib/contractor-pay-eligibility.cjs');
function load(file,quickbooks,extra=''){const context={module:{exports:{}},require:name=>name.includes('eligibility')?eligibility:quickbooks,console,Date};vm.runInNewContext(fs.readFileSync(require.resolve(file),'utf8')+extra,context);return context.module.exports;}
test('owed pay excludes unfinished recurring visits even with inherited payout flags or completion dates',()=>{
 const api=load('../api/finance-summary.js',{},'\nmodule.exports.items=contractorPayItems;');
 const base={pay_amount:100,property_name:'Home',payment_status:'unpaid',recurrence_frequency:'weekly',completed_at:'2026-10-01T12:00:00Z',metadata:{payment:{status:'approved_for_pay'}}};
 const statuses=['open','preferred_pending','pending','draft','claimed','in_progress','qa_pending','cancelled','canceled','declined','closed'];
 const rows=statuses.map((status,i)=>({...base,id:String(i),status}));
 rows.push({...base,id:'finished',status:'completed'},{...base,id:'paid',status:'completed',payment_status:'paid'},{...base,id:'old-paid',status:'completed',metadata:{payment:{paid:true}}});
 const items=api.items(rows,[],[]);assert.equal(items.length,1);assert.equal(items[0].assignmentId,'finished');assert.equal(items.reduce((sum,r)=>sum+r.amount,0),100);
});
test('mark paid rejects unfinished jobs and checks status again on write',async()=>{
 for(const scenario of ['open','completed','changed']){
 let wrote=false,filtered=false,response;
 const db={from(){let mutation=false;const q={select(){return q},eq(){return q},in(key,values){assert.equal(key,'status');assert.deepEqual(values,eligibility.completedStatuses);filtered=true;return q},update(){mutation=true;wrote=true;return q},maybeSingle:async()=>({data:mutation?(scenario==='changed'?null:{id:'job'}):{id:'job',status:scenario==='open'?'open':'completed',pay_amount:100}})};return q;}};
 const handler=load('../api/finance-mark-contractor-paid.js',{getSupabaseAdmin:()=>({client:db}),requireAdmin:async()=>({user:{id:'admin'}}),readJsonBody:async()=>({assignmentId:'job',amount:100}),sendJson:(res,status,body)=>{response={status,body}}});
 await handler({method:'POST'},{});
 assert.equal(response.status,scenario==='completed'?200:409);assert.equal(wrote,scenario!=='open');assert.equal(filtered,scenario!=='open');
 }
});
