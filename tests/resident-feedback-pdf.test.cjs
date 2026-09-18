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

test('flyer download preserves saved codes, paginates, and retries without creating another batch', { timeout: 180000 }, async () => {
  const harness = `<link rel="stylesheet" href="/admin-suite.css"><link rel="stylesheet" href="/resident-feedback.css">
    <body class="turnly-admin-suite"><div id="adminSuiteApp"><main class="suite-content"><div id="residentFeedbackAdminMount" class="resident-feedback-admin-mount"></div></main></div>
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
    let request;
    await page.route('**/api/resident-feedback', async route => {
      saves++;
      request = route.request().postDataJSON();
      assert.equal(route.request().headers().authorization, 'Bearer test-only');
      await route.fulfill({ json: { ok: true, property_name: 'Vetra Forest Hills', property_code: request.property_code,
        cards: Array.from({ length: request.count }, (_, i) => ({ card_number: request.start_number + i, feedback_url: `https://turnlypros.com/f/${String(i + 1).padStart(64, '0')}` })) } });
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.locator('#residentFeedbackProperty').selectOption('property-1');
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
    // Validate bounds, unique tokens, single/partial pages, and maximum batch.
    const checks = await page.evaluate(async () => {
      const { buildFlyerPdf } = await import('/resident-feedback-pdf.mjs');
      const card = { card_number: 999999, feedback_url: `https://turnlypros.com/f/${'a'.repeat(64)}` };
      const base = { propertyName: 'Résidences 森林 — A Long Community Name', propertyCode: 'PROPERTY99' };
      let duplicateRejected = false;
      try { await buildFlyerPdf({ ...base, cards: [card, card] }); } catch { duplicateRejected = true; }
      const one = await PDFLib.PDFDocument.load(await buildFlyerPdf({ ...base, cards: [card] }));
      const started = performance.now();
      const cards = Array.from({length: 500}, (_, i) => ({card_number: i + 1, feedback_url: `https://turnlypros.com/f/${(i + 1).toString(16).padStart(64, '0')}`}));
      const bytes = await buildFlyerPdf({ ...base, cards });
      const large = await PDFLib.PDFDocument.load(bytes);
      return { duplicateRejected, singlePages: one.getPageCount(), maxPages: large.getPageCount(), maxBytes: bytes.length, ms: performance.now() - started };
    });
    assert.equal(checks.duplicateRejected, true);
    assert.equal(checks.singlePages, 1);
    assert.equal(checks.maxPages, 125);
    assert.ok(checks.maxBytes < 20000000, 'Shared artwork should keep even 500 flyers under 20 MB');
    console.log('Maximum-batch PDF:', checks);
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
});
