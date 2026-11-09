const {test}=require('node:test');
const assert=require('node:assert/strict');
const {notify,message}=require('../lib/contractor-correction-email.cjs');
const {run}=require('../api/contractor-review.js');
const id='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const docId='bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const env={RESEND_API_KEY:'test-only',REFERRAL_FROM_EMAIL:'Turnly <admin@turnlypros.com>'};
function fixture(){
 const f={profile:{id,email:'contractor@testing.invalid',full_name:'A <Contractor>',role:'contractor',status:'active'},doc:{id:docId,profile_id:id,status:'rejected',title:'Insurance',review_notes:'Increase to $1M.\nSend <endorsements> & COI.',reviewed_at:'2026-11-09T16:00:00Z'},audit:[],emails:[],events:[],fail:false};
 f.item={id:'insurance',title:'Insurance',required:true,state:'rejected',submission:{id:'submission-1',status:'rejected',reviewerNote:f.doc.review_notes,reviewedAt:f.doc.reviewed_at}};
 f.db={from(table){const filters={};return {select(){return this;},eq(k,v){filters[k]=v;return this;},async maybeSingle(){return {data:table==='profiles'?f.profile:f.doc};},async limit(){return {data:f.audit.filter(x=>Object.entries(filters).every(([k,v])=>x[k]===v))};},async insert(row){f.audit.push(row);return {};}};}};
 f.transport=async(url,options)=>{
  if(url==='https://api.resend.com/emails'){f.events.push('email');f.emails.push({body:JSON.parse(options.body),headers:options.headers});return {ok:!f.fail,json:async()=>f.fail?{message:'provider failure'}:{id:'email-1'}};}
  if(url.endsWith('/review')){f.events.push('review');const body=JSON.parse(options.body);f.item.state=body.decision==='approved'?'done':'rejected';f.item.submission.status=body.decision;f.item.submission.reviewerNote=body.note;return {ok:true,json:async()=>({ok:true})};}
  return {ok:true,json:async()=>({items:[f.item]})};
 };
 return f;
}
test('email contains the exact saved note, correct recipient and portal link; HTML is escaped',async()=>{
 const f=fixture();const result=await notify(f.db,id,{source:'portal',id:docId,email:'attacker@other.invalid',reason:'wrong note'},'token',f.transport,env);
 assert.equal(result.sent,true);assert.deepEqual(f.emails[0].body.to,[f.profile.email]);
 assert(f.emails[0].body.text.includes(f.doc.review_notes));assert(f.emails[0].body.html.includes('&lt;endorsements&gt; &amp; COI.'));
 assert(f.emails[0].body.html.includes('https://portal.turnlypros.com/contractor-onboarding.html'));
 assert.equal(f.emails[0].body.reply_to,'admin@turnlypros.com');assert.equal(f.audit.length,1);
});
test('a saved successful delivery is not resent',async()=>{
 const f=fixture();const input={source:'portal',id:docId};await notify(f.db,id,input,'token',f.transport,env);
 const retry=await notify(f.db,id,input,'token',f.transport,env);assert.equal(retry.already_sent,true);assert.equal(f.emails.length,1);
});
test('failed delivery preserves correction and retry uses the same idempotency key',async()=>{
 const f=fixture();f.fail=true;const input={source:'portal',id:docId};
 assert.equal((await notify(f.db,id,input,'token',f.transport,env)).sent,false);assert.equal(f.doc.status,'rejected');assert.equal(f.audit.length,0);
 f.fail=false;assert.equal((await notify(f.db,id,input,'token',f.transport,env)).sent,true);
 assert.equal(f.emails[0].headers['Idempotency-Key'],f.emails[1].headers['Idempotency-Key']);
});
test('approved documents, replaced submissions and missing notes cannot be emailed',async()=>{
 for(const mutate of [f=>f.doc.status='approved',f=>f.doc.review_notes='',f=>f.profile.role='admin',f=>f.profile.email='']){
  const f=fixture();mutate(f);assert.equal((await notify(f.db,id,{source:'portal',id:docId},'token',f.transport,env)).sent,false);assert.equal(f.emails.length,0);
 }
 const f=fixture();assert.equal((await notify(f.db,id,{source:'mobile',id,submission_id:'old'},'token',f.transport,env)).sent,false);assert.equal(f.emails.length,0);
});
test('mobile corrections read the current saved submission and note',async()=>{
 const f=fixture();assert.equal((await notify(f.db,id,{source:'mobile',id,submission_id:'submission-1'},'token',f.transport,env)).sent,true);
 assert(f.emails[0].body.text.includes(f.item.submission.reviewerNote));
});
test('missing email configuration returns a clear failure without changing the review',async()=>{
 const f=fixture();const result=await notify(f.db,id,{source:'portal',id:docId},'token',f.transport,{});
 assert.equal(result.sent,false);assert.match(result.error,/not configured/);assert.equal(f.doc.status,'rejected');assert.equal(f.emails.length,0);
});
test('review API saves mobile correction before emailing and preserves success if email fails',async()=>{
 const prior={RESEND_API_KEY:process.env.RESEND_API_KEY,REFERRAL_FROM_EMAIL:process.env.REFERRAL_FROM_EMAIL};Object.assign(process.env,env);
 try{const f=fixture();f.fail=true;const result=await run(f.db,id,{action:'mobile_review',id,submission_id:'submission-1',status:'rejected',reason:'Please update insurance.'},'token',f.transport);
 assert.equal(result.ok,true);assert.equal(result.email.sent,false);assert.deepEqual(f.events,['review','email']);assert.equal(f.item.submission.reviewerNote,'Please update insurance.');
 }finally{for(const [k,v]of Object.entries(prior)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});
test('approval does not send a correction email',async()=>{
 const f=fixture();const result=await run(f.db,id,{action:'mobile_review',id,submission_id:'submission-1',status:'approved',reason:''},'token',f.transport);
 assert.equal(result.ok,true);assert.deepEqual(f.events,['review']);
});
test('portal upload review emails only after the decision is persisted',async()=>{
 const prior={RESEND_API_KEY:process.env.RESEND_API_KEY,REFERRAL_FROM_EMAIL:process.env.REFERRAL_FROM_EMAIL};Object.assign(process.env,env);
 try{
  const f=fixture();f.doc.storage_path='contractor-documents/insurance.pdf';f.doc.status='uploaded';
  f.db.rpc=async(_,input)=>{f.events.push('review');f.doc.status=input.p_status;f.doc.review_notes=input.p_reason;return {data:{ok:true}};};
  const result=await run(f.db,id,{action:'review_document',id:docId,status:'rejected',reason:'Please update coverage.',updated_at:'2026-11-09T15:00:00Z'},'token',f.transport);
  assert.equal(result.email.sent,true);assert.deepEqual(f.events,['review','email']);assert(f.emails[0].body.text.includes('Please update coverage.'));
  f.events=[];f.db.rpc=async()=>({error:{code:'P0001',message:'Stale document'}});
  await assert.rejects(run(f.db,id,{action:'review_document',id:docId,status:'rejected',reason:'Other note',updated_at:'2026-11-09T15:00:00Z'},'token',f.transport),/Stale/);
  assert.deepEqual(f.events,[]);
 }finally{for(const [k,v]of Object.entries(prior)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});
test('expired uploads can still receive a saved rejection email',async()=>{
 const f=fixture();f.item.state='expired';
 assert.equal((await notify(f.db,id,{source:'mobile',id,submission_id:'submission-1'},'token',f.transport,env)).sent,true);
});
