const {test}=require('node:test'),assert=require('node:assert/strict');
test('feedback groups use stable property/customer IDs and never infer identity from names',async()=>{
 const {organizeFeedback,filterFeedback}=await import('../feedback-groups.mjs');
 const rows=organizeFeedback({properties:[{id:'p1',name:'Same name'},{id:'p2',name:'Same name'}],customers:[{id:'c',name:'Jane',email:'jane@example.com'}],responses:[{id:'1',portal_property_id:'p1',rating:5},{id:'2',resident_feedback_cards:{portal_property_id:'p2'},rating:2},{id:'3',customer_id:'c',resident_feedback_cards:{portal_property_id:'p1'},rating:4},{id:'4',property_name:'Same name',rating:5}]});
 assert.equal(rows.find(r=>r.id==='3').segment,'residential');assert.equal(rows.find(r=>r.id==='4').segment,'unlinked');
 assert.equal(new Set(rows.map(r=>r.groupKey)).size,4);
 assert.equal(filterFeedback(rows,{segment:'commercial',rating:'low'}).length,1);
 assert.equal(filterFeedback(rows,{segment:'residential',search:'jane@example.com'}).length,1);
});
test('admin linking validates identifiers and clears the alternate owner; unauthenticated requests cannot access records',async()=>{
 const S=require('../lib/residential-server.cjs'),api=require('../api/admin-resident-feedback');
 const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',owner='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';let patch;
 const db={from(table){const q={select(){return q},eq(){return q},maybeSingle:async()=>({data:{id:owner}}),update(p){patch=p;return q},then(resolve){return Promise.resolve({data:[{id}]}).then(resolve)}};return q;}};
 await api.handle(db,{action:'link',id,owner_id:owner,segment:'residential'});assert.deepEqual(patch,{customer_id:owner,portal_property_id:null});
 await api.handle(db,{action:'link',id,owner_id:owner,segment:'commercial'});assert.deepEqual(patch,{customer_id:null,portal_property_id:owner});
 await assert.rejects(api.handle(db,{action:'link',id:'bad',owner_id:owner,segment:'commercial'}));
 const database=S.database;S.database=()=>({from(){throw Error('Must not query before auth')}});
 try{let status;await api({method:'POST',headers:{},body:{action:'list'}},{setHeader(){},set statusCode(v){status=v},end(){}});assert.equal(status,401);}finally{S.database=database;}
});
