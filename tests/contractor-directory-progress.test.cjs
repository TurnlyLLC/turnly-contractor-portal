const {test}=require('node:test'),assert=require('node:assert/strict');
const {academy,combine}=require('../lib/contractor-directory-progress.cjs');
const rows=(id)=>Array.from({length:12},(_,n)=>({profile_id:id,module_number:n+1,lessons_done:5,score:n===11?89:90,waived:false}));
test('Academy measures actual lessons and passing quizzes without inflating waived progress',()=>{
 const r=rows('a'),p=academy(r,'a');assert.equal(p.lessons,60);assert.equal(p.quizzes,11);assert.equal(p.percent,98);assert.equal(p.complete,false);
 r[11].score=90;assert.equal(academy(r,'a').percent,100);
 const waived=r.map(x=>({...x,lessons_done:0,score:0,waived:true}));const w=academy(waived,'a');assert.equal(w.percent,0);assert.equal(w.complete,false);assert.equal(w.requirementComplete,true);assert.equal(w.waived,true);
});
test('Unrelated mobile accounts and one incomplete training record cannot hide everyone',()=>{
 const t=[academy(rows('a'),'a'),academy([],'b')];const r=combine([{id:'a'},{id:'b'}],[{userId:'retired',complete:true,doneCount:9,requiredCount:9},{userId:'a',complete:true,doneCount:8,requiredCount:8},{userId:'b',complete:false,doneCount:2,requiredCount:8}],t);
 assert.equal(r.length,2);assert.equal(r[0].onboarding.done,8);assert.equal(r[0].onboarding.total,8);assert.equal(r[0].onboarding.complete,true);assert.equal(r[0].complete,false);assert.equal(r[1].onboarding.done,2);assert.equal(t[1].available,false);
});
test('Invalid or missing checklist counts are unknown, never fabricated zero or full completion',()=>{
 for(const p of [{},{requiredCount:0,doneCount:0},{requiredCount:3,doneCount:4}])assert.equal(combine([{id:'a'}],[{userId:'a',...p}],[])[0].onboarding.available,false);
});
test('Progress controls expose accessible labels, escape names and distinguish unknown data',async()=>{
 const {progressButton,academyDetails}=await import('../contractor-progress.mjs');const p={key:'abc',name:'<Name>'};
 assert.match(progressButton(p,'onboarding',{available:true,done:2,total:8}),/25% complete/);assert.match(progressButton(p,'onboarding',{available:true,done:2,total:8}),/fill="none" stroke="#e0eaf0"/);assert.doesNotMatch(progressButton(p,'training',{}),/0%/);assert.match(progressButton(p,'training',{}),/&lt;Name&gt;/);assert.match(academyDetails(academy(rows('a'),'a')),/89%.*Needs 90%/);
});
