// Run with Playwright installed: node --test tests/resident-feedback-pdf.test.cjs
// Set CHROME_PATH to use an installed Chrome/Edge instead of Playwright Chromium.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { PDFDocument } = require('../assets/vendor/pdf-lib.min.js');
const root = path.resolve(__dirname, '..');

test('ream PDF, download retries, batch history and confirmed deletion', { timeout: 240000 }, async () => {
  const harness = `<link rel="stylesheet" href="/admin-suite.css"><link rel="stylesheet" href="/resident-feedback.css">
    <body class="turnly-admin-suite"><div id="adminSuiteApp"><div class="admin-suite-shell"><aside class="suite-sidebar">Turnly Admin</aside><main class="suite-main"><div class="suite-content"><div id="residentFeedbackAdminMount" class="resident-feedback-admin-mount"></div></div></main></div></div>
    <script>window.__ENV={SUPABASE_URL:'https://example.invalid',SUPABASE_ANON_KEY:'test'};</script>
    <script src="/assets/vendor/qrcode-generator.js" defer></script><script src="/assets/vendor/pdf-lib.min.js" defer></script>
    <script type="module" src="/resident-feedback-admin.js"></script>`;
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/') { res.setHeader('Content-Type', 'text/html'); return res.end(harness); }
    const file = path.resolve(root, '.' + pathname);
    if (!file.startsWith(root + path.sep)) { res.statusCode = 403; return res.end(); }
    const type = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png' }[path.extname(file)];
    try { res.setHeader('Content-Type', type || 'application/octet-stream'); res.end(fs.readFileSync(file)); }
    catch { res.statusCode = 404; res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
    const page = await browser.newPage({ acceptDownloads: true, viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm', route => route.fulfill({ contentType: 'text/javascript', body: `
      export function createClient() { return {
        auth: { getUser: async () => ({data:{user:{id:'admin'}}}), getSession: async () => ({data:{session:{access_token:'test-only'}}}) },
        rpc: async () => ({data:true}),
        from: () => ({select: () => ({order: () => ({limit: async () => ({data:[{id:'property-1',name:'Vetra Forest Hills'}]})})})})
      }; }` }));
    let saves = 0;
    let deletes = 0;
    let failDelete = false;
    const batchId = 'dafb4cb1-ec44-45b3-a305-685350b3a521';
    const otherBatch = { id:'89e51ff7-4681-4d9b-8144-cb1ef4c25778',property_name:'Other property',property_code:'OTHER',start_number:1,end_number:10,card_count:10,created_at:'2026-09-18T12:00:00Z' };
    let batches = [otherBatch];
    let request;
    await page.route('**/api/resident-feedback', async route => {
      const body = route.request().postDataJSON();
      assert.equal(route.request().headers().authorization, 'Bearer test-only');
      if (body.action === 'list_batches') return route.fulfill({json:{ok:true,batches,page:1,total:batches.length,page_size:20}});
      if (body.action === 'delete_batch') {
        deletes++;
        assert.equal(body.confirm_delete,true);
        assert.equal(body.batch_id,batchId);
        if (failDelete) return route.fulfill({status:503,json:{error:'Unable to delete this batch. Please retry.'}});
        batches = batches.filter(batch => batch.id !== body.batch_id);
        return route.fulfill({json:{ok:true,deleted:{id:batchId,card_count:5}}});
      }
      saves++;
      request = body;
      batches.unshift({id:batchId,property_name:'Vetra Forest Hills',property_code:body.property_code,start_number:body.start_number,end_number:body.start_number+body.count-1,card_count:body.count,created_at:new Date().toISOString()});
      await route.fulfill({ json: { ok: true, batch_id: batchId, property_name: 'Vetra Forest Hills', property_code: request.property_code,
        cards: Array.from({ length: request.count }, (_, i) => ({ card_number: request.start_number + i, feedback_url: `https://turnlypros.com/f/${String(i + 1).padStart(64, '0')}` })) } });
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.locator('#residentFeedbackProperty').selectOption('property-1');
    assert.equal(await page.locator('#residentFeedbackCount').inputValue(),'2000');
    assert.equal(await page.locator('#residentFeedbackCount').getAttribute('max'),'2000');
    assert.equal(await page.locator('#residentFeedbackPropertyCode').inputValue(), 'VFH');
    await page.locator('#residentFeedbackCount').fill('5');
    await page.locator('#residentFeedbackStartNumber').fill('103');
    const downloaded = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Generate flyer PDF' }).click();
    const download = await downloaded;
    assert.equal(download.suggestedFilename(), 'Turnly_Feedback_VFH_103-107_4up_Letter.pdf');
    const bytes = fs.readFileSync(await download.path());
    const pdf = await PDFDocument.load(bytes);
    assert.equal(pdf.getPageCount(), 2);
    assert.deepEqual(pdf.getPage(0).getSize(), { width: 612, height: 792 });
    assert.equal(await page.locator('#residentFeedbackCards .resident-flyer').count(), 4);
    const flyerBox = await page.locator('#residentFeedbackCards .resident-flyer > svg').first().boundingBox();
    const qrBox = await page.locator('#residentFeedbackCards .resident-flyer > svg > svg').first().boundingBox();
    assert.ok(Math.abs(qrBox.width / flyerBox.width - 378 / 1054) < 0.01, 'Nested QR SVG must retain its artwork dimensions');
    assert.equal(saves, 1);
    assert.deepEqual(request, { action: 'create_batch', property_id: 'property-1', property_code: 'VFH', count: 5, start_number: 103 });
    if (process.env.FLYER_QA_DIR) {
      fs.mkdirSync(process.env.FLYER_QA_DIR, { recursive: true });
      fs.writeFileSync(path.join(process.env.FLYER_QA_DIR, 'flyer-test.pdf'), bytes);
      await page.screenshot({ path: path.join(process.env.FLYER_QA_DIR, 'portal-preview.png'), fullPage: true });
    }
    // Changing the next batch's form must never relabel previously saved links.
    await page.locator('#residentFeedbackPropertyCode').fill('OTHER');
    const again = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download PDF' }).click();
    assert.equal((await again).suggestedFilename(), download.suggestedFilename());
    assert.equal(saves, 1);
    // Failed export keeps the saved batch available for a retry.
    await page.evaluate(() => { window.savedPdfLib = window.PDFLib; window.PDFLib = null; });
    await page.getByRole('button', { name: 'Download PDF' }).click();
    await page.waitForFunction(() => document.getElementById('residentFeedbackMessage').textContent.includes('Use Download PDF to retry'));
    await page.evaluate(() => { window.PDFLib = window.savedPdfLib; });
    const retry = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download PDF' }).click();
    await retry;
    assert.equal(saves, 1);
    const deleteButton = page.locator(`[data-delete-batch="${batchId}"]`);
    page.once('dialog', dialog => { assert.match(dialog.message(), /Printed|printed/); void dialog.dismiss(); });
    await deleteButton.click();
    assert.equal(deletes,0);
    failDelete = true;
    page.once('dialog', dialog => dialog.accept());
    await deleteButton.click();
    await page.waitForFunction(() => document.getElementById('residentFeedbackHistoryMessage').textContent.includes('Unable to delete'));
    assert.equal(await page.locator('#residentFeedbackBatch').isVisible(),true);
    assert.equal(await page.locator('[data-delete-batch]').count(),2);
    failDelete = false;
    page.once('dialog', dialog => dialog.accept());
    await deleteButton.click();
    await page.waitForFunction(() => document.getElementById('residentFeedbackHistoryMessage').textContent.includes('Deleted 5'));
    assert.equal(await page.locator('#residentFeedbackBatch').isVisible(),false);
    assert.equal(await page.locator('[data-delete-batch]').count(),1);
    assert.equal(await page.locator('[data-delete-batch]').getAttribute('data-delete-batch'),otherBatch.id);
    assert.equal(saves,1);
    // Optional UI-only rerun after changing the harness layout; full ream is the default.
    if (process.env.FLYER_UI_ONLY) { assert.deepEqual(errors, []); return; }
    // Validate bounds, unique tokens, single/partial pages, and maximum batch.
    const checks = await page.evaluate(async () => {
      const { buildFlyerPdf } = await import('/resident-feedback-pdf.mjs');
      const card = { card_number: 999999, feedback_url: `https://turnlypros.com/f/${'a'.repeat(64)}` };
      const base = { propertyName: 'Résidences 森林 — A Long Community Name', propertyCode: 'PROPERTY99' };
      let duplicateRejected = false;
      try { await buildFlyerPdf({ ...base, cards: [card, card] }); } catch { duplicateRejected = true; }
      const one = await PDFLib.PDFDocument.load(await buildFlyerPdf({ ...base, cards: [card] }));
      const started = performance.now();
      const cards = Array.from({length: 2000}, (_, i) => ({card_number: i + 1, feedback_url: `https://turnlypros.com/f/${(i + 1).toString(16).padStart(64, '0')}`}));
      const bytes = await buildFlyerPdf({ ...base, cards });
      const large = await PDFLib.PDFDocument.load(bytes);
      window.reamBytes = bytes;
      return { duplicateRejected, singlePages: one.getPageCount(), maxPages: large.getPageCount(), maxBytes: bytes.length, ms: performance.now() - started };
    });
    assert.equal(checks.duplicateRejected, true);
    assert.equal(checks.singlePages, 1);
    assert.equal(checks.maxPages, 500);
    assert.ok(checks.maxBytes < 50000000, 'Shared artwork should keep 2,000 flyers under 50 MB');
    if (process.env.FLYER_QA_DIR) {
      const encoded = await page.evaluate(async () => {
        const blob = new Blob([window.reamBytes]);
        return await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.readAsDataURL(blob); });
      });
      fs.writeFileSync(path.join(process.env.FLYER_QA_DIR,'ream-test.pdf'),Buffer.from(encoded,'base64'));
    }
    console.log('Maximum-batch PDF:', checks);
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
});
