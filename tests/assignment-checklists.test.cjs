const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const template = { id:'template-one',name:'Full Turnover',department:'Cleaning',subdepartment:'Apartments',priority:'high',description:'Complete turnover',sections:[
  {id:'section-one',saved_module_id:'shared-module',title:'Kitchen',description:'Clean kitchen',sort_order:0,items:[{id:'task-one',label:'Clean counters',description:'Use safe product',type:'check',required:true}],rooms:[
    {id:'room-one',title:'Pantry',items:[{id:'photo-one',label:'Pantry photo',description:'After photo',type:'photo',required:true},{id:'note-one',label:'Optional note',type:'note',required:false}]}]}
]};
const assignment = { id:'job-one',title:'Unit Turnover',status:'open',property_id:'property-one',property_name:'Test Property',
  start_window:'2026-10-10T13:00:00Z',end_window:'2026-10-10T19:00:00Z',updated_at:'2026-10-08T12:00:00Z',
  metadata:{source:'property_manager_turn_request',checklist_template_id:'template-one',requested_by:'manager-one'},
  property_checklist_items:[{id:'old-item',category:'Kitchen',task:'Original task',required:true}],checklist_responses:[] };
const hook = `
window.checklistTest={
 setupTemplates(templates){checklistState.user={id:'admin-test'};checklistState.templates=templates;checklistState.builder=normalizeChecklistTemplate(templates[0]);checklistState.selectedTemplateId=templates[0].id;renderChecklistData();},
 builder:()=>checklistState.builder,
 open(row){assignmentState.user={id:'admin-test'};assignmentState.rows=[row];assignmentState.properties=[{id:'property-one',name:'Test Property',property_name:'Test Property'}];assignmentState.contractors=[];openAssignmentModal(row);},
 contractors(list){assignmentState.contractors=list;populateAssignmentContractorFilter();populateAssignmentAssignedContractorSelect();populateAssignmentContractorMenu();},
 payload:()=>collectAssignmentUpdatePayload(assignmentState.rows[0]),
 patch:()=>{try{return assignmentChecklistEditor.patch(assignmentState.rows[0],{status:assignmentState.rows[0].status,metadata:assignmentState.rows[0].metadata},'admin-test');}catch(error){return {error:error.message};}}
};`;

test('contractor drafts are isolated and stale checklists cannot autosave or submit', async()=>{
  const vm=require('node:vm');
  const source=fs.readFileSync(path.join(root,'contractor-job-flow-mobile.js'),'utf8');
  function extract(start,end){return source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));}
  const code=[
    extract('function checklistDraftStorageKey(', 'function parseChecklistDate('),
    extract('async function saveChecklistProgress(', 'function validateChecklistModule('),
    extract('async function assertCurrentChecklist(', 'async function submitAssignmentForQa('),
    extract('async function submitAssignmentForQa(', 'function contractorFeedbackPayload('),
  ];
  const context={activeAssignment:{id:'job',updated_at:'old',metadata:{checklist_revision:'one'}},activeUser:{id:'worker'},activeChecklistItems:[{}],
    checklistAutosaveInFlight:false,checklistAutosavePending:false,fetchAssignment:async()=>({id:'job',updated_at:'new',metadata:{checklist_revision:'two'}}),
    captureChecklistInputs(){},checklistDraftResponses:()=>[{completed:true}],saveLocalChecklistDraft:()=>{context.localSaved=true},
    ensureAssignmentQaJob:async()=> 'qa-one',activeQaJobId:null,
    setChecklistMessage:message=>{context.message=message},supabase:{rpc:async()=>{context.submitted=true;return {data:'qa-one'}},from:()=>{context.writes++;throw Error('unexpected write')}},writes:0};
  vm.createContext(context);vm.runInContext(code.join('\n'),context);
  const key=vm.runInContext('checklistDraftStorageKey()',context);
  assert.equal(key,'turnly:checklist-draft:job:worker:one');
  context.activeAssignment.metadata.checklist_revision='two';
  assert.notEqual(vm.runInContext('checklistDraftStorageKey()',context),key);
  context.activeAssignment.metadata.checklist_revision='one';
  await assert.rejects(vm.runInContext('submitAssignmentForQa([], "now")',context),/changed by an admin/);
  await vm.runInContext('saveChecklistProgress()',context);
  assert.equal(context.writes,0);assert.equal(context.localSaved,true);
  assert.match(context.message,/changed by an admin/);assert.equal(context.checklistAutosaveInFlight,false);
  context.fetchAssignment=async()=>{throw Error('Offline')};context.localSaved=false;
  await vm.runInContext('saveChecklistProgress()',context);
  assert.equal(context.localSaved,true);assert.match(context.message,/Offline/);
  context.fetchAssignment=async()=>({id:'job',updated_at:'new',metadata:{checklist_revision:'one',other:'preserved'}});
  await vm.runInContext('submitAssignmentForQa([], "now")',context);assert.equal(context.submitted,true);
  assert.equal(context.activeAssignment.updated_at,'new');assert.equal(context.activeAssignment.metadata.other,'preserved');
});

