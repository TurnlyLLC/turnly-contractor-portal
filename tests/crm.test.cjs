const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
let source=fs.readFileSync('sales-portal.js','utf8').replace(/\r/g,'').replace(/import[\s\S]*?from\s+["'][^"']+["'];/g,'');
const cut=source.indexOf('bindEvents();\n\nif (await requireSalesAccess())');
source=source.slice(0,cut)+source.slice(source.indexOf('function renderCrmOverview()',cut));
source=fs.readFileSync('crm-sales-content.mjs','utf8').replace(/export /g,'')+'\n'+source;
function fixture(profile={role:'sales',status:'active'}){
 const db={rpc:async()=>({data:{active:true,session_valid:true,must_change_password:false}}),auth:{getUser:async()=>({data:{user:{id:'staff',user_metadata:{role:'admin'}}}})},from:()=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:profile})})};
 const context={console,setTimeout,clearTimeout,URL,URLSearchParams,Date,Intl,Map,Set,Number,String,Math,JSON,window:{__ENV:{SUPABASE_URL:'test',SUPABASE_ANON_KEY:'test'},location:{},localStorage:{getItem:()=>null}},localStorage:{getItem:()=>null},document:{getElementById:()=>null,body:{dataset:{salesPage:'dashboard'}}},createClient:()=>db,verifyAdminPreviewSession:async()=>null};
 vm.createContext(context);vm.runInContext(source+'\nglobalThis.T={state,requireSalesAccess,isSalesAdmin,renderCrmOverview,renderCrmPipeline,renderCrmContacts,renderCrmTeam,baseFilteredRows,loadSalesCollection,updateStage,assignmentPlan,renderAssignmentModal,payloadFromUpload,renderSidebar,renderLeadsPage,renderLeadFocusMode,renderScriptsPage,renderPlaybookPage,pagedProspects,knowledgeMatches,handleOutreachForm,renderContactCard,loadRows,refreshData,withCrmTimeout,renderLoadFailure};',context);return context;
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

test('gift sales navigation and workflow remove retired tabs and support large prospect lists',()=>{
 const t=fixture().T;t.state.profile={role:'admin'};t.state.reps=[];
 t.state.rows=Array.from({length:5676},(_,i)=>({id:String(i),property_name:'Realtor '+i,prospect_type:'realtor',business_segment:'residential',pipeline_stage:'new_leads'}));
 let html=t.renderLeadsPage();assert.equal((html.match(/data-lead-select="/g)||[]).length,50);assert.match(html,/Select first 2000 matches/);
 t.state.prospectPage=114;assert.equal(t.pagedProspects(t.state.rows).rows.length,26);
 const nav=t.renderSidebar();for(const label of ['Contacts','Walkthroughs','Agent partners','Proposals','Closing'])assert.ok(!nav.includes('>'+label+'<'));
 assert.match(nav,/Scripts/);const overview=t.renderCrmOverview();assert.ok(!overview.includes('sales-walkthroughs.html'));
});
test('library contains varied scripts and objections and filters without losing content',()=>{
 const t=fixture().T;assert.match(t.renderScriptsPage(),/18 outreach scripts and 60 objection responses/);
 t.state.libraryKind='objections';t.state.librarySearch='refund';let html=t.renderScriptsPage();assert.match(html,/refund/);assert.ok(!html.includes('Can I reload a card?'));
 t.state.librarySearch='';t.state.libraryCategory='Boundaries';html=t.renderScriptsPage();assert.match(html,/Stop calling/);assert.ok(!html.includes('bulk discount'));
 const guide=t.renderPlaybookPage();assert.match(guide,/Why realtors may choose/);assert.match(guide,/One gift card can be applied/);
});
test('realtor contact card includes alternate contacts, escapes source notes and suppresses calling for opt-outs',()=>{
 const t=fixture().T,row={id:'r',property_name:'Realtor',referral_agent_id:'a',contact_phone:'9195550100',contact_email:'agent@example.test',source_contact:{phone_2:'9195550200',email_3:'alt@example.test',notes:'<script>bad()</script>'}};
 let html=t.renderContactCard(row);assert.match(html,/9195550200/);assert.match(html,/alt@example.test/);assert.ok(!html.includes('<script>'));
 html=t.renderContactCard({...row,do_not_contact:true});assert.ok(!html.includes('href="tel:'));assert.ok(!html.includes('href="mailto:'));
});

test('temporary-password and stale-session accounts cannot enter CRM screens',async()=>{
 for(const access of [{active:true,session_valid:true,must_change_password:true},{active:true,session_valid:false,must_change_password:false}]){
  const c=fixture({role:'sales_team',status:'active'});c.gate=access;vm.runInContext('supabase.rpc=async()=>({data:gate})',c);
  assert.equal(await c.T.requireSalesAccess(),false);assert.equal(c.window.location.href,access.must_change_password?'crm-password.html':'sales-login.html');
 }
});


test('Team loads lightweight lead ownership only, without contact history requests',async()=>{
 const c=fixture();c.T.state.page='team';vm.runInContext(`globalThis.calls=[];supabase.from=(table)=>({select(value){calls.push([table,value]);return this},eq(){return this},order(){return this},async range(){return {data:[]}}})`,c);
 await c.T.loadRows();assert.equal(c.calls.length,1);assert.equal(c.calls[0][0],'sales_leads');assert.ok(c.calls[0][1].includes('sales_owner_id'));assert.ok(!c.calls[0][1].includes('*'));
});
test('a stalled request exits loading with a retry action and a retry recovers',async()=>{
 const c=fixture(),t=c.T;
 await assert.rejects(t.withCrmTimeout(new Promise(()=>{}),5),/took too long/);
 vm.runInContext(`render=()=>{};loadRows=async()=>{throw new Error('Loading took too long. Please retry.')};loadReps=async()=>[];`,c);
 await t.refreshData(true,true);assert.equal(t.state.loading,false);assert.equal(t.state.loadFailed,true);assert.match(t.renderLoadFailure(),/data-retry-workspace/);
 vm.runInContext(`loadRows=async()=>({leads:[],tasks:[],activities:[]})`,c);
 await t.refreshData(true,true);assert.equal(t.state.loading,false);assert.equal(t.state.loadFailed,false);
});
