const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
test('voice budget, one-use session ownership, and key revocation',async()=>{
 const db=new PGlite();
 try {
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table profiles(id uuid primary key,role text,status text);
 create table integration_keys(id uuid primary key,name text,secret_hash text,prefix text,scopes text[],created_by uuid,expires_at timestamptz,revoked_at timestamptz);
 insert into profiles values('11111111-1111-4111-8111-111111111111','admin','active');`);
 await db.exec(fs.readFileSync(require('node:path').join(__dirname,'../supabase/migrations/20261117000000_private_owner_voice.sql'),'utf8'));
 const owner='11111111-1111-4111-8111-111111111111',sid='CA'+'a'.repeat(32);
 const reserve=async s=>(await db.query('select owner_voice_reserve($1,$2) result',[s,owner])).rows[0].result;
 const a=await reserve(sid);assert.equal(a.replayed,false);assert.equal((await reserve(sid)).replayed,true);
 assert.equal(await reserve('CA'+'b'.repeat(32)),null);
 const accept=async()=> (await db.query(`select owner_voice_accept($1,'call_test','22222222-2222-4222-8222-222222222222','hash','prefix','sealed',$2) result`,[a.id,owner])).rows[0].result;
 assert.equal(await accept(),null,'cannot accept before owner presses 1');
 await db.query("update owner_voice_sessions set callback_sid=$1,state='connecting' where id=$2",['CA'+'c'.repeat(32),a.id]);
 assert.equal((await accept()).key_sealed,'sealed');assert.equal((await accept()).key_sealed,'sealed');
 assert.equal((await db.query('select count(*)::int n from integration_keys')).rows[0].n,1);
 await db.query("select owner_voice_finish($1,'completed',42)",[a.id]);
 assert.equal(await accept(),null,'completed call cannot reopen');
 assert.ok((await db.query('select revoked_at from integration_keys')).rows[0].revoked_at);
 // Even uncompleted/failed calls retain reservations; provider uncertainty cannot free spend capacity.
 await db.exec("update owner_voice_sessions set created_at=now()-interval '11 minutes'");
 for(let n=0;n<10;n++){await reserve('CA'+String(n).padStart(32,'0'));await db.exec("update owner_voice_sessions set created_at=now()-interval '11 minutes'");}
 assert.equal(await reserve('CA'+'f'.repeat(32)),null,'monthly allowance is enforced');
 }finally{await db.close();}
});
