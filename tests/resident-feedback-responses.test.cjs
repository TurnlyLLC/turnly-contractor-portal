const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');

test('feedback pages show full answers, paginate, retry, protect access, and link to QR tools', { timeout: 60000 }, async () => {
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/env.js') { res.setHeader('Content-Type', 'text/javascript'); return res.end("window.__ENV={SUPABASE_URL:'https://example.invalid',SUPABASE_ANON_KEY:'test'};"); }
    const file = path.resolve(root, '.' + pathname);
    if (!file.startsWith(root + path.sep)) { res.statusCode = 403; return res.end(); }
    try {
      res.setHeader('Content-Type', { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png' }[path.extname(file)] || 'application/octet-stream');
      res.end(fs.readFileSync(file));
    } catch { res.statusCode = 404; res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    // Keep the actual page and shared navigation; isolate unrelated portal modules.
    for (const file of ['app.js', 'admin-account-approvals.js', 'admin-pipeline.js', 'qa-checklists-nav-20260715a.js']) {
      await page.route(`**/${file}?*`, route => route.fulfill({ contentType: 'text/javascript', body: '' }));
    }
    await page.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm', route => route.fulfill({ contentType: 'text/javascript', body: `
      window.feedbackTest={admin:true,fail:false,total:26,calls:[],listeners:[]};
      export function createClient(){return {
        auth:{getUser:async()=>({data:{user:null}}),onAuthStateChange:fn=>{window.feedbackTest.listeners.push(fn);}},
        rpc:async()=>({data:window.feedbackTest.admin}),
        from:table=>({select:(fields,options)=>({order:function(){return this;},limit:async()=>({data:[]}),range:async(from,to)=>{
          const s=window.feedbackTest;s.calls.push({table,fields,options,from,to});
          if(s.fail)return {error:{message:'offline'}};
          return {count:s.total,data:Array.from({length:Math.max(0,Math.min(to+1,s.total)-from)},(_,i)=>({
            id:String(from+i+1),property_name:'Sample Community',property_code:'SC',card_number:from+i+1,
            created_at:'2026-09-21T12:00:00Z',rating:from+i===0?1:5,
            message:from+i===1?'':'Areas: Kitchen, Bathrooms\\n\\nFull response '+(from+i+1)+' <script>window.injected=true</script>'
          }))};
        }})})
      };}` }));
    await page.goto(`http://127.0.0.1:${server.address().port}/resident-feedback.html`);
    await page.waitForFunction(() => document.querySelectorAll('.resident-response-card').length === 25);
    assert.equal(await page.title(), 'Resident Feedback | Turnly Admin');
    assert.equal(await page.locator('#residentFeedbackGeneratorForm').count(), 0);
    assert.match(await page.locator('.resident-response-card').first().innerText(), /Areas: Kitchen, Bathrooms\n\nFull response 1/);
    assert.match(await page.locator('.resident-response-card').first().innerText(), /1 \/ 5/);
    assert.match(await page.locator('.resident-response-card').nth(1).innerText(), /Rating only/);
    assert.equal(await page.evaluate(() => window.injected), undefined);
    assert.equal(await page.locator('#residentResponsePage').innerText(), '1–25 of 26');
    assert.equal(await page.locator('a[href="qr-tracker.html"]').count(), 2);
    assert.equal(await page.locator('a[href="resident-feedback.html"].active').count(), 1);
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('residentResponsePage').textContent === '26–26 of 26');
    assert.equal(await page.locator('.resident-response-card').count(), 1);
    assert.match(await page.locator('.resident-response-card').innerText(), /SC-026/);
    assert.equal(await page.locator('#residentResponseNext').isDisabled(), true);
    await page.getByRole('button', { name: 'Previous', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('.resident-response-card').length === 25);
    const query = await page.evaluate(() => window.feedbackTest.calls[0]);
    assert.equal(query.table, 'resident_feedback_responses');
    assert.deepEqual(query.options, {count:'exact'});
    assert.equal(query.from, 0); assert.equal(query.to, 24);
    await page.evaluate(() => { window.feedbackTest.fail = true; });
    await page.getByRole('button', {name:'Refresh',exact:true}).click();
    await page.waitForFunction(() => document.getElementById('residentResponseStatus').textContent.includes('Unable to load'));
    assert.equal(await page.locator('.resident-response-card').count(), 0);
    await page.evaluate(() => { window.feedbackTest.fail = false; window.feedbackTest.total = 0; });
    await page.getByRole('button', {name:'Refresh',exact:true}).click();
    await page.getByRole('heading', {name:'No resident feedback yet',exact:true}).waitFor();
    await page.evaluate(() => { window.feedbackTest.total = 1; });
    await page.getByRole('button', {name:'Refresh',exact:true}).click();
    await page.waitForFunction(() => document.querySelectorAll('.resident-response-card').length === 1);
    if (process.env.FEEDBACK_QA_DIR) {
      fs.mkdirSync(process.env.FEEDBACK_QA_DIR,{recursive:true});
      await page.screenshot({path:path.join(process.env.FEEDBACK_QA_DIR,'feedback-desktop.png'),fullPage:true});
    }
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),true);
    if (process.env.FEEDBACK_QA_DIR) await page.screenshot({path:path.join(process.env.FEEDBACK_QA_DIR,'feedback-mobile.png'),fullPage:true});
    await page.evaluate(() => { window.feedbackTest.listeners.forEach(fn=>fn('SIGNED_OUT')); });
    assert.equal(await page.locator('.resident-response-card').count(),0);
    await page.evaluate(() => { window.feedbackTest.admin=false; });
    const callsBefore = await page.evaluate(() => window.feedbackTest.calls.length);
    await page.getByRole('button',{name:'Refresh',exact:true}).click();
    await page.waitForFunction(() => document.getElementById('residentResponseStatus').textContent.includes('Sign in with an admin'));
    assert.equal(await page.evaluate(() => window.feedbackTest.calls.length),callsBefore);
    await page.goto(`http://127.0.0.1:${server.address().port}/qr-tracker.html`);
    await page.locator('#residentFeedbackGeneratorForm').waitFor();
    assert.equal(await page.title(),'QR Tracker | Turnly Admin');
    assert.equal(await page.locator('#residentFeedbackResponsesMount').count(),0);
    assert.equal(await page.locator('a[href="qr-tracker.html"].active').count(),1);
    await page.getByRole('heading',{name:'Previous batches',exact:true}).waitFor();
    assert.deepEqual(errors,[]);
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
});
