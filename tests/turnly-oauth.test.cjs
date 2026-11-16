const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{PGlite}=require('@electric-sql/pglite'),O=require('../lib/turnly-oauth.cjs');
test('OAuth binds consent to ChatGPT, the MCP resource, full scope and S256 PKCE',()=>{
 const q={response_type:'code',client_id:'22222222-2222-4222-8222-222222222222',redirect_uri:O.CALLBACK,resource:O.RESOURCE,scope:O.SCOPE,code_challenge:O.challenge('a'.repeat(43)),code_challenge_method:'S256',state:'random-state'};
 assert.equal(O.authorization(q).resource,O.RESOURCE);
 for(const changes of [{redirect_uri:'https://evil.example/callback'},{resource:'https://evil.example'},{scope:'admin'},{code_challenge_method:'plain'},{state:''},{client_id:'https://evil.example'}])assert.throws(()=>O.authorization({...q,...changes}));
 assert.equal(O.registration({redirect_uris:[O.CALLBACK]}).token_endpoint_auth_method,'none');
 assert.throws(()=>O.registration({redirect_uris:[O.CALLBACK,'https://evil.example']}));
 assert.throws(()=>O.registration({redirect_uris:[O.CALLBACK],token_endpoint_auth_method:'client_secret_post'}));
 assert.equal(O.metadata().issuer,O.protectedResource().authorization_servers[0]);
 assert.equal(O.metadata().authorization_response_iss_parameter_supported,true);
});
test('OAuth SQL enforces atomic code exchange, refresh rotation, expiry, active admin and grant revocation',async()=>{
 const db=new PGlite();try{
 await db.exec("create role anon;create role authenticated;create role service_role;create table profiles(id uuid primary key,role text,status text);create table integration_keys(id uuid primary key default gen_random_uuid(),name text,prefix text,secret_hash text unique,scopes text[],created_by uuid,expires_at timestamptz,revoked_at timestamptz);create function integration_use_key(p_hash text,p_scope text) returns uuid language sql as $$ select k.id from integration_keys k join profiles p on p.id=k.created_by where k.secret_hash=p_hash and k.revoked_at is null and k.expires_at>now() and p.role='admin' and p.status='active' and ('platform:full'=any(k.scopes) or p_scope=any(k.scopes)) $$;");
 await db.exec(fs.readFileSync('docs/oauth-schema.sql','utf8'));
 const actor='11111111-1111-4111-8111-111111111111',client='22222222-2222-4222-8222-222222222222',other='33333333-3333-4333-8333-333333333333';
 await db.query("insert into profiles values($1,'admin','active');",[actor]);await db.query('insert into integration_oauth_clients(id,redirect_uri) values($1,$3),($2,$3)',[client,other,O.CALLBACK]);
 const code=async(name,expiry="now()+interval '5 minutes'")=>db.query(`insert into integration_oauth_codes(code_hash,client_id,created_by,redirect_uri,resource,scope,challenge,expires_at) values($1,$2,$3,$4,$5,'platform:full','challenge',${expiry})`,[name,client,actor,O.CALLBACK,O.RESOURCE]);
 const exchange=async(kind,hash,access,refresh,over={})=>(await db.query('select integration_oauth_exchange($1,$2,$3,$4,$5,$6,$7,$8,$9) r',[kind,hash,over.challenge||'challenge',over.redirect||O.CALLBACK,over.client||client,over.resource||O.RESOURCE,access,refresh,'root-'+access])).rows[0].r;
 const use=async(token)=>(await db.query("select integration_use_oauth($1,'payments:write') id",[token])).rows[0].id;
 await code('c1');assert.equal((await exchange('code','c1','a1','r1',{challenge:'wrong'})).ok,false);assert.equal((await exchange('code','c1','a1','r1',{client:other})).ok,false);assert.equal((await exchange('code','c1','a1','r1',{resource:'wrong'})).ok,false);assert.equal((await exchange('code','c1','a1','r1',{redirect:'wrong'})).ok,false);
 assert.equal((await exchange('code','c1','a1','r1')).ok,true);assert.ok(await use('a1'));assert.equal(await use('r1'),null);
 assert.equal((await exchange('refresh','r1','a2','r2')).ok,true);assert.ok(await use('a2'));assert.equal((await exchange('refresh','r1','a3','r3')).ok,false);assert.equal(await use('a1'),null);assert.equal(await use('a2'),null);
 await code('c2');await exchange('code','c2','a4','r4');assert.equal((await exchange('code','c2','a5','r5')).ok,false);assert.equal(await use('a4'),null);
 await code('expired',"now()-interval '1 minute'");assert.equal((await exchange('code','expired','a6','r6')).ok,false);
 await code('c3');await exchange('code','c3','a7','r7');await db.query("update integration_oauth_tokens set expires_at=now()-interval '1 second' where token_hash='a7'");assert.equal(await use('a7'),null);
 await db.query("update profiles set status='disabled' where id=$1",[actor]);assert.equal((await exchange('refresh','r7','a8','r8')).ok,false);await db.query("update profiles set status='active' where id=$1",[actor]);
 await code('c4');await exchange('code','c4','a9','r9');await db.query('select integration_oauth_revoke($1,$2)',[other,'r9']);assert.ok(await use('a9'));await db.query('select integration_oauth_revoke($1,$2)',[client,'r9']);assert.equal(await use('a9'),null);
 await db.exec('set role anon');await assert.rejects(()=>db.query('select * from integration_oauth_tokens'));await assert.rejects(()=>db.query("select integration_use_oauth('a9','payments:write')"));
 }finally{await db.close();}
});
