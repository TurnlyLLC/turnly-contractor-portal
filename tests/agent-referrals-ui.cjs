// Local UI verification with synthetic data and mocked API; sends no messages.
// Run with bundled Playwright on NODE_PATH. Screenshots are written under QA_OUTPUT.
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {qrImage,referralUrl}=require('../lib/agent-referrals.cjs');
const root=path.resolve(__dirname,'..'),output=process.env.QA_OUTPUT||path.join(root,'.tmp','referral-ui');
const code='TA-'+'A'.repeat(32),id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const agent={id,name:'Jordan Ellis',brokerage:'Oak & Main Realty',email:'jordan@example.com',phone:'+19195550100',status:'active',notes:'Interested in move-in and move-out cleaning for buyers and sellers.',follow_up_on:'2026-10-12',sms_consent:true,referral_code:code};
const mime={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.csv':'text/csv','.ico':'image/x-icon'};
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}if(file.endsWith('env.js')){res.setHeader('Content-Type','text/javascript');res.end('window.__ENV={SUPABASE_URL:"https://test.supabase.co",SUPABASE_ANON_KEY:"mock"};');return;}if(!fs.existsSync(file)){res.writeHead(404).end();return;}res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));});
(async()=>{
  fs.mkdirSync(output,{recursive:true});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({headless:true,...(process.env.QA_CHROMIUM?{executablePath:process.env.QA_CHROMIUM}:{})});const page=await browser.newPage({viewport:{width:1440,height:1100}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const qr=await qrImage(code),captured=[];
  await page.route('https://cdn.jsdelivr.net/**',route=>route.fulfill({contentType:'text/javascript',body:'export function createClient(){return {auth:{getSession:async()=>({data:{session:{access_token:"mock"}}})}}}'}));
  await page.route('**/api/agent-referrals',async route=>{
    const body=route.request().postDataJSON();captured.push(body);let result={};
    if(body.action==='list')result={agents:[agent,{...agent,id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',name:'Morgan Reed',status:'follow_up',brokerage:'Triangle Homes',email:'morgan@example.com'}],total:2,admin:true,sending:{email:false,sms:false},settings:{qr_x:70,qr_y:68,qr_size:20,template_name:null}};
    if(body.action==='detail')result={agent,link:referralUrl(code),qr,ledger:[{id:'customer',name:'Taylor Carter',email:'taylor@example.com',phone:'+19195550103',clean_status:'completed',first_assignment_id:'sample-assignment',eligible_subtotal:250,customer_paid:true,bonus_amount:25,bonus_status:'earned'}],deliveries:[]};
    if(body.action==='save')result={agent:{...agent,...body.agent},link:referralUrl(code),qr};
    if(body.action==='send')result={results:[{channel:'email',status:'not_configured',error:'Email sending is not connected yet.'},{channel:'sms',status:'not_configured',error:'Text sending is not connected yet.'}]};
    if(body.action==='context')result={agent:{name:agent.name,code}};
    if(body.action==='register')result={ok:true};
    await route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
  });
  try{
    await page.goto(base+'/sales-agents.html');await page.getByRole('heading',{name:'Agent partners'}).waitFor();
    await page.getByRole('button',{name:'Open agent'}).first().click();await page.getByRole('heading',{name:'Referral kit'}).waitFor();
    await page.screenshot({path:path.join(output,'agents-desktop.png'),fullPage:true});
    await page.getByRole('button',{name:'Edit agent',exact:true}).click();await page.locator('#agentForm select[name=status]').selectOption('follow_up');await page.getByRole('button',{name:'Save agent',exact:true}).click();
    assert.equal(captured.find(r=>r.action==='save').agent.status,'follow_up');
    await page.getByRole('button',{name:'Send email + text',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#message').textContent.includes('not connected'));
    assert.match(await page.locator('#message').innerText(),/not_configured|not configured/);
    await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(output,'agents-mobile.png'),fullPage:true});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'mobile page must not overflow');
    await page.goto(base+'/residential-referral.html?ref='+code);await page.locator('#requestForm').waitFor({state:'visible'});
    await page.screenshot({path:path.join(output,'signup-mobile.png'),fullPage:true});
    await page.locator('[name=name]').fill('Sample Customer');await page.locator('[name=email]').fill('sample@example.com');await page.locator('[name=phone]').fill('9195550188');await page.locator('[name=city]').fill('Durham');await page.locator('[name=address]').fill('123 Test Lane, NC 27701');
    await page.getByRole('button',{name:'Request my cleaning quote'}).click();await page.waitForFunction(()=>document.querySelector('#result').textContent.includes('Thank you'));
    assert.equal(captured.find(r=>r.action==='register').code,code);
    assert.equal(errors.length,0,errors.join('\n'));console.log('PASS desktop/mobile render, editing, honest send status, signup attribution, no browser errors.');
  }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
