const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const J=require('../lib/residential-jobs.cjs');
test('pay uses full customer charge regardless of gift redemption and rounds to cents',()=>{
 for(const gift of [0,10000,20000])assert.equal(J.contractorPay({amount_cents:20000,gift_applied_cents:gift}),80);
 assert.equal(J.contractorPay({amount_cents:19999,gift_applied_cents:19999}),80);
 assert.equal(J.contractorPay({amount_cents:20001}),80);
 assert.equal(J.contractorPay({amount_cents:20002}),80.01);
 for(const amount of [undefined,0,-100,NaN,Infinity,100.5])assert.throws(()=>J.contractorPay({amount_cents:amount}),/valid total/);
});
test('approval computes pay from stored booking, never client-supplied pay',async()=>{
 const b={id:'test-booking',status:'scheduled',amount_cents:25000,gift_applied_cents:25000};let saved;
 const db={from(table){const q={select(){return q},eq(){return q},single:async()=>({data:b}),update(value){saved=value;return q},then(ok){return Promise.resolve({data:{}}).then(ok)}};return q;}};
 const S={body:async()=>({action:'admin_approve_job',id:b.id,pay_amount:'1'}),database:()=>db,admin:async()=> 'admin',checked:r=>r.data,json:(_,status,data)=>({status,data}),fail:(m)=>new Error(m)};
 const module={exports:{}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../api/residential-booking.js'),'utf8'),{module,require:n=>n.includes('residential-server')?S:n.includes('residential-jobs')?{...J,syncBooking:async()=>({status:'pending',metadata:{},property_checklist_items:[{task:'Clean'}]})}:n.includes('agent-referrals')?{uuid:()=>true}:{}});
 const result=await module.exports({method:'POST'},{});assert.equal(result.status,200);assert.equal(saved.pay_amount,100);assert.equal(saved.metadata.cleaner_payout_base,250);assert.equal(saved.metadata.cleaner_payout_rate,0.4);
});
