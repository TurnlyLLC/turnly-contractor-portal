const {test}=require('node:test');
const assert=require('node:assert/strict');
const {run}=require('../lib/contractor-onboarding-preview.cjs');
const {seal}=require('../lib/contractor-onboarding.cjs');
const {access}=require('../api/contractor-review.js');
const id='17540504-00cb-4255-869d-c1ab959004ff';
test('preview rejects every mutation before any data or remote access',async()=>{
 for(const action of ['save','sign','upload','watched','confirm_personal_email','background_save'])await assert.rejects(run({}, {action,profile_id:id}),e=>e.status===403);
});
test('preview uses stored active admin authorization, not claimed metadata',async()=>{
 const db={auth:{getUser:async()=>({data:{user:{id,user_metadata:{role:'admin'}}}})},from:()=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:{id,role:'contractor',status:'active'}})})};
 await assert.rejects(access(db,{headers:{authorization:'Bearer token'}}),e=>e.status===403);
});
test('preview reads only the selected contractor draft and never writes',async()=>{
 const filters=[];const draft={fields:{name:'Example'},section:2};
 const db={from(table){return {select(){return this},eq(k,v){filters.push([table,k,v]);return this},maybeSingle:async()=>({data:table==='profiles'?{id,role:'contractor'}:{ciphertext:seal(draft,'secret',id+':intake'),revision:9}})}}};
 const transport=async(url,options)=>{assert.equal(options.method,'GET');assert(url.endsWith('/contractors/'+id));return {ok:true,json:async()=>({items:[{id:'intake',kind:'form'}]})};};
 const result=await run(db,{action:'draft',profile_id:id,item_id:'intake'},'admin','secret',transport);
 assert.deepEqual(result.draft,draft);assert.equal(result.revision,9);
 assert(filters.some(([t,k,v])=>t==='contractor_onboarding_drafts'&&k==='profile_id'&&v===id));
 await assert.rejects(run(db,{action:'draft',profile_id:id,item_id:'other'},'admin','secret',transport),e=>e.status===404);
});
