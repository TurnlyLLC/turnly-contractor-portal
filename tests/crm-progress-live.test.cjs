const {test}=require('node:test'),assert=require('node:assert/strict');
test('live progress responds to outreach, other tabs and focus; pauses hidden and cleans up',async()=>{
 const {watchProgress}=await import('../crm-progress-live.mjs');
 const doc=new EventTarget(),win=new EventTarget();doc.hidden=false;doc.activeElement=null;
 let tick,cleared=false,calls=0;
 const root={isConnected:true,contains:()=>false},env={document:doc,window:win,setInterval(fn,ms){assert.equal(ms,30000);tick=fn;return 1},clearInterval(){cleared=true}};
 const flush=()=>new Promise(r=>setImmediate(r));
 const stop=watchProgress(root,async()=>{calls++},()=>true,env);
 doc.dispatchEvent(new Event('crm-outreach-updated'));await flush();assert.equal(calls,1);
 const storage=new Event('storage');storage.key='crm-outreach-updated';win.dispatchEvent(storage);await flush();assert.equal(calls,2);
 doc.hidden=true;await tick();assert.equal(calls,2);
 doc.hidden=false;win.dispatchEvent(new Event('focus'));await flush();assert.equal(calls,3);
 root.isConnected=false;await tick();assert.equal(cleared,true);
 doc.dispatchEvent(new Event('crm-outreach-updated'));await flush();assert.equal(calls,3);stop();
});
test('refresh requests never overlap and one pending update follows slow response',async()=>{
 const {watchProgress}=await import('../crm-progress-live.mjs');
 const doc=new EventTarget(),win=new EventTarget();let tick,release,calls=0;
 const root={isConnected:true,contains:()=>false};
 const stop=watchProgress(root,()=>{calls++;return new Promise(r=>release=r)},()=>true,{document:doc,window:win,setInterval(fn){tick=fn;return 1},clearInterval(){}});
 const first=tick();await tick();await tick();assert.equal(calls,1);
 release();await first;assert.equal(calls,2);stop();release();
});
test('provider triggers are wired only after accepted send and during call callbacks',()=>{
 const fs=require('fs'),s=fs.readFileSync(require('path').join(__dirname,'../sales-portal.js'),'utf8');
 assert.match(s,/onStatus:\(\)=>\{notifyOutreach\(\)/);
 assert.match(s,/notifyOutreach\(\);state.modal=\{type:'sendSuccess'/);
});
