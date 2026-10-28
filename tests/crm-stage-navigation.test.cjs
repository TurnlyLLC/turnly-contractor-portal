const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('sales-portal.js','utf8');
test('sales navigation reveals onboarding, then playbook, then workspace; Team stays admin only',()=>{
 const state={profile:{role:'sales'},onboarding:null};const ctx={state,normalize:s=>s};vm.createContext(ctx);
 const start=source.indexOf('function workspaceUnlocked()'),end=source.indexOf('\n}',source.indexOf('function isSalesAdmin()',start))+2;
 vm.runInContext(source.slice(start,end),ctx);
 const visible=()=>['onboarding','guide','overview','messages','earnings','team'].filter(key=>ctx.visibleSalesTab(key)&&(!['team'].includes(key)||ctx.isSalesAdmin()));
 assert.deepEqual(visible(),['onboarding']);state.onboarding={signature:{},ready:false};assert.deepEqual(visible(),['onboarding','guide']);state.onboarding.ready=true;assert.deepEqual(visible(),['onboarding','guide','overview','messages','earnings']);state.profile.role='admin';assert.ok(visible().includes('team'));
});
