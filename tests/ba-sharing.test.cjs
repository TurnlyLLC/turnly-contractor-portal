const {test}=require('node:test'),assert=require('node:assert/strict');
const {sharingAssets}=require('../lib/ba-sharing.cjs');
const {PNG}=require('pngjs'),decode=require('jsqr');
test('each ambassador QR decodes to their exact attributed booking link',async()=>{
 for(const code of ['BA-1234567890ABCDEF','BA-FEDCBA0987654321']){
  const assets=await sharingAssets({referrals_ready:true,code});
  const png=PNG.sync.read(Buffer.from(assets.qr.split(',')[1],'base64'));
  assert.equal(decode(new Uint8ClampedArray(png.data),png.width,png.height).data,assets.url);
  assert.equal(new URL(assets.url).searchParams.get('ba'),code);
  assert.equal(new URL(assets.url).hostname,'client.turnlypros.com');
 }
});
test('sharing assets remain unavailable until eligible; malformed codes rejected',async()=>{
 assert.equal(await sharingAssets(null),null);
 assert.equal(await sharingAssets({referrals_ready:false,code:'BA-1234567890ABCDEF'}),null);
 await assert.rejects(sharingAssets({referrals_ready:true,code:'invalid'}));
});
test('social links preserve attribution and captions include disclosure',async()=>{
 const {sharingPanel,caption}=await import('../ba-sharing.mjs');
 const member={referrals_ready:true,code:'BA-1234567890ABCDEF'},assets=await sharingAssets(member);
 const html=sharingPanel(member,assets);
 assert.ok(caption(assets.url).includes(assets.url));assert.match(caption(assets.url),/referral commission/);
 const fb=html.match(/href="(https:\/\/www.facebook.com[^\"]+)"/)[1];
 assert.equal(new URL(fb).searchParams.get('u'),assets.url);
 assert.match(html,/Download QR code/);assert.match(html,/Download promo image/);
 assert.match(html,/Download clickable PDF/);
 assert.ok(html.includes(`href="${assets.url}"`));
 assert.ok(!sharingPanel({referrals_ready:false},assets).includes('data:image'));
});
test('downloaded PDF CTA links to the same ambassador booking URL as the QR',async()=>{
 const {createPromoPdf,CTA,SIZE}=await import('../ba-promo-layout.mjs'),PDFLib=require('pdf-lib');
 for(const code of ['BA-1234567890ABCDEF','BA-FEDCBA0987654321']){
  const assets=await sharingAssets({referrals_ready:true,code});
  const png=Buffer.from(assets.qr.split(',')[1],'base64');
  const bytes=await createPromoPdf(png,assets.url,PDFLib),doc=await PDFLib.PDFDocument.load(bytes);
  const annotations=doc.getPages()[0].node.lookup(PDFLib.PDFName.of('Annots'),PDFLib.PDFArray);
  const annotation=annotations.lookup(0,PDFLib.PDFDict),action=annotation.lookup(PDFLib.PDFName.of('A'),PDFLib.PDFDict);
  assert.equal(action.lookup(PDFLib.PDFName.of('URI')).decodeText(),assets.url);
  const rect=annotation.lookup(PDFLib.PDFName.of('Rect'),PDFLib.PDFArray);
  assert.deepEqual(rect.asArray().map(n=>n.asNumber()),[CTA.x,SIZE-CTA.y-CTA.height,CTA.x+CTA.width,SIZE-CTA.y]);
 }
 await assert.rejects(createPromoPdf(new Uint8Array(),'https://example.com',PDFLib));
});
