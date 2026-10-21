const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('badge appears, caps at 99+, survives rerender, clears on read and preserves count on failure',async()=>{
 let count=3,fail=false,badge={hidden:true,textContent:'',setAttribute(k,v){this[k]=v;}},listeners={};
 const ctx={document:{hidden:false,querySelectorAll:()=>[badge],addEventListener:(k,v)=>listeners[k]=v},window:{addEventListener:(k,v)=>listeners[k]=v},setInterval:fn=>{listeners.poll=fn;}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync('crm-message-badge.mjs','utf8').replaceAll('export ',''),ctx);
 ctx.request=async()=>{if(fail)throw Error('offline');return {unread:count};};
 await vm.runInContext('startMessageBadge(request); refreshMessageBadge()',ctx);await new Promise(r=>setImmediate(r));
 assert.equal(badge.textContent,'3');assert.equal(badge.hidden,false);assert.equal(badge['aria-label'],'3 unread conversations');
 count=120;await vm.runInContext('refreshMessageBadge()',ctx);assert.equal(badge.textContent,'99+');
 badge={setAttribute(){}};vm.runInContext('paintMessageBadge()',ctx);assert.equal(badge.textContent,'99+');
 fail=true;await vm.runInContext('refreshMessageBadge()',ctx);assert.equal(badge.hidden,false);
 fail=false;count=0;await listeners.focus();assert.equal(badge.hidden,true);
 ctx.document.hidden=true;count=5;await listeners.poll();assert.equal(badge.hidden,true);
 ctx.document.hidden=false;await listeners.visibilitychange();assert.equal(badge.textContent,'5');
});
