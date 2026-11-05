const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const moduleStub={exports:{}};
vm.runInNewContext(fs.readFileSync('lib/contractor-crm.cjs','utf8'),{module:moduleStub,exports:moduleStub.exports,require:name=>name.includes('residential-server')?{stripe(){}}:{uuid:v=>typeof v==='string'&&/^[a-f\d-]{36}$/i.test(v)}});
const {run}=moduleStub.exports;
const actor='a9f7d5cb-3b26-4300-aea5-caa3cfd18765',id='11111111-1111-4111-8111-111111111111';
test('access changes use the server-verified actor, not a client-supplied actor',async()=>{
 let call;const db={rpc:async(name,args)=>{call={name,args};return {data:{roles:args.p_roles}}}};
 const result=await run(db,actor,{action:'access_save',id,actor:id,roles:['contractor','brand_ambassador']});
 assert.equal(call.name,'admin_set_app_access');assert.equal(call.args.p_actor,actor);assert.equal(call.args.p_user,id);assert.equal(result.roles.length,2);
});
test('invalid role grants fail before any database mutation',async()=>{
 let calls=0;const db={rpc:async()=>{calls++;}};
 for(const roles of [[],['owner'],['contractor',null],'admin'])await assert.rejects(()=>run(db,actor,{action:'access_save',id,roles}),/at least one supported role/);
 assert.equal(calls,0);
});
test('database access rejection is surfaced without claiming success',async()=>{
 await assert.rejects(()=>run({rpc:async()=>({error:{message:'This admin account must retain Admin access'}})},actor,{action:'access_save',id,roles:['contractor']}),/must retain Admin access/);
});
