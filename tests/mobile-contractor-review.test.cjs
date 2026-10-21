const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const mobile=require('../lib/mobile-contractor-review.cjs');
const {deletion}=require('../api/contractor-review.js');
test('mobile connection uses the admin session and limits exposed personal data',async()=>{
  const id=randomUUID();let request;
  const call=mobile.client('admin-jwt',async(url,options)=>{request={url,options};return {ok:true,json:async()=>({complete:false,contact:{ssn:'private'},items:[{id:'one',title:'Intake',submission:{id:'sub',fields:{ssn:'private'},ip:'private',hasFile:true}}]})};});
  const result=await mobile.file(call,id);
  assert.equal(request.options.headers['X-Supabase-Auth'],'admin-jwt');
  assert.equal(request.options.redirect,'error');assert.equal(JSON.stringify(result).includes('private'),false);
});
test('mobile review rejects stale and expired submissions and unsafe file URLs',async()=>{
  const id=randomUUID(),call=async path=>path.endsWith('/link')?{url:'https://other.example/file'}:{items:[{state:'expired',submission:{id:'current'}}]};
  await assert.rejects(mobile.review(call,id,{submission_id:'old',status:'approved'}),/changed/);
  await assert.rejects(mobile.review(call,id,{submission_id:'current',status:'approved'}),/expired/);
  await assert.rejects(mobile.review(call,id,{submission_id:'current',action:'mobile_file'}),/Invalid document/);
});
test('overrides waive only unfinished required items and revoke only portal waivers',async()=>{
  const id=randomUUID(),writes=[];let reads=0;
  const items=[{id:'done',required:true,state:'done',submission:{source:'user'}},{id:'missing',required:true,state:'todo'},{id:'optional',required:false,state:'todo'}];
  await mobile.override(async(path,body)=>{if(body){writes.push(path);return {ok:true};}return {items,complete:++reads>1};},id,'Established staff');
  assert.deepEqual(writes,[`contractors/${id}/items/missing/mark`]);
  writes.length=0;
  await mobile.override(async(path,body)=>{if(body){writes.push(path);return {ok:true};}return {items:[{id:'waiver',state:'done',submission:{source:'admin',reviewerNote:mobile.OVERRIDE_NOTE+'Staff'}},{id:'original',submission:{source:'admin',reviewerNote:'Uploaded original'}}]};},id,'Review again',true);
  assert.deepEqual(writes,[`contractors/${id}/items/waiver/reset`]);
});

test('individual toggle targets one contractor/item, retains file reference, and restores with access paused first',async()=>{
 const id=randomUUID(),events=[];let row={id:'w9',required:true,state:'done',submission:{id:'original_doc',source:'app',hasFile:true}},other={id:'insurance',required:true,state:'todo'};
 const call=async(path,body)=>{if(body){events.push(path);row={...row,state:path.endsWith('/mark')?'done':'rejected',submission:{id:path.endsWith('/mark')?'waiver':'reset',source:'admin',hasFile:false,reviewerNote:body.note}};return {ok:true};}return {items:[row,other],complete:false};};
 await mobile.requirement(call,id,{item_id:'w9',required:false,expected_submission_id:'original_doc'});
 assert.deepEqual(events,[`contractors/${id}/items/w9/mark`]);
 let file=await mobile.file(call,id);assert(file.items[0].waived);assert.equal(file.items[0].previousSubmissionId,'original_doc');
 await assert.rejects(mobile.requirement(call,id,{item_id:'w9',required:true,expected_submission_id:'old'}),/changed/);
 await mobile.requirement(call,id,{item_id:'w9',required:true,expected_submission_id:'waiver'},async()=>events.push('pause-jobs'));
 assert.deepEqual(events.slice(-2),['pause-jobs',`contractors/${id}/items/w9/reset`]);
 file=await mobile.file(call,id);assert.equal(file.items[0].waived,false);assert.equal(file.items[0].previousSubmissionId,'original_doc');assert.equal(file.items[1].state,'todo');
});

test('restore aborts without changing the native requirement when access cannot be paused',async()=>{
 const id=randomUUID(),writes=[],row={id:'agreement',required:true,state:'done',submission:{id:'waiver',source:'admin',reviewerNote:mobile.REQUIREMENT_NOTE+'Exception'}};
 const call=async(path,body)=>{if(body)writes.push(path);return {items:[row]};};
 await assert.rejects(mobile.requirement(call,id,{item_id:'agreement',required:true,expected_submission_id:'waiver'},async()=>{throw Error('Database unavailable');}),/Database/);assert.deepEqual(writes,[]);
});

test('previous document access remains scoped to the selected contractor and cannot review history as current',async()=>{
 const id=randomUUID(),call=async path=>path.endsWith('/link')?{url:mobile.ORIGIN+'/onboarding/f/original'}:{items:[{id:'w9',required:true,state:'done',submission:{id:'waiver',source:'admin',reviewerNote:mobile.REQUIREMENT_NOTE+'Exception [Previous submission: original]'}}]};
 assert.equal((await mobile.review(call,id,{action:'mobile_file',submission_id:'original'})).url,mobile.ORIGIN+'/onboarding/f/original');
 await assert.rejects(mobile.review(call,id,{action:'mobile_file',submission_id:'another-persons-file'}),/changed/);
 await assert.rejects(mobile.review(call,id,{action:'mobile_review',submission_id:'original',status:'approved'}),/changed/);
});
test('deletion requires a current request and confirmation, soft deletes, and supports retry',async()=>{
  const id=randomUUID(),actor=randomUUID(),requested='2026-10-12T10:00:00Z',events=[];
  const call=async()=>({contractors:[{userId:id,deletionRequested:requested}]});
  const db={rpc:async(_,args)=>{events.push(args.p_action);return {data:{status:args.p_action==='complete'?'approved':'processing'}};},auth:{admin:{getUserById:async()=>({data:{user:{id}}}),deleteUser:async(uid,soft)=>{assert.equal(uid,id);assert.equal(soft,true);events.push('soft-delete');return {};}}}};
  const input={id,action:'approve_deletion',requested_at:requested,reason:'User requested removal'};
  await assert.rejects(deletion(db,actor,{...input,requested_at:'old'},call),/changed/);
  await assert.rejects(deletion(db,actor,input,call),/Confirm/);assert.deepEqual(events,[]);
  await deletion(db,actor,{...input,confirm:true},call);assert.deepEqual(events,['begin','soft-delete','complete']);
  events.length=0;db.auth.admin.deleteUser=async()=>({error:{message:'Unavailable'}});
  await assert.rejects(deletion(db,actor,{...input,confirm:true},call),/Retry approval/);assert.deepEqual(events,['begin']);
});
