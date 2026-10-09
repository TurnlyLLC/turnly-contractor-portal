const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const A=require('../lib/residential-accounts.cjs'),S=require('../lib/residential-server.cjs');
test('passwords are salted and verified with scrypt; sessions are opaque secure cookies',async()=>{
 const password='A long example passphrase',first=await A.hashPassword(password),second=await A.hashPassword(password);
 assert.notEqual(first,second);assert.equal(await A.verifyPassword(password,first),true);assert.equal(await A.verifyPassword('wrong',first),false);assert.equal(await A.verifyPassword(password,null),false);await assert.rejects(A.hashPassword('short'));
 let cookie;A.setCookie({setHeader(k,v){cookie=v}},'a'.repeat(64));assert.match(cookie,/HttpOnly; Secure; SameSite=Strict/);assert.match(cookie,/__Host-/);assert.equal(A.sessionToken({headers:{cookie}}),'a'.repeat(64));
 assert.throws(()=>A.sameOrigin({headers:{origin:'https://attacker.example','content-type':'application/json'}}),/customer portal/);
});
function harness(){
 const seen=[],sent=[],db={from(table){const q={filters:[],select(){return q},eq(k,v){q.filters.push([k,v]);return q},is(k,v){q.filters.push([k,v]);return q},gt(){return q},order(){return q},range(){return q.run()},in(k,v){q.filters.push([k,v]);return q},async run(){seen.push({table,filters:q.filters});if(table==='residential_accounts')return {data:null};if(table==='referral_bookings')return {data:[{id:'mine',email:'owner@example.com'}],count:1};if(table==='assignment_blocks')return {data:[{id:'mine',status:'pending'}]};return {data:null};},then(ok,no){return q.run().then(ok,no)},maybeSingle(){return q.run()}};return q;}};
 const owned={email:'booker@example.com',name:'Booker',status:'scheduled'};
 const s={...S,database:()=>db,rate:async()=>{},owned:async()=>owned};
 const a={...A,account:async()=>({id:'owner',email:'owner@example.com',name:'Owner'}),hashPassword:async()=> 'safe-hash',sendToken:async(...args)=>sent.push(args)};
 const context={module:{exports:{}},require(name){if(name.includes('residential-server'))return s;if(name.includes('residential-accounts'))return a;return require('../lib/agent-referrals.cjs');},console};
 vm.runInNewContext(fs.readFileSync(require.resolve('../api/residential-account.js'),'utf8'),context);
 return {seen,sent,owned,async call(body,origin=S.ORIGIN){let output;const res={setHeader(){},end(v){output=JSON.parse(v)}};await context.module.exports({method:'POST',headers:{origin,'content-type':'application/json'},body},res);return {status:res.statusCode,data:output};}};
}
test('account history uses the verified session email, never the posted email or customer ID',async()=>{
 const h=harness(),r=await h.call({action:'list',email:'victim@example.com',customer_id:'victim'});
 assert.equal(r.status,200);assert.equal(JSON.stringify(h.seen.find(x=>x.table==='referral_bookings').filters),JSON.stringify([['email','owner@example.com'],['assignment_deleted_at',null],['status',['scheduled','completed','cancelled']]]));assert.equal(JSON.stringify(h.seen.find(x=>x.table==='assignment_blocks').filters),JSON.stringify([['id',['mine']]]));
 assert.equal((await h.call({action:'list'},'https://attacker.example')).status,403);
});
test('setup uses receipt ownership and its stored email, and does not register unconfirmed bookings',async()=>{
 const h=harness();let r=await h.call({action:'setup',id:'receipt',token:'proof',email:'attacker@example.com',password:'Long passphrase'});assert.equal(r.status,200);assert.equal(h.sent[0][1].email,'booker@example.com');
 h.owned.status='awaiting_card';r=await h.call({action:'setup'});assert.equal(r.status,400);assert.equal(h.sent.length,1);
});
