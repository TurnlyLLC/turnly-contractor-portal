const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const C=require('../lib/owner-assistant-costs.cjs'),{PGlite}=require('@electric-sql/pglite');
test('billing requires final provider USD, includes both call legs, and never treats missing data as free',()=>{
 assert.equal(C.aiCents({status:'done',metadata:{cost:41,cost_fiat:0.008118}}),0.8118);
 assert.equal(C.aiCents({status:'processing',metadata:{cost_fiat:0}}),null);
 assert.equal(C.aiCents({status:'done',metadata:{cost:41}}),null);
 assert.equal(C.aiCents({status:'done',metadata:{cost_fiat:null}}),null);
 assert.equal(C.totalCosts([{status:'completed',price:'-0.0085',priceUnit:'USD'},{status:'completed',price:'-0.014',priceUnit:'USD'}]),2.25);
 assert.equal(C.totalCosts([{status:'completed',price:null,priceUnit:'USD'}]),null);
 assert.equal(C.totalCosts([{status:'in-progress',price:'0',priceUnit:'USD'}]),null);
 assert.equal(C.combined(2.25,0.8118),3.0618);assert.equal(C.combined(2.25,null),null);
});
test('completed holds release to actual charges, active/unknown holds remain, and calls fit unchanged $25 cap',async()=>{
 const db=new PGlite(),owner='11111111-1111-4111-8111-111111111111';try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create table profiles(id uuid primary key,role text,status text);create table integration_keys(id uuid primary key,name text,secret_hash text,prefix text,scopes text[],created_by uuid,expires_at timestamptz,revoked_at timestamptz,deny_record_deletion boolean);insert into profiles values('${owner}','admin','active');`);
 for(const f of ['20261117000000_private_owner_voice.sql','20261117131500_owner_voice_retry.sql','20261117160000_owner_sms.sql','20261117180000_owner_assistant_costs.sql'])await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations',f),'utf8'));
 await db.exec("update owner_sms_settings set setup_cents=1500,setup_month=date_trunc('month',now() at time zone 'America/New_York')::date");
 const reserve=async n=>(await db.query('select owner_voice_reserve_v2($1,$2) v',['CA'+String(n).padStart(32,'0'),owner])).rows[0].v;
 const a=await reserve(1);await db.query("select owner_voice_finish($1,'completed',302)",[a.id]);const b=await reserve(2);await db.query("select owner_voice_finish($1,'completed',14)",[b.id]);
 assert.equal((await reserve(3)).blocked,'budget');
 await db.query('update owner_voice_sessions set actual_cents=3.0618 where id=$1',[b.id]);
 assert.equal((await db.query('select owner_assistant_reserved() v')).rows[0].v,2204);
 const next=await reserve(3);assert.ok(next.id,'released short-call hold permits new call without raising limit');
 await db.query('update owner_voice_sessions set actual_cents=0 where id=$1',[next.id]);
 assert.equal((await db.query('select owner_assistant_reserved() v')).rows[0].v,2404,'active calls retain their safety hold');
 await db.query("select owner_voice_finish($1,'completed',0)",[next.id]);
 await db.query('update owner_voice_sessions set actual_cents=250 where id=$1',[b.id]);
 assert.equal((await db.query('select owner_assistant_reserved() v')).rows[0].v,2450,'actual charges above reservation must still count');
 assert.equal((await reserve(4)).blocked,'budget');
 }finally{await db.close();}
});
