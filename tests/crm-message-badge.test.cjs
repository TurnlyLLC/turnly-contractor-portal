const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('badge appears, caps at 99+, survives rerender, clears on read and preserves count on failure',async()=>{
 let count=3,fail=false,badge={hidden:true,textContent:'',setAttribute(k,v){this[k]=v;}},listeners={};
 const ctx={paintDesktopControl(){},notifyDesktop:async()=>{},document:{hidden:false,querySelectorAll:s=>s==='[data-message-unread]'?[badge]:[],addEventListener:(k,v)=>listeners[k]=v},window:{addEventListener:(k,v)=>listeners[k]=v},setInterval:fn=>{listeners.poll=fn;}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync('crm-message-badge.mjs','utf8').replace(/^import[^\n]*\n/,'').replaceAll('export ',''),ctx);
 ctx.request=async()=>{if(fail)throw Error('offline');return {unread:count};};
 await vm.runInContext('startMessageBadge(request); refreshMessageBadge()',ctx);await new Promise(r=>setImmediate(r));
 assert.equal(badge.textContent,'3');assert.equal(badge.hidden,false);assert.equal(badge['aria-label'],'3 unread conversations');
 count=120;await vm.runInContext('refreshMessageBadge()',ctx);assert.equal(badge.textContent,'99+');
 badge={setAttribute(){}};vm.runInContext('paintMessageBadge()',ctx);assert.equal(badge.textContent,'99+');
 fail=true;await vm.runInContext('refreshMessageBadge()',ctx);assert.equal(badge.hidden,false);
 fail=false;count=0;await listeners.focus();assert.equal(badge.hidden,true);
 ctx.document.hidden=true;count=5;await listeners.poll();assert.equal(badge.hidden,false);
 ctx.document.hidden=false;await listeners.visibilitychange();assert.equal(badge.textContent,'5');
});

test('only new incoming activity alerts; baseline, read messages and repeated polls stay quiet',()=>{
 const ctx={};vm.createContext(ctx);vm.runInContext(fs.readFileSync('crm-message-badge.mjs','utf8').replace(/^import[^\n]*\n/,'').replaceAll('export ',''),ctx);
 const rows=[{id:'a',at:'2026-10-21T12:00:00Z',unread:true},{id:'b',at:'2026-10-21T12:00:00Z',unread:false}];ctx.rows=rows;
 assert.equal(vm.runInContext('incomingMessages(null,rows).length',ctx),0);
 assert.equal(vm.runInContext('incomingMessages({},rows).length',ctx),1);
 assert.equal(vm.runInContext("incomingMessages({a:'2026-10-21T12:00:00Z'},rows).length",ctx),0);
 assert.equal(vm.runInContext("incomingMessages({a:'2026-10-21T11:59:00Z'},rows).length",ctx),1);
});
test('notification chime requires unlocked audio and obeys mute',()=>{
 let starts=0,isMuted=false;const ctx={localStorage:{getItem:()=>String(isMuted)}};vm.createContext(ctx);vm.runInContext(fs.readFileSync('crm-message-badge.mjs','utf8').replace(/^import[^\n]*\n/,'').replaceAll('export ',''),ctx);
 vm.runInContext('chime()',ctx);assert.equal(starts,0);
 ctx.sound={state:'running',currentTime:0,destination:{},createOscillator:()=>({frequency:{},connect(){},start(){starts++},stop(){}}),createGain:()=>({gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}})};
 vm.runInContext('audio=sound;chime()',ctx);assert.equal(starts,2);isMuted=true;vm.runInContext('chime()',ctx);assert.equal(starts,2);
});
