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
  await mobile.override(async(path,body)=>{if(body){writes.push(path);return {ok:true};}return {items:[{id:'waiver',submission:{source:'admin',reviewerNote:mobile.OVERRIDE_NOTE+'Staff'}},{id:'original',submission:{source:'admin',reviewerNote:'Uploaded original'}}]};},id,'Review again',true);
  assert.deepEqual(writes,[`contractors/${id}/items/waiver/reset`]);
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
