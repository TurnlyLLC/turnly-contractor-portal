const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const T=require('../lib/crm-training.cjs'),V=require('../lib/crm-voice.cjs');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('a previously prepared call cannot connect after training becomes required',async()=>{
 const keys=['TWILIO_ACCOUNT_SID','TWILIO_AUTH_TOKEN','TWILIO_API_KEY_SID','TWILIO_API_KEY_SECRET','TWILIO_TWIML_APP_SID','TWILIO_VOICE_NUMBER','TWILIO_VOICE_ENABLED'];
 const old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));keys.forEach(k=>process.env[k]=k==='TWILIO_VOICE_ENABLED'?'true':'test');
 let failed=false;
 try{
 const db={rpc:async(name)=>({data:name==='crm_training_ready'?false:{user_id:id(1),lead_id:id(2),phone:'+19195550100'}}),from:table=>{assert.equal(table,'crm_voice_calls');return {update:values=>({eq:async()=>{failed=values.status==='failed';return {data:null};}})};}};
 const xml=await V.connect(db,{Intent:id(3),CallSid:'CA'+'1'.repeat(32)});assert.match(xml,/<Hangup/);assert.doesNotMatch(xml,/<Dial/);assert.ok(failed);
 }finally{keys.forEach(k=>old[k]===undefined?delete process.env[k]:process.env[k]=old[k]);}
});
test('calling fails closed before tokens, reservations or lead access when training is incomplete',async()=>{
 const db={rpc:async(name)=>{assert.equal(name,'crm_training_ready');return {data:false};}};
 await assert.rejects(V.prepare(db,{id:id(1)},{} ,{}),e=>e.status===403&&/both training videos/.test(e.message));
 await assert.rejects(T.requireComplete({rpc:async()=>({error:new Error('DB unavailable')})},{id:id(1)}));
 await T.requireComplete({rpc:async()=>({data:true})},{id:id(1)});
});
test('playback requires elapsed time, rejects skipping, saves resume, isolates accounts and gates review',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create table profiles(id uuid primary key);insert into profiles values('${id(1)}'),('${id(2)}');`);
 await db.exec(fs.readFileSync('supabase/migrations/20261021123800_crm_required_sales_training.sql','utf8'));
 const progress=async(lesson,pos,start=false,session=id(3))=>(await db.query('select crm_training_record($1,$2,$3,$4,$5) p',[id(1),lesson,session,pos,start])).rows[0].p;
 const ready=async(user=id(1))=>(await db.query('select crm_training_ready($1) r',[user])).rows[0].r;
 const elapsed=()=>db.exec(`update crm_training_progress set last_tick=clock_timestamp()-interval '4 seconds' where user_id='${id(1)}' and playback_session is not null`);
 assert.equal(await ready(),false);
 await assert.rejects(db.query('select crm_training_acknowledge($1)',[id(1)]),/Finish both/);
 await progress('introduction',0,true);let p=await progress('introduction',148.33);assert.equal(p.watched_seconds,0);assert.equal(p.completed_at,null);
 await elapsed();p=await progress('introduction',4);assert.equal(p.watched_seconds,4);
 await progress('introduction',4,true);p=await progress('introduction',4);assert.equal(p.watched_seconds,4);
 // Opening another lesson invalidates the previous video's playback session.
 await progress('portal',0,true,id(4));await assert.rejects(progress('introduction',5),/playback changed/);
 await progress('introduction',4,true);
 for(let pos=8;pos<148.33;pos+=4){await elapsed();await progress('introduction',pos);}
 await elapsed();p=await progress('introduction',148.33);assert.ok(p.completed_at);
 assert.equal(await ready(),false);await assert.rejects(db.query('select crm_training_acknowledge($1)',[id(1)]),/Finish both/);
 await progress('portal',0,true);
 for(let pos=4;pos<292.58;pos+=4){await elapsed();await progress('portal',pos);}
 await elapsed();assert.ok((await progress('portal',292.58)).completed_at);
 assert.equal(await ready(),false);
 await db.query('select crm_training_acknowledge($1)',[id(1)]);assert.equal(await ready(),true);assert.equal(await ready(id(2)),false);
 await db.query('select crm_training_acknowledge($1)',[id(1)]);assert.equal((await db.query('select count(*) from crm_training_reviews')).rows[0].count,1);
 for(const role of ['anon','authenticated']){
 await db.exec('set role '+role);await assert.rejects(db.query('select * from crm_training_progress'),/permission denied/);
 await assert.rejects(db.query('select crm_training_acknowledge($1)',[id(2)]),/permission denied/);await db.exec('reset role');
 }
 }finally{await db.close();}
});
