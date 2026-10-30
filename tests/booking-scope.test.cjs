const {test}=require('node:test');
const assert=require('node:assert/strict');
const Scope=require('../lib/booking-scope.cjs');
const handler=require('../api/residential-booking.js');
const accepted=service=>({service,scope_service:service,scope_version:Scope.policy(service).version,scope_reviewed:true,scope_accepted:true});
test('each service uses its published scope and preserves an auditable snapshot',()=>{
 for(const service of ['standard','deep','move','listing']){
  const input=accepted(service),record=Scope.accept(input);
  assert.equal(record.scope,service==='standard'?'standard':'deep');
  assert.match(record.policy_html,/Not included/);
  assert.match(record.policy_html,/24 hours/);
  assert.match(record.version,/^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(Scope.accept(input),record,'retries retain the same request hash');
 }
 assert.notEqual(Scope.policy('standard').version,Scope.policy('deep').version);
});
test('missing, stale or different-service acceptance is rejected',()=>{
 const valid=accepted('standard');
 for(const override of [{scope_accepted:false},{scope_reviewed:false},{scope_accepted:'true'},{scope_version:'old'},{service:'deep'},{scope_service:'deep'}])assert.throws(()=>Scope.accept({...valid,...override}),/Review and accept/);
 assert.throws(()=>Scope.accept({...accepted('move'),service:'invalid'}),/Choose a cleaning service/);
});
test('API blocks requests and checkout before storage or payment work without acceptance',async()=>{
 for(const action of ['checkout','request']){
  const res={setHeader(){},end(body){this.body=JSON.parse(body);}};
  await handler({method:'POST',body:{action,service:'standard'},headers:{}},res);
  assert.equal(res.statusCode,400);assert.match(res.body.error,/Review and accept/);
 }
});
