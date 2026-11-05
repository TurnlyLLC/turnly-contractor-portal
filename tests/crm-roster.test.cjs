const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const profiles=[{id:'active',full_name:'Active rep',role:'sales_team',status:'active',sales_member_deleted_at:null},{id:'deleted',full_name:'Former rep',role:'sales_team',status:'inactive',sales_member_deleted_at:'2026-11-01'}];
require.cache[require.resolve('../lib/crm-sales.cjs')]={exports:{all:async(db,table)=>table==='profiles'?profiles:[]}};
require.cache[require.resolve('../lib/residential-server.cjs')]={exports:{checked:r=>r.data,fail:m=>Error(m)}};
const R=require('../lib/crm-roster.cjs');
test('current roster and archives are disjoint; stale payroll edits are rejected',async()=>{
 assert.deepEqual((await R.members({},false)).map(p=>p.id),['active']);assert.deepEqual((await R.members({},true)).map(p=>p.id),['deleted']);
 await assert.rejects(R.requireMember({},'deleted',false),/Archives/);await R.requireMember({},'deleted',true);
});
test('productivity uses the same current and archived member selection',async()=>{
 const P=require('../lib/crm-productivity.cjs'),range={from:'2026-11-01',to:'2026-11-02'},user={id:'admin',admin:true};
 assert.deepEqual((await P.report({},user,range)).rows.map(r=>r.user_id),['active']);
 const archive=await P.report({},user,{...range,archived:true});assert.equal(archive.archived,true);assert.deepEqual(archive.rows.map(r=>r.user_id),['deleted']);
});
test('signed document includes the original content, signature metadata and safe escaping',async()=>{
 const {signedDocument}=await import('../crm-member-profile.mjs');const html=signedDocument({signer_name:'<script>x</script>',signed_at:'2026-11-01',version:'v1',agreement_hash:'abc',consent_text:'I agree',agreement_text:'Original signed terms'});
 assert.match(html,/Original signed terms/);assert.match(html,/Document hash: abc/);assert.match(html,/I agree/);assert.doesNotMatch(html,/<script>/);
});
test('ten distinct full scripts include discovery, close, follow-up, opt-out and payment verification',async()=>{
 const {FULL_SCRIPTS}=await import('../crm-full-scripts.mjs');assert.equal(FULL_SCRIPTS.length,10);assert.equal(new Set(FULL_SCRIPTS.map(s=>s.title)).size,10);
 for(const s of FULL_SCRIPTS){assert.equal(s.steps.length,13);assert.ok(s.text.length>3500);assert.match(s.text,/DO NOT CONTACT/);assert.match(s.text,/verified paid order/);assert.match(s.text,/\$100/);assert.match(s.text,/purchase link/);}
});
test('team UI exposes settings, documents and archives without archived edit controls',()=>{
 const source=fs.readFileSync('sales-portal.js','utf8'),body=source.slice(source.indexOf('function renderCrmTeam()'),source.indexOf('function renderTeamModal()'));
 const state={reps:[profiles[0]],rows:[],user:{id:'admin'},teamArchived:false};const context={state,isSalesAdmin:()=>true,normalize:v=>String(v||'').toLowerCase(),esc:v=>String(v||''),initials:()=>'',stageFor:()=>'',number:n=>n,metricCard:()=>''};
 vm.createContext(context);vm.runInContext(body,context);let html=context.renderCrmTeam();assert.match(html,/crmTeamOnboarding/);assert.match(html,/data-team-profile/);assert.match(html,/data-team-view="archives"/);
 state.teamArchived=true;state.reps=[profiles[1]];html=context.renderCrmTeam();assert.match(html,/crmHourlyPay/);assert.doesNotMatch(html,/data-team-delete|data-team-edit|data-team-create/);assert.match(source,/teamView.dataset.teamView==='archives'/);
});
test('full scripts render as separate readable branches next to outreach scripts',async()=>{
 const {FULL_SCRIPTS}=await import('../crm-full-scripts.mjs'),source=fs.readFileSync('sales-portal.js','utf8'),body=source.slice(source.indexOf('function renderScriptsPage()'),source.indexOf('function renderPlaybookPage()'));
 const context={state:{libraryKind:'full',librarySearch:'',libraryCategory:'all'},FULL_SCRIPTS,SALES_SCRIPTS:[],SALES_OBJECTIONS:[],knowledgeMatches:()=>true,esc:v=>String(v||''),emptyState:()=>''};vm.createContext(context);vm.runInContext(body,context);
 const html=context.renderScriptsPage();assert.match(html,/Full scripts \(10\)/);assert.match(html,/Permission-based opening/);assert.match(html,/data-copy-kind="full"/);assert.match(html,/grid-template-columns:1fr/);
});
