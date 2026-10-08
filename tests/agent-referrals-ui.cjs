// Local UI verification with synthetic data and mocked API; sends no messages.
// Run with bundled Playwright on NODE_PATH. Screenshots are written under QA_OUTPUT.
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {referralMessages}=require('../lib/agent-messages.cjs');
const {qrImage,referralUrl}=require('../lib/agent-referrals.cjs');
const root=path.resolve(__dirname,'..'),output=process.env.QA_OUTPUT||path.join(root,'.tmp','referral-ui');
const code='TA-'+'A'.repeat(32),id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const agent={id,name:'Jordan Ellis',brokerage:'Oak & Main Realty',email:'jordan@example.com',phone:'+19195550100',status:'active',city:'Durham',address:'123 Sample Street',state:'NC',phone_1:'9195550101',email_2:'alternate@example.com',website:'https://example.com',notes:'Interested in move-in and move-out cleaning for buyers and sellers.',follow_up_on:'2026-10-12',sms_consent:true,referral_code:code};
const mime={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.csv':'text/csv','.ico':'image/x-icon'};
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}if(file.endsWith('env.js')){res.setHeader('Content-Type','text/javascript');res.end('window.__ENV={SUPABASE_URL:"https://test.supabase.co",SUPABASE_ANON_KEY:"mock"};');return;}if(!fs.existsSync(file)){res.writeHead(404).end();return;}res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));});
(async()=>{
  fs.mkdirSync(output,{recursive:true});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({headless:true,...(process.env.QA_CHROMIUM?{executablePath:process.env.QA_CHROMIUM}:{})});const page=await browser.newPage({viewport:{width:1440,height:1100}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const qr=await qrImage(code),captured=[];
  const agents=[agent,...Array.from({length:26},(_,i)=>({...agent,id:`bbbbbbbb-bbbb-4bbb-8bbb-${String(i).padStart(12,'0')}`,name:`Morgan Reed ${i+1}`,city:i<24?'Durham':'Raleigh'}))];
  await page.route('https://cdn.jsdelivr.net/**',route=>route.fulfill({contentType:'text/javascript',body:'export function createClient(){return {auth:{getSession:async()=>({data:{session:{access_token:"mock"}}})}}}'}));
  await page.route('**/api/agent-referrals',async route=>{
    const body=route.request().postDataJSON();captured.push(body);let result={};
    const current=agents.find(a=>a.id===body.id)||agent;
    if(body.action==='list'){
      const filtered=agents.filter(a=>(!body.city||a.city===body.city)&&(!body.status||body.status==='all'||a.status===body.status)&&(!body.search||a.name.includes(body.search)));
      result={agents:filtered.slice((body.page-1)*25,body.page*25),total:filtered.length,cities:[{city:'Durham',total:25},{city:'Raleigh',total:2},{city:'Asheville',total:0}],admin:true,sending:{email:false,sms:false},settings:{qr_x:70,qr_y:68,qr_size:20,template_name:null}};
    }
    if(body.action==='detail')result={agent:current,link:referralUrl(code),qr,ledger:[],deliveries:[]};
    if(body.action==='save'){Object.assign(current,body.agent);result={agent:current,link:referralUrl(code),qr};}
    if(body.action==='send_preview')result={agent:current,url:base+'/preview.pdf',messages:referralMessages(current,base+'/preview.pdf'),sending:{email:false,sms:false}};
    if(body.action==='send')result={results:[{channel:'email',status:'not_configured',error:'Email sending is not connected yet.'},{channel:'sms',status:'not_configured',error:'Text sending is not connected yet.'}]};
    if(body.action==='context')result={agent:{name:agent.name,code}};
    if(body.action==='register')result={ok:true};
    await route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
  });
  const {makeFlyer}=require('../lib/agent-referrals.cjs');
  const pdf=await makeFlyer(fs.readFileSync(path.join(root,'assets/agent-referral-template.png')),{},code);
  await page.route('**/preview.pdf',route=>route.fulfill({contentType:'application/pdf',body:pdf}));
  try{
    await page.goto(base+'/sales-agents.html');await page.getByRole('heading',{name:'Agent partners'}).waitFor();
    assert.equal(await page.locator('.agent-list tbody tr').count(),25);
    await page.screenshot({path:path.join(output,'agents-list-desktop.png'),fullPage:true});
    await page.getByRole('button',{name:'Next page',exact:true}).click();await page.getByText('26–27 of 27 agents',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Card view',exact:true}).click();
    assert.equal(await page.locator('.lead-card').count(),1);
    await page.getByText('Agent 26 of 27',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Previous agent',exact:true}).click();await page.getByText('Agent 25 of 27',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Next agent',exact:true}).click();await page.getByText('Agent 26 of 27',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Next agent',exact:true}).click();await page.getByText('Agent 27 of 27',{exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Next agent',exact:true}).isDisabled(),true);
    await page.locator('#cityFilter').selectOption('Durham');await page.getByText('Agent 1 of 25',{exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Previous agent',exact:true}).isDisabled(),true);
    await page.getByRole('button',{name:'Send info',exact:true}).click();await page.locator('#sendForm').waitFor();
    assert.equal(captured.filter(r=>r.action==='send').length,0,'Opening preview must not send');
    await page.getByRole('button',{name:'Cancel',exact:true}).click();
    assert.equal(captured.filter(r=>r.action==='send').length,0,'Cancel must not send');
    await page.getByRole('button',{name:'Send info',exact:true}).click();await page.locator('#sendForm').waitFor();
    await page.getByRole('button',{name:'Edit phone numbers and emails',exact:true}).click();
    await page.locator('#contactForm input[name=email]').fill('corrected@example.com');
    await page.locator('#contactForm input[name=phone]').fill('+19195550199');
    await page.locator('#contactForm input[name=email_2]').fill('corrected-alternate@example.com');
    await page.locator('#contactForm input[name=phone_3]').fill('+19195550188');
    await page.getByRole('button',{name:'Save and preview',exact:true}).click();await page.locator('#sendForm').waitFor();
    assert.equal(await page.locator('#sendForm select[name=email]').inputValue(),'corrected@example.com');
    assert.equal(await page.locator('#sendForm select[name=phone]').inputValue(),'+19195550199');
    assert.equal(captured.filter(r=>r.action==='send').length,0,'Saving corrections must not send');
    await page.screenshot({path:path.join(output,'agents-send-preview.png'),fullPage:true});
    await page.locator('#sendForm select[name=email]').selectOption('corrected-alternate@example.com');
    await page.locator('#sendForm input[name=send_sms]').uncheck();
    await page.getByRole('button',{name:'Confirm and send',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('#message').textContent.includes('not connected'));
    const send=captured.filter(r=>r.action==='send');assert.equal(send.length,1);assert.equal(send[0].email,'corrected-alternate@example.com');assert.deepEqual(send[0].channels,['email']);
    await page.getByRole('button',{name:'Close',exact:true}).click();
    await page.screenshot({path:path.join(output,'agents-card-desktop.png'),fullPage:true});
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:path.join(output,'agents-card-mobile.png'),fullPage:true});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'mobile card must not overflow');
    await page.getByRole('button',{name:'Send info',exact:true}).click();await page.locator('#sendForm').waitFor();
    await page.screenshot({path:path.join(output,'agents-preview-mobile.png'),fullPage:true});
    assert.equal(await page.locator('#editor').evaluate(e=>e.scrollWidth>e.clientWidth),false,'mobile preview must not overflow');
    await page.getByRole('button',{name:'Cancel',exact:true}).click();
    await page.getByRole('button',{name:'List view',exact:true}).click();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'mobile list must not overflow page');
    await page.goto(base+'/admin-agents.html');await page.getByRole('link',{name:'Command Center',exact:true}).waitFor();
    assert.ok(captured.some(r=>r.admin_view===true));
    await page.locator('#cityFilter').selectOption('Raleigh');await page.getByText('1–2 of 2 agents',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Card view',exact:true}).click();await page.getByText('Agent 1 of 2',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Edit contacts',exact:true}).click();await page.locator('#contactForm input[name=email]').fill('admin-correction@example.com');await page.getByRole('button',{name:'Save contacts',exact:true}).click();await page.getByText('Contact information saved.',{exact:true}).waitFor();
    await page.getByText('admin-correction@example.com',{exact:true}).waitFor();
    await page.locator('#statusFilter').selectOption('not_interested');await page.getByText('No matching agents. Change the filters or upload leads.',{exact:true}).waitFor();
    assert.equal(errors.length,0,errors.join('\n'));console.log('PASS list/card pagination, filters, preview cancellation, contact corrections, explicit confirmation, mobile and admin views. No messages sent.');
  }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
