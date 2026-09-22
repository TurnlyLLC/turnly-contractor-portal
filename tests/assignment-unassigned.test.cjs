const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');

test('new assignments can be posted unassigned, including after clearing a contractor', {timeout:60000}, async () => {
  const harness = `<link rel="stylesheet" href="/admin-suite.css"><body class="turnly-admin-suite" data-admin-page="assignments"><div id="adminSuiteApp"></div><script>window.__ENV={SUPABASE_URL:'https://test.invalid',SUPABASE_ANON_KEY:'test'};</script><script type="module" src="/admin-suite-20260708g.js"></script><script type="module" src="/assignment-contractor-source.js"></script>`;
  const server = http.createServer((req,res) => {
    const pathname = new URL(req.url,'http://localhost').pathname;
    if(pathname==='/') { res.setHeader('Content-Type','text/html');return res.end(harness); }
    const file=path.resolve(root,'.'+pathname);
    if(!file.startsWith(root+path.sep)){res.statusCode=403;return res.end();}
    try {
      let body=fs.readFileSync(file);
      if(pathname==='/admin-suite-20260708g.js') body += `\nwindow.assignmentTest={collect:collectAssignmentPayloads,open:()=>{assignmentState.user={id:'admin-test'};assignmentState.properties=[{id:'property-test',name:'Test Property',property_name:'Test Property'}];assignmentState.contractors=[{id:'contractor-test',name:'Test Contractor',email:'test@example.invalid'}];openAssignmentModal();}};`;
      res.setHeader('Content-Type',{'.js':'text/javascript','.css':'text/css'}[path.extname(file)]||'application/octet-stream');res.end(body);
    } catch {res.statusCode=404;res.end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try {
    browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
    const page=await browser.newPage({viewport:{width:1440,height:1100}});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm',route=>route.fulfill({contentType:'text/javascript',body:`
      window.savedAssignments=[];
      export function createClient(){return {auth:{getUser:async()=>({data:{user:null}})},from:table=>{
        let inserted=null;
        const query={select(){return this;},order(){return this;},limit(){return this;},insert(rows){inserted=rows;return this;},then(resolve){
          if(inserted){window.savedAssignments.push(...inserted);return Promise.resolve({data:inserted.map((row,i)=>({...row,id:'saved-'+window.savedAssignments.length+'-'+i}))}).then(resolve);}
          return Promise.resolve({data:table==='profiles'?[{id:'contractor-test',role:'contractor',contractor_approved:true,full_name:'Test Contractor',email:'test@example.invalid'}]:[]}).then(resolve);
        }};return query;
      }};}` }));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(()=>window.assignmentTest && document.body.innerText.includes('Sign in as an admin'));
    async function openForm(){
      await page.evaluate(()=>window.assignmentTest.open());
      await page.locator('#propertySelect').selectOption('property-test');
      await page.locator('#title').fill('Open pickup test');
      await page.locator('#start_window').fill('2026-09-23T09:00');
      await page.locator('#end_window').fill('2026-09-23T17:00');
    }
    function assertOpen(row){assert.equal(row.status,'open');assert.equal(row.visibility,'open');assert.ok(!row.assigned_to);assert.ok(!row.claimed_by);assert.equal(row.preferred_first,false);assert.deepEqual(row.preferred_contractor_ids,[]);}
    await openForm();
    assert.equal(await page.locator('#assignmentAssignedContractor').inputValue(),'');
    assert.equal(await page.locator('#preferred_first').isChecked(),false);
    await page.locator('#assignmentSaveBtn').click();
    await page.waitForFunction(()=>window.savedAssignments.length===1);
    assertOpen(await page.evaluate(()=>window.savedAssignments[0]));
    await openForm();
    await page.locator('#assignmentAssignedContractor').selectOption('contractor-test');
    assert.equal(await page.locator('#assignment_status').inputValue(),'claimed');
    const assigned=await page.evaluate(()=>window.assignmentTest.collect()[0]);
    assert.equal(assigned.assigned_to,'contractor-test');assert.equal(assigned.claimed_by,'contractor-test');
    await page.locator('#assignmentCompleteOnCreate').check();
    assert.equal(await page.locator('#assignment_status').inputValue(),'completed');
    await page.locator('#assignmentAssignedContractor').selectOption('');
    assert.equal(await page.locator('#assignment_status').inputValue(),'open');
    assert.equal(await page.locator('#assignmentCompleteOnCreate').isChecked(),false);
    await page.locator('#assignmentSaveBtn').click();
    await page.waitForFunction(()=>window.savedAssignments.length===2);
    assertOpen(await page.evaluate(()=>window.savedAssignments[1]));
    await openForm();
    await page.locator('#assignmentAssignedContractor').selectOption('contractor-test');
    await page.locator('#assignmentAssignedContractor').selectOption('');
    await page.locator('#assignment_frequency').selectOption('daily');
    await page.locator('#recurrence_end_date').fill('2026-09-25');
    const recurring=await page.evaluate(()=>window.assignmentTest.collect());
    assert.equal(recurring.length,3);recurring.forEach(assertOpen);
    await page.locator('#assignment_status').selectOption('completed');
    const invalid=await page.evaluate(()=>{try{window.assignmentTest.collect();return '';}catch(error){return error.message;}});
    assert.match(invalid,/choose Open status/);
    assert.deepEqual(errors,[]);
  } finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
});
