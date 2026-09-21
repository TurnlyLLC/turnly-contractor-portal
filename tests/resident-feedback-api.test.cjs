const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { createHash } = require('node:crypto');
const property = 'ad0c61b3-bd26-4169-8acf-67a695c038c4';
const batch = '5b30b916-7dab-4f4c-8a31-567fe4f3200d';

async function request(body, {signedIn=true,role='admin',rpcError=null}={}) {
  const calls=[];
  const client={
    auth:{getUser:async()=>({data:{user:{id:property,app_metadata:{role}}}})},
    from(table) {
      const query={select(){return query},eq(){return query},order(){return query},
        async maybeSingle(){return {data:table==='profiles'?{role}:{id:property,name:'Vetra Forest Hills'}}},
        async range(start,end){calls.push({table,start,end});return {data:[],count:0}}
      }; return query;
    },
    async rpc(name,args){calls.push({name,args});return {data:name==='delete_resident_feedback_batch'?{id:batch}: {property_name:'Vetra Forest Hills'},error:rpcError}}
  };
  const sandbox={module:{exports:{}},Buffer,console,process:{env:{SUPABASE_SERVICE_ROLE_KEY:'test-only'}},
    require(name){return name==='@supabase/supabase-js'?{createClient:()=>client}:name==='./resident-feedback-validation'?require('../api/resident-feedback-validation'):require(name)}
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../api/resident-feedback.js'),'utf8'),sandbox);
  let payload;
  const res={setHeader(){},end(value){payload=JSON.parse(value)}};
  await sandbox.module.exports({method:'POST',headers:{origin:'https://portal.turnlypros.com','content-type':'application/json',...(signedIn?{authorization:'Bearer test-only'}:{})},body},res);
  return {status:res.statusCode,payload,calls};
}

test('batch endpoints require verified admin access',async()=>{
  for(const action of ['list_batches','delete_batch','create_batch','update_batch_home']) {
    const body={action,batch_id:batch,confirm_delete:true,property_id:property,property_code:'VFH',start_number:1,count:2000};
    for(const [options,status] of [[{signedIn:false},401],[{role:'contractor'},403]]) {
      const result=await request(body,options);
      assert.equal(result.status,status);
      assert.equal(result.calls.length,0);
    }
  }
});
test('API creates all 2,000 secure links through one atomic RPC',async()=>{
  const result=await request({action:'create_batch',property_id:property,property_code:'VFH',start_number:100,count:2000});
  assert.equal(result.status,200);
  assert.equal(result.payload.cards.length,2000);
  assert.equal(result.payload.cards.at(-1).card_number,2099);
  assert.equal(new Set(result.payload.cards.map(c=>c.feedback_url)).size,2000);
  assert.equal(result.calls.length,1);
  assert.equal(result.calls[0].name,'create_resident_feedback_batch_with_home');
  assert.equal(result.calls[0].args.p_batch_id,result.payload.batch_id);
  for(let i=0;i<2000;i++) assert.equal(result.calls[0].args.p_token_hashes[i],createHash('sha256').update(result.payload.cards[i].feedback_url.split('/').at(-1)).digest('hex'));
});
test('list is paginated and failed deletion reports no success',async()=>{
  const list=await request({action:'list_batches',page:3});
  assert.equal(list.status,200);
  assert.equal(list.calls[0].start,40);
  assert.equal(list.calls[0].end,59);
  const removed=await request({action:'delete_batch',batch_id:batch,confirm_delete:true});
  assert.equal(removed.status,200);
  assert.equal(removed.calls[0].args.p_batch_id,batch);
  const failed=await request({action:'delete_batch',batch_id:batch,confirm_delete:true},{rpcError:{code:'test_failure'}});
  assert.equal(failed.status,503);
  assert.equal(failed.payload.ok,undefined);
});

test('quote context works without sign-in and reports lookup failures',async()=>{
  const token='a'.repeat(64);
  const result=await request({action:'quote_context',token},{signedIn:false});
  assert.equal(result.status,200);
  assert.equal(result.payload.context.property_name,'Vetra Forest Hills');
  assert.equal(result.calls[0].name,'get_resident_feedback_quote_context');
  assert.equal(result.calls[0].args.p_token,token);
  const failed=await request({action:'quote_context',token},{signedIn:false,rpcError:{code:'test_failure'}});
  assert.equal(failed.status,503);
  assert.equal(failed.payload.ok,undefined);
});
