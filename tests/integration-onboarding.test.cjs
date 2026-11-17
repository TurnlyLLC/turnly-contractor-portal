const test=require('node:test'),assert=require('node:assert/strict');
const {state,checklist,run}=require('../lib/integration-onboarding.cjs');
test('background uploads and self-attestation do not complete a check',()=>{
 assert.equal(state({kind:'background'},{status:'approved',source:'contractor'}),'todo');
 assert.equal(state({kind:'background'},{status:'approved',source:'admin'}),'done');
 assert.equal(state({kind:'background'},{status:'rejected',source:'admin'}),'rejected');
});
test('signing versions, expiration and pending review retain portal semantics',()=>{
 assert.equal(state({kind:'sign',min_version:2},{version:1,source:'contractor',status:'complete'}),'resign');
 assert.equal(state({kind:'upload'},{status:'approved',expirationDate:'2026-01-01'},'2026-11-17'),'expired');
 assert.equal(state({kind:'upload'},{status:'pending'}),'in_review');
 assert.equal(state({kind:'form'},null),'todo');
});
test('safe checklist does not expose form answers and preserves waiver meaning',()=>{
 const result=checklist({items:[{id:'w9',kind:'upload',required:true,submission:{id:'s',status:'approved',source:'admin',reviewerNote:'[Portal requirement override] approved exception',answers:{ssn:'SECRET'}}}]});
 assert.equal(result.complete,true);assert.equal(result.items[0].waived,true);
 assert.equal(JSON.stringify(result).includes('SECRET'),false);
});
test('unknown operations and malformed IDs fail before accessing the database',async()=>{
 await assert.rejects(run({},'actor','delete',{profile_id:'not-id'},'key'),/Choose a contractor/);
 await assert.rejects(run({},'actor','delete',{profile_id:'a9f7d5cb-3b26-4300-aea5-caa3cfd18765'},'key'),/Unknown onboarding/);
});
test('intake detail exposes ordinary submitted answers while preserving sensitive masking',()=>{
 const {details}=require('../lib/integration-contractor-review.cjs');
 const r=details({contact:{name:'Example'},items:[{id:'intake',title:'Intake',kind:'form',submission:{id:'s',fields:[{id:'name',label:'Name',value:'Example'},{id:'tax',label:'Tax ID',value:'SECRET',sensitive:true,masked:'***1234'}]}}]});
 assert.equal(r.contact.name,'Example');assert.equal(r.items[0].submission.fields[0].value,'Example');assert.equal(r.items[0].submission.fields[1].value,null);assert.ok(!JSON.stringify(r).includes('SECRET'));
});
