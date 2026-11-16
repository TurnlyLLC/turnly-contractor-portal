const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Pricing=require('../lib/residential-pricing.cjs');
function fixture(coverage=async()=>({approved:true,service_city:'Durham'})){
 const rates=[],db={from(){throw Error('Planning must not read or write customer orders');}};
 const context={module:{exports:{}},console,require:p=>{
  if(p==='../lib/residential-server.cjs')return {body:async req=>req.body,database:()=>db,rate:async(db,req,key)=>rates.push(key),json:(res,status,value)=>Object.assign(res,{status,value})};
  if(p==='../lib/service-coverage.cjs')return {verify:coverage};
  if(p==='../lib/residential-pricing.cjs')return Pricing;
  return {};
 }};
 vm.runInNewContext(fs.readFileSync('api/gift-cards.js','utf8'),context);
 return {rates,async request(body){const res={};await context.module.exports({method:'POST',body},res);return res;}};
}
test('gift estimates use current booking pricing, one card, pets and custom-review rules',async()=>{
 const f=fixture();
 for(const input of [{service:'standard',sqft:1500,pets:'no'},{service:'deep',sqft:2000,pets:'yes'},{service:'move',sqft:4500,pets:'no'},{service:'listing',sqft:100,pets:'no'}]){
  const q=Pricing.quote({...input,frequency:'once'}),r=await f.request({action:'estimate',...input,quantity:25,amount_cents:1});
  assert.equal(r.status,200);assert.equal(r.value.amount_cents,q.amount_cents);assert.equal(r.value.remaining_cents,q.amount_cents-10000);assert.equal(r.value.review_required,q.review_required);assert.equal(r.value.pet_fee_cents,q.pet_fee_cents);
 }
 assert.deepEqual(f.rates,['gift-estimate','gift-estimate','gift-estimate','gift-estimate']);
 for(const input of [{service:'fake',sqft:1500},{service:'standard',sqft:0},{service:'standard',sqft:50001}])assert.equal((await f.request({action:'estimate',...input})).status,400);
});
test('gift coverage uses booking verifier and preserves outside/unavailable results without saving an address',async()=>{
 let received;const address={property_address:'207 Oak Hill Dr',city:'Durham',state:'NC',zip:'27712'};
 const f=fixture(async input=>{received=input;return {approved:false,message:'Outside service area'};});
 const r=await f.request({action:'coverage',...address});assert.equal(r.status,200);assert.equal(r.value.approved,false);assert.equal(received.property_address,address.property_address);assert.deepEqual(f.rates,['gift-coverage']);
 const unavailable=fixture(async()=>{throw Object.assign(Error('Address verification is temporarily unavailable.'),{status:503});});
 const error=await unavailable.request({action:'coverage',...address});assert.equal(error.status,503);assert.match(error.value.error,/unavailable/);
});
test('new checkout removes repeat email and makes sales classifications optional',()=>{
 const html=fs.readFileSync('gift-cards.html','utf8'),js=fs.readFileSync('gift-cards.js','utf8');
 assert.doesNotMatch(html,/name="confirm_email"|name="buyer_kind" required|name="service_zone" required/);
 assert.doesNotMatch(js,/confirm_email/);assert.match(html,/name="accepted" required/);
 assert.match(html,/name="email"[^>]*required/);assert.match(html,/One \$100 card per booking/);
});
