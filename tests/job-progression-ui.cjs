const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
test('contractor can open maps, retry denied GPS, start and submit to the complete summary',async()=>{
 const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/'){res.setHeader('Content-Type','text/html');return res.end('<button data-start-assignment-id="job">Review job</button><div id="message"></div><script>window.__ENV={SUPABASE_URL:"https://test.invalid",SUPABASE_ANON_KEY:"test"};</script><script type="module" src="/contractor-job-flow-mobile.js"></script>');}
  const file=path.resolve(root,'.'+url.pathname);if(!file.startsWith(root+path.sep)){res.statusCode=403;return res.end();}
  try{res.setHeader('Content-Type',/\.(js|mjs)$/.test(file)?'text/javascript':'text/plain');res.end(fs.readFileSync(file));}catch{res.statusCode=404;res.end();}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
 for(const width of [390,1440]){
 const page=await browser.newPage({viewport:{width,height:900}}),errors=[],actions=[];page.on('pageerror',e=>errors.push(e.message));
 const job={id:'job',title:'Test clean',address:'123 Test St',property_name:'Test home',status:'claimed',claimed_by:'worker',site_latitude:35,site_longitude:-80,metadata:{},property_checklist_items:[{id:'one',task:'Clean counters',category:'Kitchen',type:'check',required:true}]};
 await page.addInitScript(({job})=>{
  window.testJob=job;window.gpsDenied=true;window.progressEvents=[];
  window.addEventListener('turnly:job-progress',e=>window.progressEvents.push(e.detail.status));
  window.open=()=>({opener:null,location:{replace(url){window.mapsOpened=url;}},close(){}});
  Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(ok,fail){if(window.gpsDenied)fail({code:1});else ok({coords:{latitude:35,longitude:-80,accuracy:10},timestamp:Date.now()});}}});
 },{job});
 await page.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm',route=>route.fulfill({contentType:'text/javascript',body:`export function createClient(){return {auth:{getUser:async()=>({data:{user:{id:'worker'}}}),getSession:async()=>({data:{session:{access_token:'test'}}})},rpc:async(name,args)=>{if(name==='submit_assignment_for_qa'){window.testJob.status='qa_pending';window.submitted=args;return {data:'qa-job'};}return {data:'qa-job'};},from(table){const q={select(){return q},eq(){return q},or(){return q},order(){return q},limit(){return q},update(){return q},maybeSingle:async()=>({data:table==='assignment_blocks'?window.testJob:null}),then(resolve){return Promise.resolve({data:[]}).then(resolve)}};return q}}}` }));
 await page.route('**/api/contractor-job-progress',async route=>{
  const body=route.request().postDataJSON();actions.push(body.action);
  if(body.action==='start_job')assert.equal(body.position.accuracy,10);
  job.status=body.action==='head_to_job'?'en_route':'in_progress';
  await page.evaluate(job=>window.testJob=job,job);
  await route.fulfill({contentType:'application/json',body:JSON.stringify({assignment:job,maps_url:'https://www.google.com/maps/dir/?api=1&destination=35,-80'})});
 });
 await page.goto(`http://127.0.0.1:${server.address().port}`);await page.getByRole('button',{name:'Review job'}).click();
 await page.getByRole('button',{name:'Back to job details'}).click();
 await page.locator('#tjStart').click();await page.waitForFunction(()=>window.mapsOpened);
 assert.match(await page.evaluate(()=>window.mapsOpened),/google.com\/maps/);
 assert.equal(await page.locator('#tjStart').textContent(),'Start job');
 await page.locator('#tjStart').click();await page.getByText('Location permission was denied.',{exact:false}).waitFor();assert.deepEqual(actions,['head_to_job']);
 await page.evaluate(()=>window.gpsDenied=false);await page.locator('#tjStart').click();
 await page.locator('#turnlyMobileChecklistModal').waitFor({state:'visible'});
 await page.locator('[data-tc-check]').first().check();await page.locator('#tcNext').click();
 await page.getByRole('heading',{name:'Cleaning complete',exact:true}).waitFor();
 assert.deepEqual(await page.evaluate(()=>window.progressEvents),['en_route','in_progress','qa_pending']);
 assert.equal(await page.evaluate(()=>window.submitted.checklist_payload[0].completed),true);
 assert.deepEqual(errors,[]);await page.close();
 }
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
});
