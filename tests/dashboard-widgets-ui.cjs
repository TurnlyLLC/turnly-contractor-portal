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
 await page.route('http://127.0.0.1:**/*',async r=>{const name=new URL(r.request().url()).pathname.slice(1);if(extras.has(name)&&name!=='website-inquiries-widget.js')return r.fulfill({contentType:'text/javascript',body:''});return r.fallback();});
 await page.addInitScript(()=>localStorage.setItem('turnlyAdminCollapsedNavSections','["sales","operations","quality","reports"]'));
 const menuStyle=()=>page.locator('.admin-shared-sidebar').evaluate(sidebar=>{
   const properties=['fontFamily','fontSize','fontWeight','lineHeight','color','backgroundColor','backgroundImage','padding','margin','border','borderRadius','display','gap','gridTemplateColumns'];
   return Object.fromEntries(['','.suite-brand','.nav-section-title','.suite-nav-link:not(.active)','.suite-nav-link:not(.active) .suite-icon','.suite-legal-links'].map(selector=>{const el=selector?sidebar.querySelector(selector):sidebar;const style=getComputedStyle(el);return [selector,Object.fromEntries(properties.map(key=>[key,style[key]]))];}));
 });
 try{
  for(const file of ['dashboard.html','admin.html']){
   await page.goto(`http://127.0.0.1:${server.address().port}/${file}`);
   await page.locator('.wi-empty').waitFor();
   await page.evaluate(async()=>{
    const {createResidentFeedbackWidget}=await import('/resident-feedback-widget.js');
    const rows=[{property_name:'Sample community',property_code:'TEST',card_number:4,rating:5,created_at:'2026-10-12T12:00:00Z',message:''},{property_name:'Sample community',property_code:'TEST',card_number:1,rating:5,created_at:'2026-10-11T12:00:00Z',message:'Areas: Appliances. The kitchen looked amazing!'}];
    const q=new Proxy({}, {get(_,key){if(key==='then')return resolve=>resolve({data:rows,error:null});return ()=>q;}});
    await createResidentFeedbackWidget({client:{rpc:async()=>({data:true}),from:()=>q},esc:s=>String(s),panel:()=>''}).load();
   });
   assert.equal(await page.locator('.resident-feedback-widget-card').count(),2);
   const style=el=>{const s=getComputedStyle(el);return {background:s.backgroundImage,border:s.borderColor,shadow:s.boxShadow,radius:s.borderRadius};};
   const reference=await page.locator('.website-inquiries-card').evaluate(style);
   for(const card of await page.locator('.command-grid>.suite-panel').all())assert.deepEqual(await card.evaluate(style),reference);
   for(const card of await page.locator('.resident-feedback-widget-card').all()){
    assert.equal(await card.evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(255, 255, 255, 0.84)');
    assert.equal(await card.evaluate(el=>getComputedStyle(el).boxShadow),'none');
   }
   fs.mkdirSync(path.join(root,'.tmp/dashboard-widgets'),{recursive:true});
   await page.screenshot({path:path.join(root,'.tmp/dashboard-widgets',file+'.png'),fullPage:true});
   await page.setViewportSize({width:390,height:844});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.screenshot({path:path.join(root,'.tmp/dashboard-widgets',file+'-mobile.png'),fullPage:true});
   await page.setViewportSize({width:1440,height:1000});
  }
  console.log('PASS populated feedback cards and empty inquiries: matching widget surfaces, no gray cards, desktop and mobile');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
