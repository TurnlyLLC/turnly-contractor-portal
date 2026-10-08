const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const {randomUUID}=require('node:crypto');
const helpers=require('../lib/agent-referrals.cjs');

function harness({role='admin',status='active',configured=true,consent=true,providerFailure=false,writeFailure=false,agentStatus='new'}={}){
  const agent={id:randomUUID(),name:'Jane Agent',email:'jane@example.com',email_2:'alt@example.com',phone:'+19195550100',sms_consent:consent,status:agentStatus,referral_code:null};
  const deliveries=[],calls=[],writes=[];
  const client={auth:{getUser:async()=>({data:{user:{id:randomUUID(),user_metadata:{role:'admin'}}}})},
    from(table){
      const q={filters:[],op:'read',value:null,select(){return q},order(){return q},limit(){return q},range(){return q.run()},eq(k,v){q.filters.push([k,v]);return q},
        insert(v){q.op='insert';q.value=v;return q},update(v){q.op='update';q.value=v;return q},
        async run(){
          if(table==='profiles')return {data:{role,status}};
          if(table==='referral_settings')return {data:{template_path:'template.pdf',updated_at:'2026-10-08',qr_x:70,qr_y:68,qr_size:20}};
          if(table==='referral_agents'){if(q.op==='update')Object.assign(agent,q.value);return {data:agent};}
          if(table==='referral_deliveries'){
            if(q.op==='insert'){const row={id:randomUUID(),status:'processing',...q.value};deliveries.push(row);writes.push(row);return {data:row};}
            const row=deliveries.find(d=>q.filters.every(([k,v])=>d[k]===v));
            if(q.op==='update'){if(writeFailure)return {error:{code:'db_down'}};Object.assign(row,q.value);}
            return {data:row||null};
          }
          return {data:[]};
        },single(){return q.run()},maybeSingle(){return q.run()},then(ok,no){return q.run().then(ok,no)}};return q;
    },
    storage:{from(){return {download:async()=>({data:{arrayBuffer:async()=>new ArrayBuffer(1)}}),upload:async()=>({data:{}}),getPublicUrl:()=>({data:{publicUrl:'https://example.com/flyer.pdf'}})}}}
  };
  const sandbox={module:{exports:{}},Buffer,console,URLSearchParams,AbortSignal,process:{env:{SUPABASE_SERVICE_ROLE_KEY:'test-only',...(configured?{RESEND_API_KEY:'test-only',REFERRAL_FROM_EMAIL:'sales@example.com',TWILIO_ACCOUNT_SID:'test-only',TWILIO_AUTH_TOKEN:'test-only',TWILIO_MESSAGING_SERVICE_SID:'test-only'}:{})}},
    require(name){if(name==='@supabase/supabase-js')return {createClient:()=>client};if(name==='../lib/agent-referrals.cjs')return {...helpers,makeFlyer:async()=>Buffer.from('test flyer')};return require(name);},
    fetch:async(url,options)=>{calls.push({url,options});if(providerFailure)throw new Error('Network timeout');return {ok:true,json:async()=>url.includes('twilio')?{sid:'SMtest',status:'queued'}:{id:'email-test'}};}
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../api/agent-referrals.js'),'utf8'),sandbox);
  return {agent,calls,deliveries,writes,async request(body,authenticated=true){let payload;const res={setHeader(){},end(v){payload=JSON.parse(v)}};await sandbox.module.exports({method:'POST',headers:authenticated?{authorization:'Bearer test'}:{},body},res);return {status:res.statusCode,payload};}};
}
test('sending requires real profile access and rejects forged user metadata roles',async()=>{
  const h=harness({role:'contractor'});const r=await h.request({action:'send',id:h.agent.id,request_id:randomUUID()});assert.equal(r.status,403);assert.equal(h.calls.length,0);
  const inactive=harness({status:'disabled'});assert.equal((await inactive.request({action:'list'})).status,403);
  assert.equal((await h.request({action:'list'},false)).status,401);
  const sales=harness({role:'sales'});assert.equal((await sales.request({action:'import',rows:[{name:'Jane',email:'jane@example.com'}]})).status,403);
  assert.equal((await sales.request({action:'list',admin_view:true})).status,403);
});
test('send returns each provider result and retries of the same request do not duplicate messages',async()=>{
  const h=harness();const body={action:'send',id:h.agent.id,request_id:randomUUID()};
  const result=await h.request(body);assert.equal(result.status,200);assert.deepEqual(result.payload.results.map(r=>r.status),['accepted','queued']);assert.equal(h.calls.length,2);
  assert.equal(result.payload.activated,true);assert.equal(h.agent.status,'active');assert.match(h.agent.referral_code,/^TA-/);
  assert.equal(h.deliveries.length,2);
  await h.request(body);assert.equal(h.calls.length,2);
  assert.match(h.calls[0].options.headers['Idempotency-Key'],/^agent-/);
  const email=JSON.parse(h.calls[0].options.body);assert.equal(email.to[0],h.agent.email);assert.ok(email.attachments[0].content);assert.ok(email.text.includes(helpers.referralUrl(h.agent.referral_code)));
});
test('missing configuration, missing text consent, and provider timeouts never report delivered',async()=>{
  const off=harness({configured:false});const unavailable=await off.request({action:'send',id:off.agent.id,request_id:randomUUID()});assert.equal(off.calls.length,0);assert.deepEqual(unavailable.payload.results.map(r=>r.status),['not_configured','not_configured']);
  assert.equal(off.agent.status,'new');assert.equal(unavailable.payload.activated,false);
  const noConsent=harness({consent:false});const partial=await noConsent.request({action:'send',id:noConsent.agent.id,request_id:randomUUID()});assert.equal(noConsent.calls.length,1);assert.equal(partial.payload.results[1].status,'failed');
  const fail=harness({providerFailure:true});const result=await fail.request({action:'send',id:fail.agent.id,request_id:randomUUID()});assert.deepEqual(result.payload.results.map(r=>r.status),['unknown','unknown']);
  assert.equal(fail.agent.status,'new');assert.equal(result.payload.activated,false);
  const dbFail=harness({writeFailure:true});const saved=await dbFail.request({action:'send',id:dbFail.agent.id,request_id:randomUUID()});assert.match(saved.payload.results[0].warning,/could not be saved/);
});
test('saved alternate recipient is allowed and arbitrary recipients are rejected',async()=>{
  const h=harness();const r=await h.request({action:'send',id:h.agent.id,request_id:randomUUID(),channels:['email'],email:h.agent.email_2});assert.equal(r.status,200);assert.equal(JSON.parse(h.calls[0].options.body).to[0],'alt@example.com');assert.equal(h.agent.status,'active');
  const rejected=harness();assert.equal((await rejected.request({action:'send',id:rejected.agent.id,request_id:randomUUID(),channels:['email'],email:'outside@example.com'})).status,400);assert.equal(rejected.calls.length,0);
});
