const {test}=require('node:test');
const assert=require('node:assert/strict');
const {apply,inspect}=require('../lib/contractor-document-policy.cjs');
function fixture(){
 const items=[{id:'item_ced841d17ce84a29941a',title:'Form W-9',kind:'form',required:true,active:true,requiresReview:true,fields:[{id:'name',required:true}]},{id:'item_b4c00555d2ca4674bd1f',title:'Bank Verification',kind:'upload',required:true,active:true,requiresReview:true},{id:'coi',title:'General Liability Insurance (COI)',required:true,active:true,requiresReview:true},{id:'background',title:'Background Check',required:true,active:true,requiresReview:true}];
 const calls=[];const transport=async(url,o)=>{assert.equal(o.headers['X-Supabase-Auth'],'admin-session');calls.push({url,...o});if(o.method==='GET')return {ok:true,status:200,json:async()=>({items})};const body=JSON.parse(o.body);const row=items.find(i=>url.endsWith('/'+i.id));assert(row);Object.assign(row,body);return {ok:true,status:200,json:async()=>({ok:true})};};
 return {items,calls,transport};
}
test('only W9 and bank review settings change; submission requirements and COI stay intact',async()=>{
 const f=fixture(),result=await apply('admin-session',f.transport);assert.equal(result.ready,true);
 assert(f.items.every(i=>i.required));assert.equal(f.items[2].requiresReview,true);assert.equal(f.items[3].requiresReview,true);assert.deepEqual(f.items[0].fields,[{id:'name',required:true}]);assert.equal(f.calls.filter(c=>c.method!=='GET').length,2);
 await apply('admin-session',f.transport);assert.equal(f.calls.filter(c=>c.method!=='GET').length,2);
});
test('changed templates fail closed before any mutation',async()=>{
 const f=fixture();f.items[0].title='Different document';await assert.rejects(apply('admin-session',f.transport),/changed/);assert(f.calls.every(c=>c.method==='GET'));
});
test('only unsupported verbs permit fallback; authorization or validation failure aborts',async()=>{
 for(const status of [400,401,403,500]){const f=fixture();let writes=0;await assert.rejects(apply('admin-session',async(u,o)=>{if(o.method==='GET')return f.transport(u,o);writes++;return {ok:false,status,json:async()=>({error:'Rejected'})};}));assert.equal(writes,1);}
 const f=fixture();const result=await apply('admin-session',async(u,o)=>o.method==='PATCH'?{ok:false,status:405}:f.transport(u,o));assert.equal(result.ready,true);assert.equal(f.calls.filter(c=>c.method==='PUT').length,2);
});
test('successful HTTP response without saved policy is not reported as applied',async()=>{
 const f=fixture();await assert.rejects(apply('admin-session',async(u,o)=>o.method==='GET'?f.transport(u,o):{ok:true,status:200,json:async()=>({ok:true})}),/could not be confirmed/);
});
