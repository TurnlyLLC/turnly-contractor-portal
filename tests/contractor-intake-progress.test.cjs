const {test}=require('node:test'),assert=require('node:assert/strict');
const drafts=require('../lib/contractor-draft-status.cjs');
test('saved progress changes only unfinished forms, never completion or review decisions',async()=>{
 let owner,columns;
 const db={from:()=>({select(c){columns=c;return this;},eq(k,v){owner=v;return Promise.resolve({data:['intake','signed','review','rejected','upload'].map(item_id=>({item_id,revision:2,updated_at:'2026-11-12'}))});}})};
 const file={complete:false,doneCount:1,items:[{id:'intake',kind:'form',state:'todo'},{id:'signed',kind:'sign',state:'done'},{id:'review',kind:'form',state:'in_review'},{id:'rejected',kind:'form',state:'rejected'},{id:'upload',kind:'upload',state:'todo'}]};
 const result=await drafts.attach(db,'owner',file);assert.equal(owner,'owner');assert(!columns.includes('ciphertext'));assert.deepEqual(result.items.map(i=>i.state),['in_progress','done','in_review','rejected','todo']);assert.equal(result.complete,false);assert.equal(result.doneCount,1);
});
test('submission captures autofill, changed selections and confirmations without input events',async()=>{
 const {captureForm,validationIssue}=await import('../contractor-onboarding-model.mjs');
 const controls={'[data-field]':[{dataset:{field:'name'},type:'text',value:'Test Person'},{dataset:{field:'agreed'},type:'checkbox',checked:true}], '[data-multi]':[{dataset:{multi:'days'},checked:true,value:'Monday'}],'[data-confirm]':[{dataset:{confirm:'name'},value:'Test Person'}]};
 const form={querySelectorAll:s=>controls[s]||[],querySelector:()=>({value:'Test Person'})},e={fields:{},confirm:{}};
 captureForm(form,e);assert.deepEqual(e.fields,{name:'Test Person',agreed:true,days:['Monday']});assert.equal(e.signerName,'Test Person');assert.equal(validationIssue({fields:[{id:'name',label:'Name',required:true,confirm:true}]},e.fields,e.confirm),null);
});
test('resumed drafts identify the exact missing confirmation section; optional blank confirmations do not block signing',async()=>{
 const {validationIssue}=await import('../contractor-onboarding-model.mjs');
 const item={fields:[{id:'email',label:'Email',section:'Contact',required:true,confirm:true},{id:'optional',label:'Optional',confirm:true},{id:'conditional',label:'Hidden',required:true,when:{ref:'extra',value:'yes'}}]};
 assert.equal(validationIssue(item,{email:'test@example.com'},{},null).field.section,'Contact');
 assert.equal(validationIssue(item,{email:'test@example.com'},{email:'test@example.com'},null),null);
 assert.equal(validationIssue(item,{}, {},'Contact').field.id,'email');
});
