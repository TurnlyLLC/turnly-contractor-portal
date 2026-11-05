const {test}=require('node:test'),assert=require('node:assert/strict'),social=require('../lib/ba-social.cjs'),{PNG}=require('pngjs'),decode=require('jsqr');
test('social card artwork decodes to the exact BA booking URL',async()=>{
 for(const code of ['BA-1234567890ABCDEF','BA-FEDCBA0987654321']){
  const png=PNG.sync.read(await social.image(code));assert.equal(decode(new Uint8ClampedArray(png.data),png.width,png.height).data,social.booking(code));
  const html=social.page(code);assert.ok(html.includes('property="og:image"'));assert.ok(html.includes('href="'+social.booking(code)+'"'));assert.ok(html.includes(social.shareUrl(code)));assert.match(html,/referral commission/);
 }
});
test('platform drafts contain promotional text and preserve attribution',async()=>{
 const {draftLinks}=await import('../ba-sharing.mjs'),code='BA-1234567890ABCDEF',d=draftLinks(code);
 assert.equal(new URL(d.facebook).searchParams.get('u'),d.card);
 assert.equal(new URL(d.x).searchParams.get('url'),d.card);
 assert.match(new URL(d.x).searchParams.get('text'),/referral commission/);
 assert.ok(new URL(d.threads).searchParams.get('text').includes(d.card));
 assert.throws(()=>social.page('<script>'));await assert.rejects(social.image('bad'));
});
test('public social endpoint rejects invalid, inactive and unready referrals',async()=>{
 const vm=require('node:vm'),fs=require('node:fs');let eligible=false,calls=0;
 const context={module:{exports:{}},require:p=>p.includes('residential-server')?{database:()=>({})}:p.includes('ambassadors')?{referralMember:async()=>{calls++;return eligible?{code:'BA-1234567890ABCDEF'}:null;}}:social};
 vm.runInNewContext(fs.readFileSync(require.resolve('../api/ba-share.js'),'utf8'),context);const run=async(query,method='GET')=>{const r={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},end(body){this.body=body;}};await context.module.exports({query,method},r);return r;};
 assert.equal((await run({code:'bad'})).statusCode,400);assert.equal(calls,0);
 assert.equal((await run({code:'BA-1234567890ABCDEF'})).statusCode,404);
 eligible=true;assert.match((await run({code:'BA-1234567890ABCDEF'})).body,/og:image/);
 assert.equal((await run({code:'BA-1234567890ABCDEF'},'POST')).statusCode,405);
});
