const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('blocked members recheck on timer and focus, stop polling once ready',async()=>{
 const {startOnboardingUnlock}=await import('../crm-onboarding-unlock.mjs');let tick,focus,blocked=true,calls=0;
 const stop=startOnboardingUnlock({blocked:()=>blocked,refresh:async()=>{calls++;blocked=false},visible:()=>true,timers:{setInterval(f,ms){tick=f;assert.equal(ms,5000);return 1},clearInterval(){}},events:{addEventListener(n,f){focus=f},removeEventListener(){}}});
 await tick();assert.equal(calls,1);await focus();assert.equal(calls,1);blocked=true;await focus();assert.equal(calls,2);stop();blocked=true;await tick();assert.equal(calls,2);
});
test('network errors retry without granting access or overlapping requests',async()=>{
 const {startOnboardingUnlock}=await import('../crm-onboarding-unlock.mjs');let tick,calls=0,finish;
 const stop=startOnboardingUnlock({blocked:()=>true,visible:()=>true,refresh:async()=>{calls++;await new Promise(r=>finish=r);throw Error('offline')},timers:{setInterval(f){tick=f},clearInterval(){}},events:{addEventListener(){},removeEventListener(){}}});
 const first=tick();await tick();assert.equal(calls,1);finish();await first;const second=tick();assert.equal(calls,2);finish();await second;stop();
});
test('lead redirect and both calling stages use the effective onboarding gate',()=>{
 const portal=fs.readFileSync('sales-portal.js','utf8'),voice=fs.readFileSync('lib/crm-voice.cjs','utf8');
 assert.match(portal,/state.onboarding.ready&&\(state.page==='onboarding'/);assert.match(portal,/previouslyBlocked&&state.page==='guide'/);assert.match(portal,/location.replace\('sales-leads.html'\)/);
 assert.equal((voice.match(/await T.requireComplete\(db,user\)/g)||[]).length,2);
});
