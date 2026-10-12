// Render every admin page with read-only synthetic API responses. Never touches live data.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const pages=fs.readdirSync(root).filter(f=>f.endsWith('.html')&&/data-admin-page=|data-portal="admin"/.test(fs.readFileSync(path.join(root,f),'utf8')));
const shell=/admin-suite-(20260708g|20260710a|20260710b)\.js|sales-agents\.mjs|admin-residential\.mjs|qa-checklists-nav-20260715a\.js/;
const extras=new Set(pages.flatMap(f=>[...fs.readFileSync(path.join(root,f),'utf8').matchAll(/<script[^>]+src="([^"?]+)/g)].map(m=>m[1])).filter(f=>f!=='env.js'&&!shell.test(f)));
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return res.writeHead(404).end();res.setHeader('Content-Type',/\.m?js$/.test(file)?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));});
(async()=>{
 const {navSections}=await import(pathToFileURL(path.join(root,'admin-navigation.mjs')));
 const expected=navSections.flatMap(s=>s.links.map(l=>l.href));assert.equal(new Set(expected).size,expected.length);
 for(const href of expected)assert.ok(fs.existsSync(path.join(root,href)),`Missing destination ${href}`);
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,executablePath:process.env.QA_CHROMIUM});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 await page.route('**/env.js',r=>r.fulfill({contentType:'text/javascript',body:'window.__ENV={SUPABASE_URL:"https://example.supabase.co",SUPABASE_ANON_KEY:"test"};'}));
 await page.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'text/javascript',body:`export function createClient(){const user={id:'test',email:'admin@example.com'};const q=new Proxy({}, {get(_,key){if(key==='then')return resolve=>resolve({data:[],error:null,count:0});return ()=>q;}});return {auth:{getSession:async()=>({data:{session:{access_token:'test',user}}}),getUser:async()=>({data:{user}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},from:()=>q,rpc:()=>q,channel:()=>q,removeChannel(){}};}`}));
 await page.route('**/api/**',r=>r.fulfill({json:{agents:[],total:0,cities:[],admin:false,customers:[],bookings:[],clients:[],payments_ready:false,settings:{},sending:{}}}));
 await page.route('http://127.0.0.1:**/*',async r=>{const name=new URL(r.request().url()).pathname.slice(1);if(extras.has(name))return r.fulfill({contentType:'text/javascript',body:''});return r.fallback();});
 await page.addInitScript(()=>localStorage.setItem('turnlyAdminCollapsedNavSections','["sales","operations","quality","reports"]'));
 const menuStyle=()=>page.locator('.admin-shared-sidebar').evaluate(sidebar=>{
   const properties=['fontFamily','fontSize','fontWeight','lineHeight','color','backgroundColor','backgroundImage','padding','margin','border','borderRadius','display','gap','gridTemplateColumns'];
   return Object.fromEntries(['','.suite-brand','.nav-section-title','.suite-nav-link:not(.active)','.suite-nav-link:not(.active) .suite-icon','.suite-legal-links'].map(selector=>{const el=selector?sidebar.querySelector(selector):sidebar;const style=getComputedStyle(el);return [selector,Object.fromEntries(properties.map(key=>[key,style[key]]))];}));
 });
 try{
  await page.goto(`http://127.0.0.1:${server.address().port}/assignments.html`);
  await page.locator('[data-assignment-new]').first().click();
  const modal=page.locator('#assignmentModal');await modal.waitFor({state:'visible'});
  assert.equal(await modal.locator('.client-modal-panel').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 255, 255)');
  for(const field of await modal.locator('input:not([type=hidden]),select,textarea').all()){
   if(!await field.isVisible())continue;
   assert.equal(await field.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 255, 255)');
   assert.equal(await field.evaluate(el=>getComputedStyle(el).color),'rgb(23, 48, 71)');
  }
  fs.mkdirSync(path.join(root,'.tmp/admin-details'),{recursive:true});
  await page.screenshot({path:path.join(root,'.tmp/admin-details/assignment-desktop.png')});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:path.join(root,'.tmp/admin-details/assignment-mobile.png')});
  await modal.locator('.client-modal-close').click();assert.equal(await modal.isVisible(),false);
  console.log('PASS actual assignment editor opens, light fields and panel, mobile width, close; no data submitted');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
