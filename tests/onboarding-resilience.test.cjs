const {test}=require('node:test'),assert=require('node:assert/strict');
const {createGuard}=require('../lib/onboarding-request-guard.cjs');
test('rapid status checks stop before database work; independent sessions and refill still work',()=>{
 let time=0;const check=createGuard({now:()=>time});
 for(let i=0;i<6;i++)check('session-a');
 assert.throws(()=>check('session-a'),e=>e.status===429&&e.retryAfter===10);
 check('session-b');time=10000;check('session-a');
 assert.throws(()=>check('session-a'),e=>e.status===429);
});
test('guard bounds memory and recovers after idle entries expire',()=>{
 let time=0;const check=createGuard({now:()=>time,maxEntries:2});
 check('a');check('b');assert.throws(()=>check('c'),e=>e.status===429);
 time=60000;check('c');
});
test('onboarding API throttles status without caching authentication or blocking saves',async()=>{
 const fs=require('node:fs'),vm=require('node:vm');let authenticated=0,executed=0;
 const context={module:{exports:{}},process:{env:{SUPABASE_SERVICE_ROLE_KEY:'test'}},AbortController,AbortSignal,setTimeout,clearTimeout,fetch,
 require:name=>name==='@supabase/supabase-js'?{createClient:()=>({})}:name.includes('diagnostics')?{createReporter:()=>()=>()=>{}}:name.includes('request-guard')?{createGuard}: {access:async(db,token)=>{authenticated++;if(token==='invalid')throw Object.assign(Error('Sign in'),{status:401});return {id:token};},run:async()=>{executed++;return {ok:true};}}};
 vm.runInNewContext(fs.readFileSync('api/contractor-onboarding.js','utf8'),context);
 async function call(action,token='a'){const headers={};const res={setHeader:(k,v)=>headers[k]=v,end:body=>res.body=JSON.parse(body)};await context.module.exports({method:'POST',headers:{authorization:'Bearer '+token},body:{action}},res);return {...res,headers};}
 for(let i=0;i<6;i++)assert.equal((await call('status')).statusCode,200);
 const blocked=await call('status');assert.equal(blocked.statusCode,429);assert.equal(blocked.headers['Retry-After'],'10');assert.equal(authenticated,6);assert.equal(executed,6);
 assert.equal((await call('save')).statusCode,200);assert.equal(authenticated,7);
 assert.equal((await call('status','invalid')).statusCode,401);assert.equal(executed,7);
});
test('network deadline aborts stalled login and preserves upstream cancellation',async()=>{
 const {fetchWithTimeout}=await import('../request-timeout.mjs');
 const stalled=(url,{signal})=>new Promise((resolve,reject)=>{if(signal.aborted)reject(signal.reason);else signal.addEventListener('abort',()=>reject(signal.reason),{once:true});});
 await assert.rejects(fetchWithTimeout('/login',{},5,stalled),/taking too long/);
 const controller=new AbortController();controller.abort(Error('cancelled'));
 await assert.rejects(fetchWithTimeout('/login',{signal:controller.signal},100,stalled),/cancelled/);
 const response={ok:true};assert.equal(await fetchWithTimeout('/login',{},100,async()=>response),response);
});
