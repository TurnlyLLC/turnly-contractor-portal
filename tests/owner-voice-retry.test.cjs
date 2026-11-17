const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite'),V=require('../lib/owner-voice.cjs');
const id='11111111-1111-4111-8111-111111111111';
test('completed calls retry immediately; active calls, rapid spam and monthly budget remain blocked',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table profiles(id uuid primary key,role text,status text);
 create table integration_keys(id uuid primary key,name text,secret_hash text,prefix text,scopes text[],created_by uuid,expires_at timestamptz,revoked_at timestamptz);
 insert into profiles values('${id}','admin','active');`);
 for(const file of ['20261117000000_private_owner_voice.sql','20261117131500_owner_voice_retry.sql'])await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations',file),'utf8'));
 const reserve=async n=>(await db.query('select owner_voice_reserve_v2($1,$2) result',['CA'+String(n).padStart(32,'0'),id])).rows[0].result;
 const end=async row=>db.query("select owner_voice_finish($1,'completed',14)",[row.id]);
 const a=await reserve(1);assert.ok(a.id);assert.equal((await reserve(1)).replayed,true);
 assert.equal((await reserve(2)).blocked,'active');await end(a);
 const b=await reserve(2);assert.ok(b.id,'no 10-minute wait after hangup');await end(b);
 const c=await reserve(3);await end(c);assert.equal((await reserve(4)).blocked,'rate');
 await db.exec("update owner_voice_sessions set created_at=now()-interval '2 minutes'");
 for(let n=4;n<=11;n++){const r=await reserve(n);assert.ok(r.id);await end(r);await db.exec("update owner_voice_sessions set created_at=now()-interval '2 minutes'");}
 assert.equal((await reserve(12)).blocked,'budget');
 assert.equal((await db.query('select sum(reserved_cents)::int total from owner_voice_sessions')).rows[0].total,2200);
 }finally{await db.close();}
});
test('verified answered callback connects directly; wrong number, ringing and replay cannot connect',async()=>{
 process.env.CRON_SECRET='test-master';
 const c={enabled:true,provider:'elevenlabs',elevenKey:'test',elevenAgent:'agent_test',owner:'+19199040553',number:'+12525425686',ownerId:id,project:'proj_test',account:'test',expectedAccount:'test',auth:'test'};
 const p={CallSid:'CA'+'a'.repeat(32),To:c.owner,From:c.number,CallStatus:'in-progress'};
 const row={id,callback_sid:p.CallSid,state:'reserved',expires_at:new Date(Date.now()+60000).toISOString()};
 const db={from(){return {select(){return {eq(){return {maybeSingle:async()=>({data:row})};}};},update(){return {eq(){return {eq(){return {select:async()=>{if(row.state!=='reserved')return {data:[]};row.state='connecting';return {data:[{id}]};}};}};}};}};}};
 let connected=0;const connect=async()=>{connected++;return '<Response><Connect/></Response>';};
 await V.callback(db,{...p,To:'+12025550123'},id,false,c,connect);
 await V.callback(db,{...p,CallStatus:'ringing'},id,false,c,connect);assert.equal(connected,0);
 const xml=await V.callback(db,p,id,false,c,connect);assert.match(xml,/<Connect/);assert.doesNotMatch(xml,/<Say|<Gather/);
 await V.callback(db,p,id,false,c,connect);assert.equal(connected,1);
});
