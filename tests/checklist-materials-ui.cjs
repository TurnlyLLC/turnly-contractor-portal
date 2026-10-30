const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),lists=require('../docs/checklist-materials-lists.json');
test('pre-start popup works on desktop and phone, reopens, and distinguishes cleaning types',async()=>{
 const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/'){res.setHeader('Content-Type','text/html');return res.end('<button data-start-assignment-id="job">Review job</button><div id="message"></div><script>window.__ENV={SUPABASE_URL:"https://test.invalid",SUPABASE_ANON_KEY:"test"};</script><script type="module" src="/contractor-job-flow-mobile.js"></script>');}
  const file=path.resolve(root,'.'+url.pathname);if(!file.startsWith(root+path.sep)){res.statusCode=403;return res.end();}
  try{res.setHeader('Content-Type',/\.(js|mjs)$/.test(file)?'text/javascript':'text/plain');res.end(fs.readFileSync(file));}catch{res.statusCode=404;res.end();}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
 browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 for(const [width,kind] of [[390,'deep'],[1440,'standard']]){
  const page=await browser.newPage({viewport:{width,height:850}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const job={id:'job',title:'Test clean',property_name:'Test home',status:'claimed',metadata:{},materials_list:lists[kind],supplies_notes:'Use unscented products. <img src=x onerror=alert(1)>',property_checklist_items:[{id:'one',task:'Clean counters',category:'Kitchen'}]};
  await page.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm',route=>route.fulfill({contentType:'text/javascript',body:`export function createClient(){return {auth:{getUser:async()=>({data:{user:{id:'worker'}}})},from(table){const q={select(){return q},eq(){return q},limit(){return q},maybeSingle:async()=>({data:table==='assignment_blocks'?${JSON.stringify(job)}:null}),then(resolve){return Promise.resolve({data:[]}).then(resolve)}};return q}}}` }));
  await page.goto(`http://127.0.0.1:${server.address().port}`);await page.getByRole('button',{name:'Review job'}).click();
  const dialog=page.getByRole('dialog',{name:'Materials & chemicals'});await dialog.waitFor();
  assert.equal(await dialog.locator('img').count(),0);
  assert.equal(await dialog.getByText('EPA-registered hard-surface sanitizer',{exact:true}).count(),kind==='deep'?1:0);
  assert.ok((await dialog.boundingBox()).width<=width);
  await page.screenshot({path:path.join(root,'..',`materials-${kind}-${width}.png`)});
  await dialog.getByRole('button',{name:'Back to job details'}).click();await dialog.waitFor({state:'detached'});
  await page.getByRole('button',{name:'Materials & chemicals',exact:false}).click();await dialog.waitFor();
  await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});
  assert.equal(await page.locator('#tjMaterials').evaluate(e=>document.activeElement===e),true);
  assert.deepEqual(errors,[]);await page.close();
 }
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
});
