const {test}=require('node:test'),assert=require('node:assert/strict');
const {createHandler,validUsername,validPassword}=require('../api/crm-team');
const A='00000000-0000-4000-8000-000000000001',B='00000000-0000-4000-8000-000000000002';
function fixture(role='admin',access={active:true,session_valid:true,must_change_password:false}){
 const calls=[],people=[{id:A,role,status:'active',full_name:'Owner',email:'owner@example.test'},{id:B,role:'sales_team',status:'active',full_name:'Sam'}],accounts=[{user_id:B,username:'sam',enabled:true,must_change_password:false,revision:'v1'}];
 const db={auth:{getUser:async()=>({data:{user:{id:A,email:'owner@example.test'}}}),signInWithPassword:async()=>({data:{user:{id:A},session:{access_token:'x.'+Buffer.from(JSON.stringify({session_id:'00000000-0000-4000-8000-000000000010'})).toString('base64url')+'.x',refresh_token:'refresh'}}}),admin:{createUser:async v=>{calls.push(['create',v]);return {data:{user:{id:B}}};},updateUserById:async(id,v)=>{calls.push(['authUpdate',id,v]);return {data:{user:{id}}};},getUserById:async()=>({data:{user:{email:'sam@crm.turnly.invalid'}}}),signOut:async()=>({error:null})}},
 rpc:async(name,args)=>{calls.push(['rpc',name,args]);if(name==='crm_access_state')return {data:access};if(name==='crm_lock_user')return {data:accounts};return {data:true};},
 from(table){let action='select',values,filters=[];const q={select(){return q},order(){return q},in(){return q},eq(k,v){filters.push([k,v]);return q},insert(v){action='insert';values=v;return q},update(v){action='update';values=v;return q},single(){return q.then(r=>({...r,data:Array.isArray(r.data)?r.data[0]:r.data}))},maybeSingle(){return q.single()},then(resolve){calls.push([table,action,values,filters]);let rows=table==='profiles'?people:table==='crm_user_access'?accounts:[];rows=rows.filter(r=>filters.every(([k,v])=>r[k]===v));return Promise.resolve(resolve({data:action==='select'?rows:values}));}};return q;}};
 const handler=createHandler(()=>db);return {calls,accounts,people,async run(body){let result;const res={setHeader(){},status(status){this.code=status;return this},json(data){result={status:this.code,data};}};process.env.SUPABASE_SERVICE_ROLE_KEY='test';process.env.SUPABASE_ANON_KEY='test';await handler({method:'POST',headers:{authorization:'Bearer token'},body},res);return result;}};
}
test('only active administrators can create or reset staff accounts',async()=>{
 for(const [role,access] of [['sales_team',{active:true,session_valid:true,must_change_password:false}],['admin',{active:true,session_valid:false,must_change_password:false}],['admin',{active:true,session_valid:true,must_change_password:true}]]){const f=fixture(role,access);assert.equal((await f.run({action:'create',username:'sam2',full_name:'Sam'})).status,403);assert.ok(!f.calls.some(c=>c[0]==='create'));}
 const f=fixture();assert.equal((await f.run({action:'deactivate',user_id:A})).status,400);assert.ok(!f.calls.some(c=>c[0]==='authUpdate'));
});
test('new usernames need no email, provision inactive first and require password setup',async()=>{
 const f=fixture();const r=await f.run({action:'create',username:'New.User',full_name:'New User'});assert.equal(r.status,200);assert.equal(r.data.username,'new.user');assert.ok(r.data.temporary_password.length>=20);
 const create=f.calls.find(c=>c[0]==='create')[1];assert.equal(create.email_confirm,true);assert.equal(create.user_metadata.status,'inactive');assert.equal(create.app_metadata.crm_provisioned,true);
 const saved=f.calls.find(c=>c[0]==='crm_user_access'&&c[1]==='insert')[2];assert.equal(saved.must_change_password,true);assert.ok(!JSON.stringify(saved).includes(r.data.temporary_password));
 assert.ok(!f.calls.filter(c=>c[0]==='crm_access_audit').some(c=>JSON.stringify(c).includes(r.data.temporary_password)));
});
test('reset closes access before changing password; deactivation preserves lead records',async()=>{
 const f=fixture();const r=await f.run({action:'reset',user_id:B});assert.equal(r.status,200);const gate=f.calls.findIndex(c=>c[0]==='crm_user_access'&&c[1]==='update'&&c[2].must_change_password);const change=f.calls.findIndex(c=>c[0]==='authUpdate');assert.ok(gate>=0&&gate<change);
 const d=fixture();assert.equal((await d.run({action:'deactivate',user_id:B})).status,200);assert.ok(d.calls.some(c=>c[0]==='crm_user_access'&&c[2]?.enabled===false));assert.ok(!d.calls.some(c=>String(c[0]).startsWith('sales_')));
});
test('password setup rejects mismatched confirmation, normal sessions, and stale sessions',async()=>{
 const f=fixture('sales_team',{active:true,session_valid:true,must_change_password:true});assert.equal((await f.run({action:'change_password',password:'abcdefghijkl',confirm_password:'different-password'})).status,400);assert.equal((await fixture().run({action:'change_password',password:'abcdefghijkl',confirm_password:'abcdefghijkl'})).status,403);
 const s=fixture('sales_team',{active:true,session_valid:false,must_change_password:true});assert.equal((await s.run({action:'change_password',password:'different-password',confirm_password:'different-password'})).status,403);
 assert.throws(()=>validUsername('admin@example.com'));assert.throws(()=>validPassword('short'));assert.equal(validUsername('sam.jones'),'sam.jones');
});

test('successful first-login change clears the gate only after the password update and logs no password',async()=>{
 const f=fixture('sales_team',{active:true,session_valid:true,must_change_password:true});f.accounts[0].user_id=A;
 const result=await f.run({action:'change_password',password:'A-new-private-password',confirm_password:'A-new-private-password'});assert.equal(result.status,200);
 const change=f.calls.findIndex(c=>c[0]==='authUpdate');const clear=f.calls.findIndex(c=>c[0]==='crm_user_access'&&c[1]==='update'&&c[2].must_change_password===false);assert.ok(change>=0&&clear>change);
 assert.ok(!JSON.stringify(f.calls.filter(c=>c[0]==='crm_access_audit')).includes('A-new-private-password'));
});
test('related sales API session guard rejects reset accounts and never trusts editable metadata',async()=>{
 const {requireCrmSession}=require('../lib/crm-access.cjs');const token='x.'+Buffer.from(JSON.stringify({session_id:'session'})).toString('base64url')+'.x';
 let row={user_id:B,enabled:true,must_change_password:true},valid=false;
 const db={from:()=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:row})}),rpc:async()=>({data:valid})};
 await assert.rejects(requireCrmSession(db,B,token),/password setup/);row.must_change_password=false;await assert.rejects(requireCrmSession(db,B,token),/reset/);valid=true;await requireCrmSession(db,B,token);
});


test('successful login starts server clock before returning the session',async()=>{
 const f=fixture();const r=await f.run({action:'login',username:'owner@example.test',password:'existing-password'});
 assert.equal(r.status,200);assert.ok(f.calls.some(c=>c[0]==='rpc'&&c[1]==='crm_track_activity'&&c[2].p_action==='start'));
});
