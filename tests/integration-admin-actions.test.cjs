const {test}=require('node:test'),assert=require('node:assert/strict');
const A=require('../lib/integration-assignments.cjs'),C=require('../lib/integration-catalog.cjs'),M=require('../api/turnly-mcp.js');
const id='11111111-1111-4111-8111-111111111111',base={id,expected_updated_at:'2026-11-17T12:00:00Z',reason:'Owner requested change'};
test('pay plan rejects invalid report range before any mutation',async()=>{
 const P=require('../lib/integration-platform.cjs');
 await assert.rejects(()=>P.invoke(null,id,C.actions['sales.set_pay_plan'],{user_id:id,mode:'hourly',hourly_rate:10},'key'),/from\/to/);
 assert.ok(C.actions['sales.productivity'].required.includes('from'));
});
test('job status cannot be used for payment or arbitrary fields',async()=>{
 let calls=0;const db={rpc:async()=>{calls++;return {data:{status:'completed'}};}};
 await assert.rejects(()=>A.run(db,id,'set_status',{...base,status:'paid'}),/payouts.record_external/);
 await assert.rejects(()=>A.run(db,id,'edit_details',{...base,data:{payment_status:'paid'}}));
 assert.equal(calls,0);
 const r=await A.run(db,id,'set_status',{...base,status:'completed'});assert.equal(r.assignment.status,'completed');assert.equal(calls,1);
});
test('schedule requires offset-aware ordered times and current revision',async()=>{
 const db={rpc:async()=>({error:{code:'P0001',message:'Assignment changed; read it again before retrying'}})};
 await assert.rejects(()=>A.run(db,id,'reschedule',{...base,start_window:'2026-11-19T09:00:00',end_window:'2026-11-19T17:00:00'}),/offset/);
 await assert.rejects(()=>A.run(db,id,'reschedule',{...base,start_window:'2026-11-19T09:00:00-05:00',end_window:'2026-11-19T08:00:00-05:00'}));
 await assert.rejects(()=>A.run(db,id,'set_status',{...base,status:'open'}),e=>e.status===409&&/changed/.test(e.message));
});
test('new privileged workflows stay unavailable to limited keys and no-delete connections cannot delete',()=>{
 const limited=M.definitions(['contractors:read'],{deny_record_deletion:true}).map(t=>t.name);
 assert.ok(!limited.includes('turnly_documents_review_onboarding'));
 const full=M.definitions(['platform:full'],{deny_record_deletion:true});
 for(const name of ['turnly_assignments_set_status','turnly_sales_team','turnly_sales_record_hourly_paid','turnly_documents_review_onboarding'])assert.ok(full.some(t=>t.name===name));
 assert.ok(!full.some(t=>/(delete|purge|destroy)/.test(t.name)));
 const r=M.toolRequest('turnly_documents_review_onboarding',{input:{action:'delete'},confirm:true,idempotency_key:'test1234'},{});
 assert.equal(r.query.action,'documents.review_onboarding');assert.equal(C.actions[r.query.action].action,'mobile_review');
});
