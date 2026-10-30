const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('clock sends presence without fabricating input, counts only work pages, logs out idle session',async()=>{
 let now=1000000,last=now,redirect,signouts=0;const callbacks=[],events={},requests=[];
 class Clock extends Date{constructor(v){super(v===undefined?now:v)}static now(){return now}}
 const ctx=vm.createContext({Date:Clock,Set,Error,AbortSignal,setInterval:(f,ms)=>{callbacks.push({f,ms});return callbacks.length},clearInterval(){},location:{replace:p=>redirect=p},document:{visibilityState:'visible',createElement:()=>({style:{},setAttribute(){},remove(){}}),body:{append(){}},addEventListener:(n,f)=>events[n]=f},fetch:async(url,options)=>{const b=JSON.parse(options.body);requests.push(b);if(b.active)last=now;return {ok:true,json:async()=>({server_now:new Clock().toISOString(),last_activity_at:new Clock(last).toISOString(),in_call:false})}}});
 vm.runInContext(fs.readFileSync('crm-activity-clock.mjs','utf8').replace('export async function','async function'),ctx);
 ctx.client={auth:{getSession:async()=>({data:{session:{access_token:'fake'}}}),signOut:async()=>{signouts++},onAuthStateChange(){}}};
 await vm.runInContext("startActivityClock(client,'leads')",ctx);assert.equal(requests[0].active,false);assert.equal(requests[0].work,true);
 events.keydown({isTrusted:false});now+=15000;callbacks.find(x=>x.ms===15000).f();await new Promise(r=>setImmediate(r));assert.equal(requests.at(-1).active,false);
 events.keydown({isTrusted:true});now+=15000;callbacks.find(x=>x.ms===15000).f();await new Promise(r=>setImmediate(r));assert.equal(requests.at(-1).active,true);
 now+=300001;callbacks.find(x=>x.ms===1000).f();await new Promise(r=>setImmediate(r));assert.equal(signouts,1);assert.match(redirect,/sales-login/);assert.equal(requests.at(-1).action,'logout');
});
