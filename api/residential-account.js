const S=require('../lib/residential-server.cjs');
const A=require('../lib/residential-accounts.cjs');
const {email}=require('../lib/agent-referrals.cjs');
module.exports=async(req,res)=>{
 if(req.method!=='POST')return S.json(res,405,{error:'Method not allowed.'});
 try{
  A.sameOrigin(req);const input=await S.body(req),db=S.database();
  if(!['setup','verify','login','forgot','reset','list','logout'].includes(input.action))throw S.fail('Unknown account action.');
  if(input.action==='list'){
   const a=await A.account(db,req),page=Math.max(1,Math.min(10000,Math.floor(Number(input.page)||1)));
   const result=await db.from('referral_bookings').select('id,name,property_address,city,state,zip,service_date,arrival_start,arrival_end,quote,amount_cents,status,payment_status,agent_name,created_at',{count:'exact'}).eq('email',a.email).order('service_date',{ascending:false}).range((page-1)*20,page*20-1);S.checked(result);
   let jobs=[];if(result.data.length)jobs=S.checked(await db.from('assignment_blocks').select('id,status,assigned_to_name,claimed_by_name').in('id',result.data.map(b=>b.id)));
   return S.json(res,200,{account:{name:a.name,email:a.email},bookings:result.data.map(b=>({...b,job:jobs.find(j=>j.id===b.id)||null})),page,total:result.count});
  }
  if(input.action==='logout'){const token=A.sessionToken(req);if(token)S.checked(await db.from('residential_sessions').delete().eq('token_hash',S.hash(token)));A.setCookie(res,'',0);return S.json(res,200,{ok:true});}
  await S.rate(db,req,'account-'+input.action);
  if(input.action==='setup'){
   const b=await S.owned(db,input);if(!['scheduled','completed'].includes(b.status))throw S.fail('Finish saving your card before creating your account.');
   const hashed=await A.hashPassword(input.password);
   const exists=S.checked(await db.from('residential_accounts').select('id').eq('email',b.email).maybeSingle());
   if(exists)throw S.fail('An account already exists for this email. Sign in or use Forgot password.',409);
   await A.sendToken(db,b,'setup',hashed);return S.json(res,200,{ok:true,message:'Check your email to confirm your account. Your booking is already saved.'});
  }
  if(['verify','reset'].includes(input.action)){
   if(!/^[a-f0-9]{64}$/.test(input.token||''))throw S.fail('Use the full link from your account email.');
   const purpose=input.action==='verify'?'setup':'reset';
   const t=S.checked(await db.from('residential_account_tokens').select('email,password_hash').eq('token_hash',S.hash(input.token)).eq('purpose',purpose).gt('expires_at',new Date().toISOString()).maybeSingle());
   if(!t)throw S.fail('This link has expired or was already used. Request a new link.');
   if(purpose==='setup'&&!await A.verifyPassword(input.password,t.password_hash))throw S.fail('Enter the password you chose after booking.');
   const hashed=purpose==='setup'?t.password_hash:await A.hashPassword(input.password);
   const result=await db.rpc('finish_residential_account',{p_token:S.hash(input.token),p_purpose:purpose,p_password:purpose==='reset'?hashed:null});
   if(result.error)throw S.fail('This link is no longer available. Please sign in or request a new link.');
   await A.signIn(db,res,result.data,hashed);return S.json(res,200,{ok:true});
  }
  const em=email(input.email);if(!em)throw S.fail('Enter a valid email address.');
  if(!S.checked(await db.rpc('allow_referral_request',{p_key:S.hash('account-email:'+input.action+':'+em)})))throw S.fail('Too many attempts. Please try again later.',429);
  const a=S.checked(await db.from('residential_accounts').select('id,name,email,password_hash').eq('email',em).maybeSingle());
  if(input.action==='forgot'){
   if(a)await A.sendToken(db,a,'reset');return S.json(res,200,{ok:true,message:'If an account exists, a password reset link has been sent. Check your inbox and spam folder.'});
  }
  if(!await A.verifyPassword(input.password,a?.password_hash))throw S.fail('The email or password is incorrect.',401);
  await A.signIn(db,res,a.id,a.password_hash);return S.json(res,200,{ok:true});
 }catch(e){return S.json(res,e.status||500,{error:e.status?e.message:'We could not complete this account request. Please try again.'});}
};
