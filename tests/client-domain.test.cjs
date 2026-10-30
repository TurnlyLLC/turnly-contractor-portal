const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const A=require('../lib/residential-accounts.cjs');
const S=require('../lib/residential-server.cjs');

test('legacy customer links preserve referral queries and private fragments on the client domain',()=>{
 const source=fs.readFileSync(require.resolve('../client-redirect.js'),'utf8');
 for(const [pathname,search,hash] of [
  ['/customer.html','','#reset=example-reset-token'],
  ['/customer.html','','#setup=example-setup-token'],
  ['/residential-referral.html','?ref=TA-example&ba=BA-example','#booking=example&token=private-token'],
  ['/residential-referral.html','','#gift=example-gift-code'],
  ['/gift-cards.html','?ref=SALES-example','#order=example&token=private-token'],
  ['/gift-card-terms.html','',''],
  ['/crm-unsubscribe.html','','#private-token']
 ]){
  let redirected;const link={};
  vm.runInNewContext(source,{location:{pathname,search,hash,replace:v=>redirected=v},document:{getElementById:()=>link}});
  assert.equal(redirected,'https://client.turnlypros.com'+pathname+search+hash);
  assert.equal(link.href,redirected);
 }
});

test('customer APIs accept the new origin while retaining strict cookie and origin protections',()=>{
 assert.equal(S.ORIGIN,'https://client.turnlypros.com');
 for(const origin of [S.ORIGIN,'https://portal.turnlypros.com'])assert.doesNotThrow(()=>A.sameOrigin({headers:{origin,'content-type':'application/json'}}));
 for(const origin of ['https://client.turnlypros.com.attacker.test','http://client.turnlypros.com','null',undefined])assert.throws(()=>A.sameOrigin({headers:{origin,'content-type':'application/json'}}));
 assert.throws(()=>A.sameOrigin({headers:{origin:S.ORIGIN,'content-type':'text/plain'}}));
 let cookie;A.setCookie({setHeader:(_,value)=>cookie=value},'a'.repeat(64));
 assert.match(cookie,/__Host-turnly_customer=/);assert.match(cookie,/HttpOnly; Secure; SameSite=Strict/);assert.doesNotMatch(cookie,/Domain=/i);
});

test('client homepage routes to customer sign-in without redirecting staff pages',()=>{
 const routes=JSON.parse(fs.readFileSync(require.resolve('../vercel.json'),'utf8')).routes;
 const route=(host,path)=>routes.find(r=>r.src&&(!r.has||r.has.every(h=>h.value===host))&&new RegExp(r.src).test(path));
 assert.equal(route('client.turnlypros.com','/').dest,'/customer.html');
 assert.equal(route('client.turnlypros.com','/index.html').dest,'/customer.html');
 assert.equal(route('portal.turnlypros.com','/customer.html').dest,'/client-redirect.html');
 assert.equal(route('portal.turnlypros.com','/contractor-login.html'),undefined);
 assert.equal(route('client.turnlypros.com','/customer.html'),undefined);
 assert.equal(route('ba.turnlypros.com','/').dest,'/ba-login.html');
 assert.equal(route('sales.turnlypros.com','/').dest,'/sales-login.html');
});
