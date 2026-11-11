const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Ads=require('../lib/gift-ad-tracking.cjs');
const now=Date.now(),order={id:'11111111-1111-4111-8111-111111111111',status:'paid',paid_at:new Date(now-1000).toISOString(),payment_intent:'pi_confirmed',amount_cents:20000,quantity:2},ad={consented_at:new Date().toISOString(),fbc:`fb.1.${now}.testclick`,fbp:`fb.1.${now}.123456`};
test('only recent confirmed payments with consent produce Purchase; no private receipt data',()=>{
 const e=Ads.purchase({...order,email:'secret@example.com',token:'secret-token',code:'gift-secret'},ad,now);
 assert.equal(e.custom_data.value,200);assert.equal(e.event_name,'Purchase');assert.equal(e.event_id,'turnly-gift-'+order.id);
 assert.equal(e.event_source_url,'https://client.turnlypros.com/gift-cards.html');assert.doesNotMatch(JSON.stringify(e),/secret|token|email/);
 for(const patch of [{status:'pending'},{status:'review'},{payment_intent:null},{refunded_cents:100},{disputed:true},{paid_at:null},{paid_at:new Date(now-7*86400000).toISOString()}])assert.equal(Ads.purchase({...order,...patch},ad,now),null);
 assert.equal(Ads.purchase(order,{},now),null);
 assert.equal(Ads.purchase(order,ad,now).event_id,e.event_id);
});
test('server respects explicit consent and GPC, validates identifiers and ignores extra client data',()=>{
 const input={consent:true,...ad,email:'private',amount_cents:1};
 assert.equal(Ads.attribution({...input,consent:false},{headers:{}}),null);
 assert.equal(Ads.attribution(input,{headers:{'sec-gpc':'1'}}),null);
 assert.equal(Ads.attribution({consent:true,fbc:'https://evil.test/token'},{headers:{}}),null);
 assert.equal(Ads.attribution(input,{headers:{}}).email,undefined);
});
test('Meta rejection and network errors remain retryable, accepted test events use test channel',async()=>{
 let sent;
 await Ads.send(Ads.purchase(order,ad),{testCode:'TEST_ONLY',fetcher:async(url,options)=>{sent=JSON.parse(options.body);return {ok:true,json:async()=>({events_received:1})}}});
 assert.equal(sent.test_event_code,'TEST_ONLY');assert.equal(sent.data.length,1);
 await assert.rejects(Ads.send({}, {fetcher:async()=>({ok:false,json:async()=>({error:{message:'failure'}})})}),/delivery failed/);
});
test('browser has no tracking without consent; GPC blocks storage and no external pixel executes',()=>{
 const source=fs.readFileSync(require.resolve('../gift-ad-consent.js'),'utf8');
 function run(checked,gpc){let writes=0;const choice={checked,addEventListener(){}},store={};const context={window:{},navigator:{globalPrivacyControl:gpc},document:{querySelector:s=>s==='#giftAdConsent'?choice:{}},localStorage:{getItem:k=>store[k],setItem:(k,v)=>{writes++;store[k]=v},removeItem:k=>delete store[k]},location:{search:'?fbclid=testclick#token=secret'},URLSearchParams,crypto:require('node:crypto').webcrypto,Uint32Array,Date};vm.runInNewContext(source,context);return {result:context.window.turnlyGiftAttribution(),writes};}
 assert.equal(run(false,false).writes,0);assert.equal(run(true,true).writes,0);
 assert.equal(run(true,false).result.consent,true);assert.doesNotMatch(source,/fbevents|connect.facebook/);
});
test('private tracking table rejects public access',async()=>{
 const {PGlite}=require('@electric-sql/pglite'),db=new PGlite();
 try{await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create table gift_orders(id uuid primary key);');await db.exec(fs.readFileSync(require.resolve('../docs/gift-purchase-tracking.sql'),'utf8'));
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(db.query('select * from gift_ad_attribution'),/permission denied/);await db.exec('reset role');}
 }finally{await db.close();}
});
