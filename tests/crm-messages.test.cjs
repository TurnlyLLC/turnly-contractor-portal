const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const id='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
function setup({member=true,denied=false,rows=[]}={}){
 const calls=[];let scopedOptions;
 function query(table){const filters=[];const q={};for(const method of ['select','eq','neq','in','order','limit','update'])q[method]=(...args)=>{filters.push([method,...args]);return q;};q.maybeSingle=()=>{q.single=true;return q;};q.then=resolve=>{calls.push({table,filters});return Promise.resolve({data:table==='profiles'?[{id:other,role:'admin',full_name:'Admin'}]:q.single?(member?{thread_id:id}:null):rows}).then(resolve);};return q;}
 const db={from:query},scoped={from:query,rpc:async(name,args)=>{calls.push({name,args});return {data:id};}};
 const fail=(message,status=400)=>Object.assign(Error(message),{status});
 const S={database:()=>db,body:async r=>r.body,fail,rate:async()=>{},json:(res,status,data)=>Object.assign(res,{status,data})};
 const context={module:{exports:{}},process:{env:{SUPABASE_ANON_KEY:'public'}},require:name=>name==='@supabase/supabase-js'?{createClient:(u,k,o)=>{scopedOptions=o;return scoped;}}:name.includes('residential-server')?S:name.includes('crm-sales')?{access:async()=>{if(denied)throw fail('Inactive',403);return {id};}}:{uuid:v=>[id,other].includes(v)}};
 vm.runInNewContext(fs.readFileSync('api/crm-messages.js','utf8'),context);
 return {calls,options:()=>scopedOptions,run:async body=>{const res={};await context.module.exports({method:'POST',headers:{authorization:'Bearer caller'},body},res);return res;}};
}
test('inactive accounts and outsiders cannot access or reply to conversations',async()=>{
 let s=setup({denied:true});assert.equal((await s.run({action:'list'})).status,403);assert.equal(s.calls.length,0);
 for(const action of ['read','reply']){s=setup({member:false});assert.equal((await s.run({action,thread:id,body:'hello'})).status,403);assert.ok(!s.calls.some(c=>c.name||c.table==='message_thread_messages'));}
});
test('creation only accepts active internal recipients and uses caller JWT',async()=>{
 let s=setup();assert.equal((await s.run({action:'create',recipient:id,subject:'Help',body:'Hello'})).status,400);
 s=setup();assert.equal((await s.run({action:'create',recipient:'admin',subject:'Help',body:'Hello',sender_id:other})).status,200);
 assert.equal(s.options().global.headers.Authorization,'Bearer caller');const rpc=s.calls.find(c=>c.name);assert.equal(rpc.name,'create_message_thread_v2');assert.equal(rpc.args.message_payload.recipient_ids[0],other);assert.equal(rpc.args.message_payload.sender_id,undefined);
 assert.ok(s.calls[0].filters.some(f=>f[0]==='eq'&&f[1]==='status'&&f[2]==='active'));
});
test('reads and unread updates are scoped to caller and validated thread',async()=>{
 const s=setup();assert.equal((await s.run({action:'read',thread:id})).status,200);
 const updates=s.calls.filter(c=>c.filters.some(f=>f[0]==='update'));assert.equal(updates.length,1);assert.ok(updates[0].filters.some(f=>f[0]==='eq'&&f[1]==='user_id'&&f[2]===id));
 assert.equal((await s.run({action:'reply',thread:id,body:'x'.repeat(5001)})).status,400);
});

test('unread endpoint counts only newer conversations without loading recipient directory',async()=>{
 const s=setup({rows:[{last_read_at:'2026-10-21T10:00:00Z',message_threads:{id,last_message_at:'2026-10-21T11:00:00Z'}},{last_read_at:'2026-10-21T12:00:00Z',message_threads:{id:other,last_message_at:'2026-10-21T11:00:00Z'}}]});
 const r=await s.run({action:'unread'});assert.equal(r.status,200);assert.equal(r.data.unread,1);assert.ok(!s.calls.some(c=>c.table==='profiles'));assert.ok(s.calls[0].filters.some(f=>f[0]==='eq'&&f[1]==='user_id'&&f[2]===id));
});
