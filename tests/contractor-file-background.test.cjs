const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {run}=require('../api/contractor-review.js');
test('file background approval completes tracked checklist before reporting document approval; failure stays incomplete',async()=>{
 const owner=randomUUID(),actor=randomUUID(),id=randomUUID(),events=[];
 const doc={id,profile_id:owner,storage_path:'uploads/background.pdf',document_type:'background_check',title:'Verified First V1234567',updated_at:'2026-11-10T12:00:00Z'};
 let item={id:'bg',kind:'background',title:'Background Check',required:true,state:'todo'},failSync=false;
 const db={from:table=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:table==='contractor_documents'?doc:{id:owner,role:'contractor'}})}),rpc:async(name)=>{events.push(name);return {data:{operation_id:'operation'}}}};
 const transport=async(url,options)=>{if(url.endsWith('/mark')){events.push('mark');if(failSync)throw Error('offline');item={...item,state:'done',submission:{source:'admin',reviewerNote:JSON.parse(options.body).note}};}return {ok:true,json:async()=>({complete:item.state==='done',items:[item]})};};
 const input={action:'review_document',id,status:'approved',auto_match:true,updated_at:doc.updated_at,background_version:0,background_reference:'V1234567',background_confirm:true};
 await assert.rejects(run(db,actor,{...input,background_confirm:false},'token',transport),/confirm/);assert.equal(events.length,0);
 await assert.rejects(run(db,actor,{...input,updated_at:'2020-01-01'},'token',transport),/changed/);assert.equal(events.length,0);
 doc.expiration_date='2020-01-01';await assert.rejects(run(db,actor,input,'token',transport),/unexpired/);assert.equal(events.length,0);delete doc.expiration_date;
 await run(db,actor,input,'token',transport);
 assert.deepEqual(events,['begin_contractor_background_review','mark','finish_contractor_background_review','review_contractor_document']);
 assert.equal(item.state,'done');events.length=0;failSync=true;
 await assert.rejects(run(db,actor,input,'token',transport),/synchronization needs a retry/);
 assert(!events.includes('finish_contractor_background_review'));assert(!events.includes('review_contractor_document'));
});
