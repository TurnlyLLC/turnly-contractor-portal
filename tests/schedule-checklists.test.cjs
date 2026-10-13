const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
test('Schedule previews, attaches and preserves checklists with conflict protection',async()=>{
 const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/') {res.setHeader('Content-Type','text/html');return res.end(`<div id="scheduleAssignmentModal"><div id="scheduleAssignmentModalBody"></div></div><script>window.__ENV={SUPABASE_URL:'https://example.test',SUPABASE_ANON_KEY:'test'}</script><script type="module" src="/schedule-live.js"></script>`);}
  const file=path.join(root,url.pathname);let body=fs.readFileSync(file,'utf8');
  if(url.pathname==='/schedule-live.js')body+=`\nwindow.scheduleTest={async open(){state.rows=[structuredClone(window.db.row)];state.detailAssignmentId=window.db.row.id;document.getElementById('scheduleAssignmentModalBody').innerHTML=scheduleAssignmentDetail(state.rows[0]);await scheduleChecklistEditor.open(state.rows[0]);document.querySelector('[data-schedule-checklist-form]').onsubmit=e=>{e.preventDefault();saveScheduleChecklist(e.target)};}};`;
  res.setHeader('Content-Type','text/javascript');res.end(body);
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});const page=await browser.newPage();
 await page.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm',r=>r.fulfill({contentType:'text/javascript',body:`
 window.db={row:{id:'one',status:'open',updated_at:'old',metadata:{customer_name:'Test'},property_checklist_items:[{task:'Existing task'}]},writes:0};
 export function createClient(){return {auth:{getUser:async()=>({data:{user:{id:'admin'}}})},from(table){let payload,filters={};const q={select(){return q},eq(k,v){filters[k]=v;return q},is(k,v){filters[k]=v;return q},order(){return q},single(){return q},maybeSingle(){return q},update(p){payload=p;return q},then(resolve){if(payload){if(window.db.conflict)return Promise.resolve({data:null}).then(resolve);window.db.writes++;window.db.row={...window.db.row,...payload,updated_at:'new'};}return Promise.resolve({data:table==='assignment_blocks'?window.db.row:table==='checklist_templates'?[{id:'clean',name:'Standard checklist',sections:[{id:'kitchen',title:'Kitchen',items:[{id:'task',label:'Clean sink',required:true}]}]}]:null}).then(resolve)}};return q}};}` }));
 await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.scheduleTest);await page.evaluate(()=>scheduleTest.open());
 await page.locator('#assignmentChecklistEditor summary').click();assert.match(await page.locator('#assignmentChecklistEditor').innerText(),/Existing task/);
 await page.locator('#assignmentChecklistSelect').selectOption('clean');await page.getByRole('button',{name:'Save Changes'}).click();await page.waitForFunction(()=>db.writes===1);
 assert.equal(await page.evaluate(()=>db.row.property_checklist_items[0].task),'Clean sink');assert.equal(await page.evaluate(()=>db.row.metadata.customer_name),'Test');
 await page.evaluate(()=>scheduleTest.open());assert.match(await page.locator('#assignmentChecklistEditor').innerText(),/Standard checklist/);
 await page.locator('#assignmentChecklistSelect').selectOption('clean');await page.evaluate(()=>db.conflict=true);await page.getByRole('button',{name:'Save Changes'}).click();await page.waitForFunction(()=>document.querySelector('[data-checklist-message]').textContent.includes('changed'));assert.equal(await page.evaluate(()=>db.writes),1);
 await page.evaluate(()=>{db.row.status='completed';return scheduleTest.open()});assert.equal(await page.locator('#assignmentChecklistSelect').count(),0);assert.match(await page.locator('#assignmentChecklistEditor').innerText(),/read-only/);
 }finally{await browser?.close();await new Promise(r=>server.close(r))}
});
