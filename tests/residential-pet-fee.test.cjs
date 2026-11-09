const {test}=require('node:test'),assert=require('node:assert/strict');
const {quote}=require('../lib/residential-pricing.cjs'),{contractorPay}=require('../lib/residential-jobs.cjs'),{price}=require('../lib/customer-repeat-booking.cjs');
test('pet fee increases first and maintenance totals and contractor earnings before gift credits',()=>{
 for(const service of ['standard','deep','move','listing'])for(const sqft of [100,2000,4000]){
 const input={service,sqft,frequency:'once'},no=quote({...input,pets:'no'}),yes=quote({...input,pets:'yes',pet_fee_cents:0});
 assert.equal(yes.amount_cents,no.amount_cents+5000);assert.equal(yes.pet_fee_cents,5000);assert.equal(contractorPay({...yes,gift_applied_cents:10000}),contractorPay(no)+18);
 }
 const q=quote({service:'standard',sqft:2000,frequency:'weekly',pets:'yes'});assert.equal(q.amount_cents,31000);assert.equal(q.maintenance_cents,25000);
});
test('repeat booking uses saved pet details and carries fee into recurring prices',()=>{
 const b={sqft:2000,visit_details:{pets:'yes'}};
 const q=price(b,{service:'standard',frequency:'weekly'});
 assert.equal(q.amount_cents,25000);assert.equal(q.one_time_cents,31000);assert.equal(q.cleaning_cents,20000);assert.equal(q.savings_cents,6000);assert.equal(price(b,{service:"standard",pets:"no"}).amount_cents,26000);
});