test('assignment checklist editing and independent whole checklist duplication', {timeout:90000}, async()=>{
  const server=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/'){
      const page=url.searchParams.get('page')||'assignments';
      const bundle=url.searchParams.get('bundle')||'admin-suite-20260708g.js';
      res.setHeader('Content-Type','text/html');return res.end(`<link rel="stylesheet" href="/admin-suite.css"><link rel="stylesheet" href="/residential-assignment.css"><body class="turnly-admin-suite" data-admin-page="${page}"><div id="adminSuiteApp"></div><script>window.__ENV={SUPABASE_URL:'https://test.invalid',SUPABASE_ANON_KEY:'test'};</script><script type="module" src="/${bundle}"></script>`);
    }
    const file=path.resolve(root,'.'+url.pathname);
    if(!file.startsWith(root+path.sep)){res.statusCode=403;return res.end();}
    try{let body=fs.readFileSync(file);if(/admin-suite-202607(?:08g|10a)\.js$/.test(file))body+=hook;
      res.setHeader('Content-Type',{'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css'}[path.extname(file)]||'application/octet-stream');res.end(body);
    }catch{res.statusCode=404;res.end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try{
    browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
    const page=await browser.newPage({viewport:{width:1440,height:1100}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm',route=>route.fulfill({contentType:'text/javascript',body:`
      window.db={assignment:${JSON.stringify(assignment)},templates:[${JSON.stringify(template)},${JSON.stringify({...template,id:'template-two',name:'Deep Clean'})}],writes:[],conflict:false,fail:false};
      export function createClient(){return {auth:{getUser:async()=>({data:{user:null}})},from(table){
        let mutation=null,filter={};
        const q={select(){return q},order(){return q},limit(){return q},eq(k,v){filter[k]=v;return q},single(){return q},maybeSingle(){return q},
        delete(){mutation={kind:'delete'};return q},update(row){mutation={kind:'update',row};return q},insert(row){mutation={kind:'insert',row};return q},then(resolve){
          if(mutation){
            if(window.db.fail)return Promise.resolve({data:null,error:{message:'Permission denied'}}).then(resolve);
            if(window.db.conflict || (filter.updated_at && filter.updated_at!==window.db.assignment.updated_at))return Promise.resolve({data:null}).then(resolve);
            window.db.writes.push({table,...mutation});
            if(mutation.kind==='delete'){window.db.templates=window.db.templates.filter(t=>t.id!==filter.id);return Promise.resolve({data:[{id:filter.id}]}).then(resolve);}

            const data=table==='assignment_blocks'?(window.db.assignment={...window.db.assignment,...mutation.row,updated_at:'2026-10-08T14:00:00Z'}):{...mutation.row,id:'copy-'+window.db.writes.length};
            return Promise.resolve({data}).then(resolve);
          }
          const data=table==='assignment_blocks'?window.db.assignment:table==='checklist_templates'?window.db.templates:table==='property_units'?window.db.unit||null:[];
          return Promise.resolve({data}).then(resolve);
        }};return q;
      }};}` }));
    const base=`http://127.0.0.1:${server.address().port}/`;
    await page.goto(base);
    await page.waitForFunction(()=>window.checklistTest);
    await page.evaluate(()=>window.checklistTest.open(window.db.assignment));
    await page.locator('#assignmentChecklistSelect').waitFor();
    assert.match(await page.locator('#assignmentChecklistEditor').innerText(),/Full Turnover/);
    await page.locator('#assignmentChecklistEditor summary').click();
    assert.match(await page.locator('#assignmentChecklistEditor').innerText(),/Original task/);
    assert.equal(await page.evaluate(()=>window.checklistTest.patch()),null);
    await page.locator('#assignmentChecklistSelect').selectOption('template-two');
    assert.match(await page.locator('#assignmentChecklistReplacement').innerText(),/Pantry photo/);
    await page.locator('#assignmentSaveBtn').click();
    await page.waitForFunction(()=>window.db.writes.length===1);
    const saved=await page.evaluate(()=>window.db.assignment);
    assert.equal(saved.property_checklist_items.length,3);
    assert.equal(saved.metadata.checklist_template_name,'Deep Clean');
    assert.equal(saved.metadata.requested_by,'manager-one');
    assert.deepEqual(saved.checklist_responses,[]);
    assert.equal(saved.metadata.checklist_history[0].items[0].task,'Original task');
    assert.ok(saved.metadata.checklist_revision);
    await page.evaluate(()=>window.checklistTest.open(window.db.assignment));
    await page.locator('#assignmentChecklistSelect').waitFor();
    assert.match(await page.locator('#assignmentChecklistEditor').innerText(),/Deep Clean/);

    // Only directory options populate all contractor controls; an existing worker is retained safely.
    await page.evaluate(()=>window.checklistTest.contractors([{id:'active',name:'Active Cleaner',email:'active@example.com',assignable:true},{id:'invite',name:'Invited Cleaner',assignable:false}]));
    assert.deepEqual(await page.locator('#assignmentContractorFilter option').evaluateAll(options=>options.map(o=>o.value)),['all','unassigned','active','invite']);
    assert.equal(await page.locator('#assignmentAssignedContractor option[value="invite"]').evaluate(el=>el.disabled),true);
    assert.equal(await page.locator('[data-assignment-contractor-option][data-contractor-id="invite"]').isDisabled(),true);
    await page.evaluate(()=>{window.db.assignment.assigned_to='old-worker';window.db.assignment.assigned_to_name='Former worker';window.checklistTest.open(window.db.assignment)});
    await page.locator('#assignmentChecklistSelect').waitFor();
    assert.equal(await page.locator('#assignmentAssignedContractor').inputValue(),'old-worker');
    assert.equal((await page.evaluate(()=>window.checklistTest.payload())).assigned_to,'old-worker');
    await page.evaluate(()=>{delete window.db.assignment.assigned_to;delete window.db.assignment.assigned_to_name;window.checklistTest.open(window.db.assignment)});
    await page.locator('#assignmentChecklistSelect').waitFor();

    // A concurrent contractor update must not be overwritten or reported as saved.
    await page.locator('#assignmentChecklistSelect').selectOption('template-one');
    await page.evaluate(()=>window.db.conflict=true);
    await page.locator('#assignmentSaveBtn').click();
    await page.waitForFunction(()=>document.querySelector('#assignmentFormMessage').textContent.includes('changed while'));
    assert.equal(await page.evaluate(()=>window.db.writes.length),1);
    await page.evaluate(()=>{window.db.conflict=false;window.db.assignment.status='in_progress';window.db.assignment.started_at='2026-10-08T14:00:00Z';window.db.assignment.checklist_responses=[{task:'Partial work',completed:true}];window.checklistTest.open(window.db.assignment)});
    await page.locator('#assignmentChecklistSelect').waitFor();
    await page.locator('#assignmentChecklistSelect').selectOption('template-one');
    assert.match((await page.evaluate(()=>window.checklistTest.patch())).error,/Confirm/);
    await page.locator('#assignmentChecklistReset').check();
    const reset=await page.evaluate(()=>window.checklistTest.patch());
    assert.equal(reset.payload.metadata.checklist_history.at(-1).responses[0].task,'Partial work');
    assert.deepEqual(reset.payload.checklist_responses,[]);

    await page.evaluate(()=>{window.db.assignment.status='qa_pending';window.checklistTest.open(window.db.assignment)});
    await page.getByText('This checklist is read-only', {exact:false}).waitFor();
    assert.equal(await page.locator('#assignmentChecklistSelect').count(),0);

    // Unit fallback shows the actual inherited checklist when no snapshot exists.
    await page.evaluate(()=>{window.db.assignment.status='open';window.db.assignment.property_checklist_items=[];window.db.assignment.unit_id='unit-one';window.db.unit={checklist_template_id:'template-one',checklist_items:[{task:'Unit-specific task'}]};window.checklistTest.open(window.db.assignment)});
    await page.locator('#assignmentChecklistSelect').waitFor();
    assert.match(await page.locator('#assignmentChecklistEditor').innerText(),/Inherited from this unit/);
    await page.setViewportSize({width:390,height:844});
    assert.ok(await page.locator('#assignmentChecklistSelect').isVisible());
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false);

    // Residential editor has focused fields and automatically selects an exact bed/bath checklist.
    await page.setViewportSize({width:1440,height:1100});
    await page.evaluate(()=>{
      window.db.assignment={id:'residential-one',title:'Home clean',status:'open',property_name:'Residential - Jane Doe',address:'1 Test Lane',service_type:'Deep clean',pay_amount:80,start_window:'2026-10-12T13:00:00Z',end_window:'2026-10-12T17:00:00Z',metadata:{source:'residential_booking',customer_name:'Jane Doe',beds:3,baths:2},property_checklist_items:[]};
      window.db.templates.push({...window.db.templates[0],id:'residential-template',name:'3 Bed / 2 Bath'});
      window.checklistTest.open(window.db.assignment);
    });
    await page.locator('#assignmentChecklistSelect').waitFor();
    assert.equal(await page.locator('#assignmentChecklistSelect').inputValue(),'residential-template');
    assert.equal(await page.locator('#property_name').inputValue(),'Jane Doe');
    assert.equal(await page.locator('#service_type').evaluate(el=>el.tagName),'SELECT');
    assert.equal(await page.locator('#priority').isVisible(),false);
    assert.equal(await page.locator('#propertySelect').isVisible(),false);
    assert.equal(await page.locator('#scope').isVisible(),false);
    assert.equal(await page.locator('[data-assignment-video-upload]').count(),0);
    assert.deepEqual(await page.locator('#assignment_frequency option').allTextContents(),['One time','Weekly','Bi-weekly','Monthly']);
    await page.locator('#assignment_frequency').selectOption('biweekly');
    const residentialPayload=await page.evaluate(()=>window.checklistTest.payload());
    assert.equal(residentialPayload.recurrence_frequency,'weekly');
    assert.equal(residentialPayload.recurrence_interval,2);
    assert.equal(residentialPayload.property_name,'Residential - Jane Doe');
    assert.equal(residentialPayload.metadata.customer_name,'Jane Doe');
    assert.equal(residentialPayload.start_window,'2026-10-12T13:00:00.000Z');
    const matched=await page.evaluate(()=>window.checklistTest.patch());
    assert.equal(matched.payload.metadata.checklist_template_id,'residential-template');
    await page.evaluate(()=>{window.db.assignment.metadata.beds=8;window.checklistTest.open(window.db.assignment)});
    await page.locator('#assignmentChecklistSelect').waitFor();
    assert.equal(await page.locator('#assignmentChecklistSelect').inputValue(),'');
    assert.equal(await page.evaluate(()=>window.checklistTest.patch()),null);
    await page.evaluate(()=>{window.db.assignment.metadata={};window.db.assignment.recurrence_frequency='daily';window.checklistTest.open(window.db.assignment)});
    assert.equal(await page.locator('#priority').isVisible(),true);
    assert.equal(await page.locator('#service_type').evaluate(el=>el.tagName),'INPUT');
    assert.equal(await page.locator('#assignment_frequency').inputValue(),'daily');

    for(const bundle of ['admin-suite-20260710a.js','admin-suite-20260708g.js']){
      await page.goto(base+'?page=checklists&bundle='+bundle);
      await page.waitForFunction(()=>window.checklistTest);
      await page.evaluate(()=>window.checklistTest.setupTemplates(window.db.templates));
      await page.locator('#checklist_template_name').fill('My Turnover');
      await page.locator('[data-checklist-duplicate]').click();
      await page.waitForFunction(()=>window.db.writes.length===1);
      const copy=await page.evaluate(()=>window.checklistTest.builder());
      assert.equal(copy.name,'My Turnover (Copy)');assert.notEqual(copy.id,template.id);
      assert.equal(copy.description,template.description);assert.equal(copy.priority.toLowerCase(),'high');
      const section=copy.sections[0];
      assert.notEqual(section.id,'section-one');assert.equal(section.saved_module_id,'');
      assert.notEqual(section.items[0].id,'task-one');assert.equal(section.items[0].description,'Use safe product');
      assert.notEqual(section.rooms[0].id,'room-one');
      assert.notEqual(section.rooms[0].items[0].id,'photo-one');assert.equal(section.rooms[0].items[0].type,'photo');
      assert.equal(section.rooms[0].items[1].required,false);
      assert.equal(await page.evaluate(()=>window.db.templates.find(t=>t.id==='template-one').name),'Full Turnover');
      assert.equal(await page.evaluate(()=>window.db.writes[0].kind),'insert');
      // Failure leaves the existing copy selected and provides an actionable error.
      await page.evaluate(()=>window.db.fail=true);
      await page.locator('[data-checklist-duplicate]').click();
      await page.getByText('Unable to duplicate checklist: Permission denied',{exact:true}).waitFor();
      assert.equal((await page.evaluate(()=>window.checklistTest.builder())).id,copy.id);
      assert.equal(await page.locator('[data-checklist-duplicate]').isEnabled(),true);
      // Cancel, denied deletion, then a confirmed delete; assignment snapshots remain untouched.
      const before=await page.evaluate(()=>window.db.assignment.property_checklist_items);
      page.once('dialog',dialog=>dialog.dismiss());
      await page.locator('[data-checklist-delete]').click();
      assert.equal((await page.evaluate(()=>window.checklistTest.builder())).id,copy.id);
      page.once('dialog',dialog=>dialog.accept());
      await page.locator('[data-checklist-delete]').click();
      await page.getByText('Unable to delete checklist: Permission denied',{exact:true}).waitFor();
      assert.equal((await page.evaluate(()=>window.checklistTest.builder())).id,copy.id);
      await page.evaluate(()=>window.db.fail=false);
      page.once('dialog',dialog=>dialog.accept());
      await page.locator('[data-checklist-delete]').click();
      await page.getByText(`Deleted ${copy.name} from the library. Existing assignment copies were kept.`,{exact:true}).waitFor();
      assert.equal(await page.locator('#checklistTemplateSelect').inputValue(),'');
      assert.equal(await page.locator('[data-checklist-delete]').isDisabled(),true);
      assert.deepEqual(await page.evaluate(()=>window.db.assignment.property_checklist_items),before);
      assert.equal(await page.evaluate(()=>window.db.writes.at(-1).table),'checklist_templates');
      assert.equal(await page.evaluate(()=>window.db.writes.at(-1).kind),'delete');

    }
    assert.deepEqual(errors,[]);
  }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
});
