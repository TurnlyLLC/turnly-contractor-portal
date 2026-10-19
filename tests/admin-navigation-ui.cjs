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
 for(const href of expected.filter(h=>!h.startsWith('https://')))assert.ok(fs.existsSync(path.join(root,href)),`Missing destination ${href}`);
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
 let baseline;
 try{
  for(const file of pages){
   await page.goto(`http://127.0.0.1:${server.address().port}/${file}`);
   const nav=page.getByRole('navigation',{name:'Admin navigation',exact:true});await nav.waitFor();
   assert.deepEqual(await nav.locator('a').evaluateAll(a=>a.map(n=>n.getAttribute('href'))),expected,`${file}: identical ordered links`);
   assert.equal(await nav.locator('.nav-section-links[hidden]').count(),0,`${file}: all sections expanded`);
   for(const link of await nav.locator('a').all())assert.ok(await link.isVisible(),`${file}: visible link`);
   assert.equal(await nav.locator('a .suite-icon svg').count(),expected.length);
   assert.equal(await page.locator('body').getAttribute('data-dashboard-theme'),'light',`${file}: light default`);
   assert.equal(await page.locator('body').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(243, 246, 250)',`${file}: light canvas`);
   for(const heading of await page.locator('.suite-main h1,.suite-main h2').all()) assert.equal(await heading.evaluate(el=>getComputedStyle(el).color),'rgb(23, 48, 71)',`${file}: readable headings`);
   const style=await menuStyle();assert.equal(style[''].backgroundColor,'rgb(7, 24, 39)');if(!baseline)baseline=style;else assert.deepEqual(style,baseline,`${file}: identical menu styling`);
   if(['admin.html','dashboard.html'].includes(file)){
    const cards=page.locator('.command-grid > .suite-panel');
    for(const card of await cards.all()){const style=await card.evaluate(el=>{const s=getComputedStyle(el);return {image:s.backgroundImage,shadow:s.boxShadow};});assert.ok(style.image.includes('radial-gradient')); assert.equal(style.shadow,'rgba(23, 48, 71, 0.03) 0px 2px 8px 0px');}
   }
   if(['admin.html','dashboard.html','assignments.html','directory.html','sales-overview.html','admin-agents.html','finance.html'].includes(file)){fs.mkdirSync(path.join(root,'.tmp/admin-theme'),{recursive:true});await page.screenshot({path:path.join(root,'.tmp/admin-theme',file+'.png')});}
   console.log(`PASS ${file}: light workspace, navy menu, ${expected.length} links`);
  }
  await page.goto(`http://127.0.0.1:${server.address().port}/admin-residential.html`);
  await page.locator('.suite-nav').waitFor();await page.getByRole('button',{name:'Sales',exact:true}).click();
  assert.equal(await page.locator('[data-nav-section="sales"]').isVisible(),false);
  await page.reload();await page.locator('.suite-nav').waitFor();assert.equal(await page.locator('[data-nav-section="sales"]').isVisible(),true);
  assert.equal(await page.locator('a[aria-current="page"]').getAttribute('href'),'admin-residential.html');
  fs.mkdirSync(path.join(root,'.tmp/admin-navigation'),{recursive:true});
  await page.screenshot({path:path.join(root,'.tmp/admin-navigation/residential-desktop.png')});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:path.join(root,'.tmp/admin-navigation/residential-mobile.png'),fullPage:true});
  await page.setViewportSize({width:1440,height:1000});
  await page.addInitScript(()=>localStorage.setItem('turnlyAdminDashboardTheme','light'));
  let lightStyle;
  for(const file of ['admin-residential.html','admin-agents.html','checklists.html','admin.html']){
   await page.goto(`http://127.0.0.1:${server.address().port}/${file}`);await page.locator('.suite-nav').waitFor();
   const style=await menuStyle();if(!lightStyle)lightStyle=style;else assert.deepEqual(style,lightStyle,`${file}: light theme matches`);
  }
  console.log(`PASS ${pages.length} admin pages, ${expected.length} destinations, collapse reset, current-page marker, mobile overflow`);
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
