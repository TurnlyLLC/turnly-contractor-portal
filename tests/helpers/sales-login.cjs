const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{randomUUID}=require('node:crypto'),{createHandler}=require('../../api/crm-team');
module.exports=async function fixtureLogin(id,mode){
 const session={access_token:'test.'+Buffer.from(JSON.stringify({session_id:randomUUID()})).toString('base64url')+'.test',refresh_token:'test'};
 const email=mode+'@example.test',password=randomUUID();let started,installed,redirect,submit;
 const db={auth:{signInWithPassword:async input=>{assert.deepEqual({...input},{email,password});return {data:{session,user:{id}}}}},rpc:async(name,args)=>{
 if(name==='crm_track_activity')started=args;if(name==='crm_access_state')return {data:{active:true,session_valid:true,must_change_password:false}};return {data:true};}};
 const handler=createHandler(()=>db),form={email:{value:email},password:{value:password},addEventListener:(_,cb)=>submit=cb};
 const ctx={window:{__ENV:{SUPABASE_URL:'https://example.test',SUPABASE_ANON_KEY:'test'}},document:{querySelector:s=>s==='#crmLogin'?form:{}},createClient:()=>({auth:{setSession:async s=>{installed=s;return {}}}}),location:{assign:v=>redirect=v},fetch:async(path,req)=>{
 assert.equal(path,'/api/crm-team');let data,code;await handler({method:'POST',headers:{},body:JSON.parse(req.body)},{setHeader(){},status(c){code=c;return this},json(d){data=d}});return {ok:code===200,json:async()=>data};}};
 const old=process.env.SUPABASE_SERVICE_ROLE_KEY,anon=process.env.SUPABASE_ANON_KEY;process.env.SUPABASE_SERVICE_ROLE_KEY='fixture';process.env.SUPABASE_ANON_KEY='fixture';
 try{vm.runInNewContext(fs.readFileSync('crm-login.mjs','utf8').replace(/^import[^;]+;/,''),ctx);await submit({preventDefault(){}});assert.equal(redirect,'sales.html');assert.equal(installed.access_token,session.access_token);assert.equal(started.p_user,id);assert.equal(started.p_action,'start');}finally{for(const [k,v] of [['SUPABASE_SERVICE_ROLE_KEY',old],['SUPABASE_ANON_KEY',anon]]){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
};
