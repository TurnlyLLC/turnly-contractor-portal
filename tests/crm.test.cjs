const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
let source=fs.readFileSync('sales-portal.js','utf8').replace(/\r/g,'').replace(/import[\s\S]*?from\s+["'][^"']+["'];/g,'');
const cut=source.indexOf('bindEvents();\n\nif (await requireSalesAccess())');
source=source.slice(0,cut)+source.slice(source.indexOf('function renderCrmOverview()',cut));
function fixture(profile={role:'sales',status:'active'}){
 const db={auth:{getUser:async()=>({data:{user:{id:'staff',user_metadata:{role:'admin'}}}})},from:()=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:profile})})};
 const context={console,URL,Date,Intl,Map,Set,Number,String,Math,JSON,window:{__ENV:{SUPABASE_URL:'test',SUPABASE_ANON_KEY:'test'},location:{},localStorage:{getItem:()=>null}},localStorage:{getItem:()=>null},document:{getElementById:()=>null,body:{dataset:{salesPage:'dashboard'}}},createClient:()=>db,verifyAdminPreviewSession:async()=>null};
 vm.createContext(context);vm.runInContext(source+'\nglobalThis.T={state,requireSalesAccess,isSalesAdmin,renderCrmOverview,renderCrmPipeline,renderCrmContacts,renderCrmTeam,baseFilteredRows,loadSalesCollection,updateStage,assignmentPlan,renderAssignmentModal,payloadFromUpload};',context);return context;
}
test('CRM access requires a permitted saved staff profile, never editable user metadata',async()=>{
 for(const profile of [null,{role:'contractor',status:'active'},{role:'sales',status:'disabled'},{role:'sales_team',status:'suspended'}]){const c=fixture(profile);assert.equal(await c.T.requireSalesAccess(),false);assert.equal(c.window.location.href,'sales-login.html');}
 for(const role of ['admin','sales','sales_team']){const c=fixture({role,status:'active'});assert.equal(await c.T.requireSalesAccess(),true);assert.equal(c.T.isSalesAdmin(),role==='admin');}
});
test('pipeline and contacts use real records, escape content, and filter by ownership and contact details',()=>{
 const c=fixture(),t=c.T;t.state.profile={role:'sales'};t.state.rows=[{id:'a',property_name:'<script>alert(1)</script>',contact_email:'person@example.com',contact_phone:'9195550100',sales_owner_id:'one',pipeline_stage:'contacted',lead_value:1200},{id:'b',property_name:'Other',sales_owner_id:'two',pipeline_stage:'active',lead_value:900}];
 t.state.search='person@example.com';assert.equal(t.baseFilteredRows().length,1);let html=t.renderCrmContacts();assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(html.includes('person@example.com'));
 t.state.search='';t.state.ownerFilter='one';html=t.renderCrmPipeline();assert.ok(html.includes('1 opportunities'));assert.ok(html.includes('data-crm-stage="a"'));assert.ok(!html.includes('data-crm-stage="b"'));assert.ok(!html.includes('New Prospect</button>'));
});
test('CRM views render useful empty states without invented records or results',()=>{const t=fixture().T;t.state.profile={role:'sales'};for(const render of [t.renderCrmOverview,t.renderCrmPipeline,t.renderCrmContacts,t.renderCrmTeam])assert.ok(render().length>100);assert.match(t.renderCrmPipeline(),/No opportunities here yet/);assert.match(t.renderCrmTeam(),/No team members/);});


test('CRM collection loader reads beyond the first database page',async()=>{
 const c=fixture();vm.runInContext(`supabase.from=()=>({select(){return this},eq(){return this},order(){return this},async range(from,to){return {data:Array.from({length:Math.max(0,Math.min(500,1201-from))},(_,i)=>({id:from+i}))}}})`,c);
 const result=await c.T.loadSalesCollection('sales_leads');assert.equal(result.data.length,1201);assert.equal(result.data[1200].id,1200);
});

test('every CRM collection is filtered at the database to residential parents',async()=>{
 const c=fixture();vm.runInContext(`globalThis.calls=[];supabase.from=(table)=>({select(value){calls.push([table,'select',value]);return this},eq(key,value){calls.push([table,'eq',key,value]);return this},order(){return this},async range(){return {data:[]}}})`,c);
 for(const table of ['sales_leads','sales_walkthroughs','sales_quotes','sales_contracts','sales_tasks','sales_activities'])await c.T.loadSalesCollection(table);
 assert.equal(c.calls.filter(row=>row[1]==='eq'&&row[3]==='residential').length,6);
 assert.ok(c.calls.some(row=>row[0]==='sales_leads'&&row[2]==='business_segment'));
 assert.equal(c.calls.filter(row=>row[2]==='sales_leads.business_segment').length,5);
 assert.equal(c.calls.filter(row=>String(row[2]).includes('!inner')).length,5);
});

test('operator splits are even, preserve assigned leads by default, and reject commercial or inactive selections',()=>{
 const t=fixture().T;t.state.user={id:'a'};t.state.reps=[{id:'a',role:'sales',status:'active'},{id:'b',role:'sales_team',status:'active'},{id:'disabled',role:'sales',status:'disabled'}];
 t.state.rows=Array.from({length:5},(_,i)=>({id:String(i),business_segment:'residential',sales_owner_id:i===4?'b':null}));
 const ids=t.state.rows.map(r=>r.id),plan=t.assignmentPlan(ids,['a','b'],true);
 assert.equal(plan.length,4);assert.deepEqual(Array.from(plan,r=>r.operatorId),['a','b','a','b']);
 assert.equal(t.assignmentPlan(ids,['a'],false).length,5);
 assert.throws(()=>t.assignmentPlan(ids,['disabled'],true),/active sales operators/);
 t.state.rows.push({id:'commercial',business_segment:'commercial'});
 assert.throws(()=>t.assignmentPlan(['commercial'],['a'],false),/residential/);
 t.state.ownerFilter='mine';t.state.rows[0].sales_owner_id='a';assert.equal(t.baseFilteredRows().length,1);
 t.state.ownerFilter='unassigned';assert.equal(t.baseFilteredRows().filter(r=>r.sales_owner_id).length,0);
 const imported=t.payloadFromUpload({name:'New residential lead',email:'test@example.com'},2).payload;
 assert.equal(imported.business_segment,'residential');assert.equal(imported.sales_owner_id,null);
});


test('pipeline stage change persists to existing records and writes an activity',async()=>{
 const c=fixture();c.T.state.rows=[{id:'lead',pipeline_stage:'new_leads'}];
 vm.runInContext(`globalThis.saved=[];saveRecord=async(id,payload,activity)=>saved.push({id,payload,activity});refreshData=async()=>{};setMessage=()=>{};`,c);
 await c.T.updateStage('lead','contacted');assert.equal(c.saved.length,1);assert.equal(c.saved[0].id,'lead');assert.equal(c.saved[0].payload.pipeline_stage,'contacted');assert.equal(c.saved[0].activity,'Moved to Contacted.');
});
