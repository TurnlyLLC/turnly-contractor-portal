const {test}=require('node:test'),assert=require('node:assert/strict');
const plan={id:'current',mode:'flat',flat_cents:10000,lead_target:500,min_attempts:3};
const data=()=>({admin:false,rows:[{plan,flat_batches:[{plan,qualified_count:5}]}]});
test('overview uses current batch and shows 495 remaining with earnings link',async()=>{
 const {flatOverview}=await import('../crm-flat-overview.mjs');const d=data();
 d.rows[0].flat_batches.unshift({plan:{...plan,id:'old'},qualified_count:499});
 const html=flatOverview(d);assert.match(html,/<strong>495<\/strong>/);assert.match(html,/<strong>5<\/strong>/);assert.match(html,/href="crm-earnings.html"/);assert.doesNotMatch(html,/hours|clocked|logged_seconds/);
});
test('hidden for admins and other pay types; completed and paid states',async()=>{
 const {flatOverview}=await import('../crm-flat-overview.mjs');
 assert.equal(flatOverview({...data(),admin:true}),'');
 assert.equal(flatOverview({admin:false,rows:[{plan:{mode:'hourly'}}]}),'');
 const d=data();d.rows[0].flat_batches[0].qualified_count=600;
 assert.match(flatOverview(d),/<strong>0<\/strong>/);assert.match(flatOverview(d),/awaiting admin approval/);
 d.rows[0].flat_batches[0].payment={paid_at:'2026-11-19'};
 assert.match(flatOverview(d),/<strong>Paid<\/strong>/);
});
test('overview fetches existing scoped report and supports retry',async()=>{
 const {mountFlatOverview}=await import('../crm-flat-overview.mjs');const button={};const root={innerHTML:'',querySelector:()=>button};let attempts=0;
 await mountFlatOverview(root,async input=>{attempts++;assert.equal(input.action,'report');assert.ok(input.from&&input.to);assert.equal(input.user_id,undefined);if(attempts===1)throw Error('offline');return data()});
 assert.match(root.innerHTML,/Unable to load/);await button.onclick();assert.match(root.innerHTML,/495/);
});
