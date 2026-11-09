const {test}=require('node:test');
const assert=require('node:assert/strict');
const {apply,targets,message}=require('../lib/insurance-clarification.cjs');
const env={RESEND_API_KEY:'test',REFERRAL_FROM_EMAIL:'Turnly <admin@turnlypros.com>'};
function fixture(id){
 const t=targets[id],f={emails:[],audit:[],reviews:0,failEmail:false,ignoreReview:false};
 f.item={id:'item_3f09e5a2fdb441ba9283',title:'General Liability Insurance (COI)',state:'rejected',submission:{id:t.submission,hasFile:true,status:'rejected',reviewerNote:'Prior instructions'}};
 f.db={from(table){const filters={};return {select(){return this},eq(k,v){filters[k]=v;return this},async maybeSingle(){return {data:{id,email:'contractor@testing.invalid',role:'contractor',status:'active'}}},async limit(){return {data:f.audit.filter(r=>Object.entries(filters).every(([k,v])=>r[k]===v))}},async insert(row){f.audit.push(row);return {}}}}};
 f.transport=async(url,o)=>{
  if(url==='https://api.resend.com/emails'){f.emails.push(JSON.parse(o.body));return {ok:!f.failEmail,json:async()=>f.failEmail?{}:{id:'test-email'}}}
  if(url.endsWith('/review')){f.reviews++;if(!f.ignoreReview){const b=JSON.parse(o.body);Object.assign(f.item.submission,{status:b.decision,reviewerNote:b.note});f.item.state=b.decision==='approved'?'done':'rejected'}return {ok:true,json:async()=>({})}}
  return {ok:true,json:async()=>({items:[f.item]})};
 };
 return f;
}
test('all three notices correct the review first and send an apology with the retained limits',async()=>{
 for(const [id,t] of Object.entries(targets)){const f=fixture(id);const result=await apply(f.db,'actor',id,'token',f.transport,env);
 assert(t.note.length<=300);assert.equal(result.sent,true);assert.equal(f.item.submission.status,t.status);assert.equal(f.item.submission.reviewerNote,t.note);assert.equal(f.emails.length,1);assert.equal(f.audit.length,1);
 const mail=message(t);for(const expected of ['sent in error','$1,000,000','$2,000,000','certificate holder'])assert(mail.text.includes(expected));}
});
test('retries do not repeat the decision or email',async()=>{const id=Object.keys(targets)[1],f=fixture(id);await apply(f.db,'actor',id,'token',f.transport,env);assert((await apply(f.db,'actor',id,'token',f.transport,env)).already_sent);assert.equal(f.reviews,1);assert.equal(f.emails.length,1)});
test('unknown contractors, replacement files, missing files and expired COIs cannot be changed',async()=>{
 const id=Object.keys(targets)[1];for(const mutate of [f=>f.item.submission.id='new',f=>f.item.submission.hasFile=false,f=>f.item.state='expired']){const f=fixture(id);mutate(f);await assert.rejects(apply(f.db,'actor',id,'token',f.transport,env));assert.equal(f.reviews,0);assert.equal(f.emails.length,0)}
 const f=fixture(id);await assert.rejects(apply(f.db,'actor','unknown','token',f.transport,env));assert.equal(f.reviews,0);
});
test('unpersisted reviews block emails; failed email can be retried without losing saved review',async()=>{
 const id=Object.keys(targets)[1],f=fixture(id);f.ignoreReview=true;await assert.rejects(apply(f.db,'actor',id,'token',f.transport,env));assert.equal(f.emails.length,0);
 const g=fixture(id);g.failEmail=true;await assert.rejects(apply(g.db,'actor',id,'token',g.transport,env));assert.equal(g.item.submission.status,'approved');assert.equal(g.audit.length,0);g.failEmail=false;await apply(g.db,'actor',id,'token',g.transport,env);assert.equal(g.reviews,1);assert.equal(g.audit.length,1);
});
