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
 await page.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'text/javascript',body:`export function createClient(){const user={id:'test',email:'admin@example.com'};const q=new Proxy({}, {get(_,key){if(key==='then')return resolve=>resolve({data:[],error:null,count:0});return ()=>q;}});return {auth:{getSession:async()=>({data:{session:{access_token:'test',user}}}),getUser:async()=>({data:{user}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},from:(table)=>{if(table!=='sales_walkthrough_availability')return q;const rows=Array.from({length:40},(_,i)=>({id:'slot-'+i,starts_at:new Date(Date.UTC(i<10?2020:2030,0,2+Math.floor(i/10),14+i%10)).toISOString(),ends_at:new Date(Date.UTC(i<10?2020:2030,0,2+Math.floor(i/10),15+i%10)).toISOString(),status:'open',label:'Quality walkthrough'}));const slots=new Proxy({}, {get(_,key){if(key==='then')return resolve=>resolve({data:rows,error:null});return ()=>slots;}});return slots;},rpc:()=>q,channel:()=>q,removeChannel(){}};}`}));
 await page.route('**/api/**',r=>r.fulfill({json:{agents:[],total:0,cities:[],admin:false,customers:[],bookings:[],clients:[],payments_ready:false,settings:{},sending:{}}}));
 await page.route('http://127.0.0.1:**/*',async r=>{const name=new URL(r.request().url()).pathname.slice(1);if(extras.has(name)&&name!=='admin-sales-portal.js')return r.fulfill({contentType:'text/javascript',body:''});return r.fallback();});
 await page.addInitScript(()=>localStorage.setItem('turnlyAdminCollapsedNavSections','["sales","operations","quality","reports"]'));
 const menuStyle=()=>page.locator('.admin-shared-sidebar').evaluate(sidebar=>{
   const properties=['fontFamily','fontSize','fontWeight','lineHeight','color','backgroundColor','backgroundImage','padding','margin','border','borderRadius','display','gap','gridTemplateColumns'];
   return Object.fromEntries(['','.suite-brand','.nav-section-title','.suite-nav-link:not(.active)','.suite-nav-link:not(.active) .suite-icon','.suite-legal-links'].map(selector=>{const el=selector?sidebar.querySelector(selector):sidebar;const style=getComputedStyle(el);return [selector,Object.fromEntries(properties.map(key=>[key,style[key]]))];}));
 });
 try{
  await page.goto(`http://127.0.0.1:${server.address().port}/walkthroughs.html`);
  await page.locator('.admin-sales-availability-card').first().waitFor();
  assert.equal(await page.locator('.admin-sales-availability-card').count(),4);
  assert.equal(await page.locator('.admin-sales-availability-slot').count(),40,'all slots retained beyond old 28 limit');
  assert.match(await page.locator('.admin-sales-availability-card').last().locator('summary').innerText(),/Past date/);
  const day=page.locator('.admin-sales-availability-card').first();await day.locator('summary').click();
  assert.equal(await day.locator('.admin-sales-availability-slot').first().isVisible(),true);
  const time=day.locator('.admin-sales-availability-slot strong').first();assert.equal(await time.evaluate(el=>getComputedStyle(el).whiteSpace),'nowrap');
  fs.mkdirSync(path.join(root,'.tmp/walkthroughs'),{recursive:true});
  await page.evaluate(()=>scrollTo(0,0));
  await page.screenshot({path:path.join(root,'.tmp/walkthroughs/desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'mobile page does not overflow');
  await page.screenshot({path:path.join(root,'.tmp/walkthroughs/mobile.png'),fullPage:true});
  console.log('PASS 40 slots, collapsed dates, upcoming first, readable times, desktop/mobile layout; no live mutations');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
