const {createClient}=require('@supabase/supabase-js');
const {randomUUID,randomBytes,createHash}=require('node:crypto');
const roles=['admin','sales','sales_team'];
const checked=r=>{if(r.error)throw r.error;return r.data;};
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const username=v=>String(v||'').trim().toLowerCase();
function validUsername(v){if(!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(v))throw fail('Use 3–32 letters, numbers, dots, underscores or hyphens for the username.');return v;}
function validPassword(v){if(typeof v!=='string'||v.length<12||v.length>128)throw fail('Use a password with 12–128 characters.');return v;}
function temporaryPassword(){return randomBytes(18).toString('base64url')+'!7a';}
function token(req){return String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');}
async function readBody(req){if(req.body){const b=typeof req.body==='string'?JSON.parse(req.body):req.body;if(Buffer.byteLength(JSON.stringify(b))>8192)throw fail('Request too large.',413);return b;}let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>8192)throw fail('Request too large.',413);}return JSON.parse(raw||'{}');}
function createHandler(makeClient=createClient){return async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 const send=(status,data)=>res.status(status).json(data);
 if(req.method!=='POST'){res.setHeader('Allow','POST');return send(405,{error:'Method not allowed.'});}
 const url=process.env.SUPABASE_URL||'https://nwnzdoveskthebfyndcs.supabase.co';
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SERVICE_KEY||process.env.SUPABASE_SERVICE_ROLE||process.env.SUPABASE_SECRET_KEY;
 if(!key||!process.env.SUPABASE_ANON_KEY)return send(503,{error:'Team access is temporarily unavailable.'});
 const options={auth:{persistSession:false,autoRefreshToken:false}};
 const db=makeClient(url,key,options),pub=makeClient(url,process.env.SUPABASE_ANON_KEY,options);
 let locked;
 const audit=async(actor,subject,action)=>{checked(await db.from('crm_access_audit').insert({actor_id:actor,subject_id:subject,action}));};
 try{
  const b=await readBody(req);if(!b||typeof b!=='object'||Array.isArray(b))throw fail('Invalid request.');
  if(b.action==='login'){
   const login=username(b.username),password=String(b.password||'');if(!login||login.length>254||!password||password.length>128)throw fail('Check your username and password.',401);
   const ip=String(req.headers['x-vercel-forwarded-for']||req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0];
   for(const [value,limit] of [['ip:'+ip,60],['user:'+login,12]])if(!checked(await db.rpc('crm_allow_login',{p_key:createHash('sha256').update(value).digest('hex'),p_limit:limit})))throw fail('Too many sign-in attempts. Try again in 15 minutes.',429);
   let email=login;
   if(!login.includes('@')){
    const account=checked(await db.from('crm_user_access').select('user_id').eq('username',login).maybeSingle());
    email=account?checked(await db.auth.admin.getUserById(account.user_id))?.user?.email:'unknown@crm.turnly.invalid';
   }
   const result=await pub.auth.signInWithPassword({email,password});
   if(result.error||!result.data?.session)throw fail('Check your username and password.',401);
   const session=result.data.session,user=result.data.user;
   const scoped=makeClient(url,process.env.SUPABASE_ANON_KEY,{...options,global:{headers:{Authorization:'Bearer '+session.access_token}}});
   const access=checked(await scoped.rpc('crm_access_state'));
   if(!access?.active||!access.session_valid){await db.auth.admin.signOut(session.access_token,'global');throw fail('This account does not have active CRM access. Contact your administrator.',403);}
   return send(200,{session:{access_token:session.access_token,refresh_token:session.refresh_token},must_change_password:access.must_change_password});
  }
  const jwt=token(req);const auth=await db.auth.getUser(jwt);if(auth.error||!auth.data?.user)throw fail('Sign in to continue.',401);
  const user=auth.data.user;
  const profile=checked(await db.from('profiles').select('id,full_name,role,status,email').eq('id',user.id).single());
  const scoped=makeClient(url,process.env.SUPABASE_ANON_KEY,{...options,global:{headers:{Authorization:'Bearer '+jwt}}});
  const access=checked(await scoped.rpc('crm_access_state'));
  if(!access?.active||!access.session_valid||!roles.includes(profile.role))throw fail('Your access has changed. Sign in again or contact your administrator.',403);
  if(b.action==='change_password'){
   validPassword(b.password);if(b.password===b.current_password)throw fail('Choose a different password from your temporary password.');
   const proof=await pub.auth.signInWithPassword({email:user.email,password:String(b.current_password||'')});if(proof.error)throw fail('Your current password is incorrect.',401);
   const lockToken=randomUUID();const rows=checked(await db.rpc('crm_lock_user',{p_user:user.id,p_token:lockToken}));if(!rows?.length)throw fail('Another account update is in progress. Try again shortly.',409);
   locked={id:user.id,token:lockToken};const account=rows[0];
   if(!account.enabled||account.revision!==(checked(await db.from('crm_user_access').select('revision').eq('user_id',user.id).single())).revision)throw fail('Account access changed. Sign in again.',409);
   // Re-check current session after taking the lock; an admin may have reset it during reauthentication.
   const fresh=checked(await scoped.rpc('crm_access_state'));if(!fresh?.active||!fresh.session_valid)throw fail('Sign in again with your latest temporary password.',403);
   checked(await db.auth.admin.updateUserById(user.id,{password:b.password}));
   checked(await db.from('crm_user_access').update({must_change_password:false,valid_after:new Date().toISOString(),revision:randomUUID()}).eq('user_id',user.id).eq('lock_token',lockToken));
   await db.auth.admin.signOut(jwt,'global');await audit(user.id,user.id,'password_changed');return send(200,{ok:true});
  }
  if(access.must_change_password)throw fail('Change your temporary password before continuing.',403);
  if(b.action==='list'){
   if(profile.role!=='admin')return send(200,{members:[{id:profile.id,full_name:profile.full_name,role:profile.role,status:profile.status,username:access.username}]});
   const people=checked(await db.from('profiles').select('id,full_name,role,status').in('role',roles).order('full_name'));
   const accounts=checked(await db.from('crm_user_access').select('user_id,username,must_change_password,enabled'));
   return send(200,{members:people.map(p=>({...p,...accounts.find(a=>a.user_id===p.id)}))});
  }
  if(profile.role!=='admin')throw fail('Only administrators can manage team accounts.',403);
  if(b.action==='create'){
   const name=String(b.full_name||'').trim().slice(0,120),login=validUsername(username(b.username));if(!name)throw fail('Enter the team member’s name.');
   const duplicate=checked(await db.from('crm_user_access').select('user_id').eq('username',login).maybeSingle());if(duplicate)throw fail('That username is already in use.',409);
   const password=b.temporary_password?validPassword(b.temporary_password):temporaryPassword();
   const created=checked(await db.auth.admin.createUser({email:randomUUID()+'@crm.turnly.invalid',password,email_confirm:true,app_metadata:{crm_provisioned:true},user_metadata:{full_name:name,role:'sales_team',status:'inactive'}})).user;
   // Inactive until all provisioning steps succeed; failed provisioning never creates an active orphan.
   checked(await db.from('crm_user_access').insert({user_id:created.id,username:login,must_change_password:true,created_by:user.id}));
   checked(await db.from('profiles').update({full_name:name,role:'sales_team',status:'active'}).eq('id',created.id));
   await audit(user.id,created.id,'created');return send(200,{ok:true,username:login,temporary_password:password});
  }
  if(!/^[0-9a-f-]{36}$/i.test(b.user_id||''))throw fail('Choose a team member.');
  const target=checked(await db.from('profiles').select('id,full_name,role,status').eq('id',b.user_id).single());if(!roles.includes(target.role))throw fail('Choose a sales-team account.');
  if(target.role==='admin'&&!(b.action==='edit'&&target.id===user.id))throw fail('Administrator accounts are protected. You can edit your own username here.');
  if(b.action==='edit'){
   const login=validUsername(username(b.username)),name=String(b.full_name||'').trim().slice(0,120);if(!name)throw fail('Enter the team member’s name.');
   const current=checked(await db.from('crm_user_access').select('user_id').eq('user_id',target.id).maybeSingle());
   if(!current)checked(await db.from('crm_user_access').insert({user_id:target.id,username:login,must_change_password:false,enabled:target.status==='active',valid_after:'1970-01-01T00:00:00Z',created_by:user.id}));
   else checked(await db.from('crm_user_access').update({username:login}).eq('user_id',target.id));
   checked(await db.from('profiles').update({full_name:name}).eq('id',target.id));await audit(user.id,target.id,'profile_updated');return send(200,{ok:true});
  }
  if(!['reset','deactivate','reactivate'].includes(b.action))throw fail('Unknown action.');
  const lockToken=randomUUID(),rows=checked(await db.rpc('crm_lock_user',{p_user:target.id,p_token:lockToken}));if(!rows?.length)throw fail('Set a username first, or wait for the current account update to finish.',409);
  locked={id:target.id,token:lockToken};const account=rows[0];
  if(b.action==='deactivate'){
   checked(await db.from('crm_user_access').update({enabled:false,valid_after:new Date().toISOString(),revision:randomUUID()}).eq('user_id',target.id).eq('lock_token',lockToken));
   checked(await db.from('profiles').update({status:'inactive'}).eq('id',target.id));
   checked(await db.auth.admin.updateUserById(target.id,{ban_duration:'876000h'}));
   await audit(user.id,target.id,'deactivated');return send(200,{ok:true});
  }
  if(b.action==='reset'&&(!account.enabled||target.status!=='active'))throw fail('Reactivate this member to issue a new temporary password.');
  const password=b.temporary_password?validPassword(b.temporary_password):temporaryPassword();
  // Close data access first; the database gate immediately blocks existing sessions.
  checked(await db.from('crm_user_access').update({must_change_password:true,valid_after:new Date().toISOString(),revision:randomUUID()}).eq('user_id',target.id).eq('lock_token',lockToken));
  checked(await db.auth.admin.updateUserById(target.id,{password,ban_duration:'none'}));
  if(b.action==='reactivate'){
   checked(await db.from('profiles').update({status:'active'}).eq('id',target.id));
   checked(await db.from('crm_user_access').update({enabled:true}).eq('user_id',target.id));
  }
  await audit(user.id,target.id,b.action==='reset'?'password_reset':'reactivated');return send(200,{ok:true,username:account.username,temporary_password:password});
 }catch(error){return send(error.status||400,{error:error.code==='23505'?'That username is already in use.':error.status?error.message:'The account update could not be completed. Refresh and try again; contact your administrator if it continues.'});}
 finally{if(locked)await db.from('crm_user_access').update({lock_token:null,lock_until:null}).eq('user_id',locked.id).eq('lock_token',locked.token);}
};}
module.exports=createHandler();module.exports.createHandler=createHandler;
module.exports.validUsername=validUsername;module.exports.validPassword=validPassword;
