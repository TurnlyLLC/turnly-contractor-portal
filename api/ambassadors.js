const S=require('../lib/residential-server.cjs'),A=require('../lib/ambassadors.cjs');
const {email,clean,uuid}=require('../lib/agent-referrals.cjs');
const {randomBytes}=require('node:crypto');
module.exports=async(req,res)=>{
 if(req.method!=='POST')return S.json(res,405,{error:'Method not allowed.'});
 try{
  const x=await S.body(req),db=S.database();
  if(['context','register'].includes(x.action)){
   await S.rate(db,req,'ba-'+x.action);
   const m=S.checked(await db.from('ba_members').select('name,code').eq('code',String(x.code||'')).eq('enabled',true).not('onboarding_completed_at','is',null).maybeSingle());
   if(!m)throw S.fail('This referral link is unavailable. Contact Turnly.',404);
   if(x.action==='register'){const c=A.contact(x);S.checked(await db.rpc('register_ba_lead',{p_code:m.code,p_name:c.name,p_email:c.email,p_phone:c.phone,p_consent:'referral-consent-2026-10-19'}));}
   return S.json(res,200,{name:m.name,booking_url:'https://portal.turnlypros.com/residential-referral.html?ba='+encodeURIComponent(m.code)});
  }
  if(x.action==='login'){
   await S.rate(db,req,'ba-login');
   const em=email(x.email);if(!em||typeof x.password!=='string')throw S.fail('Enter your email and password.');
   // Separate auth client: signing in must never replace the service-role client session.
   const authClient=S.database(),r=await authClient.auth.signInWithPassword({email:em,password:x.password});
   if(r.error||!r.data?.session)throw S.fail('Email or password was not recognized.',401);
   const p=S.checked(await db.from('profiles').select('role,status').eq('id',r.data.user.id).maybeSingle());
   if(!p||['inactive','disabled','suspended','rejected'].includes(p.status))throw S.fail('This account is inactive.',403);
   let reset=false;
   if(!['admin','owner','super_admin'].includes(p.role)){
    const m=S.checked(await db.from('ba_members').update({session_id:A.sessionId(r.data.session.access_token)}).eq('user_id',r.data.user.id).eq('enabled',true).select('must_change_password').maybeSingle());
    if(!m)throw S.fail('Ambassador access is inactive.',403);reset=m.must_change_password;
   }
   return S.json(res,200,{session:{access_token:r.data.session.access_token,refresh_token:r.data.session.refresh_token},must_change_password:reset});
  }
  const actor=await A.access(db,req,{allowReset:x.action==='password'});
  if(x.action==='password'){
   if(actor.admin)throw S.fail('Manage your admin password in your admin account.');
   if(typeof x.password!=='string'||x.password.length<12||x.password.length>128)throw S.fail('Use a password with at least 12 characters.');
   const r=await db.auth.admin.updateUserById(actor.id,{password:x.password});if(r.error)throw S.fail('Could not change your password. Try again.',503);
   const m=S.checked(await db.from('ba_members').update({must_change_password:false}).eq('user_id',actor.id).eq('session_id',actor.member.session_id).eq('enabled',true).select('user_id').maybeSingle());
   if(!m)throw S.fail('Your access changed. Please sign in again.',401);
   return S.json(res,200,{ok:true});
  }
  if(x.action==='dashboard'){
   if(!actor.admin&&!actor.member.onboarding_completed_at)return S.json(res,200,{onboarding_required:true});
   const members=actor.admin?S.checked(await db.from('ba_members').select('user_id,name,email,code,enabled,created_at').order('name')):[actor.member];
   const id=actor.admin?(x.member_id||members[0]?.user_id):actor.id;
   const member=members.find(m=>m.user_id===id)||null;
   let leads=[],earnings=[];
   if(member){
    // Page through all rows instead of silently truncating at the REST row limit.
    for(let offset=0;;offset+=500){const rows=S.checked(await db.from('ba_leads').select('id,name,stage,booked_at,completed_at,service_date,review_required,created_at').eq('member_id',id).order('created_at',{ascending:false}).range(offset,offset+499));leads.push(...rows);if(rows.length<500)break;}
    for(let i=0;i<leads.length;i+=100){const rows=S.checked(await db.from('ba_earnings').select('id,lead_id,milestone,amount_cents,earned_at,paid_at,payment_reference').in('lead_id',leads.slice(i,i+100).map(l=>l.id)));earnings.push(...rows);}
   }
   // No customer email, phone, address, billing details or later bookings leave this endpoint.
   if(!actor.admin)leads=leads.map(l=>({...l,name:l.name.split(/\s+/).map((part,i)=>i===0?part:part[0]+'.').join(' ')}));
   const safeMember=m=>m?(({user_id,name,email,code,enabled})=>({user_id,name,email,code,enabled}))(m):null;
   return S.json(res,200,{admin:actor.admin,members:members.map(safeMember),member:safeMember(member),leads,earnings});
  }
  if(!actor.admin)throw S.fail('Admin access required.',403);
  if(x.action==='create'){
   const em=email(x.email),name=clean(x.name,160);if(!em||!name)throw S.fail('Enter a name and email.');
   const password=randomBytes(18).toString('base64url')+'!a9',code='BA-'+randomBytes(8).toString('hex').toUpperCase();
   const r=await db.auth.admin.createUser({email:em,password,email_confirm:true,user_metadata:{role:'brand_ambassador',status:'pending',full_name:name}});
   if(r.error)throw S.fail('Could not create this account. The email may already have an account.');
   const id=r.data.user.id;
   S.checked(await db.from('ba_members').insert({user_id:id,name,email:em,code}));
   S.checked(await db.from('profiles').update({role:'brand_ambassador',status:'active',contractor_approved:false}).eq('id',id));
   return S.json(res,200,{temporary_password:password,email:em});
  }
  if(['reset','toggle'].includes(x.action)){
   if(!uuid(x.member_id))throw S.fail('Choose an ambassador.');
   const m=S.checked(await db.from('ba_members').select('user_id').eq('user_id',x.member_id).maybeSingle());if(!m)throw S.fail('Member not found.');
   if(x.action==='toggle'){if(typeof x.enabled!=='boolean')throw S.fail('Choose active or inactive.');S.checked(await db.from('ba_members').update({enabled:x.enabled,session_id:null}).eq('user_id',m.user_id));return S.json(res,200,{ok:true});}
   S.checked(await db.from('ba_members').update({enabled:false,session_id:null,must_change_password:true}).eq('user_id',m.user_id));
   const password=randomBytes(18).toString('base64url')+'!a9';const r=await db.auth.admin.updateUserById(m.user_id,{password});if(r.error)throw S.fail('Reset failed. Account remains disabled; retry to restore access.',503);
   S.checked(await db.from('ba_members').update({enabled:true}).eq('user_id',m.user_id));return S.json(res,200,{temporary_password:password});
  }
  if(x.action==='record_payment'){
   if(!uuid(x.id)||!clean(x.reference,200))throw S.fail('Choose an earning and enter the payment reference.');
   S.checked(await db.rpc('ba_record_payment',{p_id:x.id,p_actor:actor.id,p_reference:clean(x.reference,200)}));return S.json(res,200,{ok:true});
  }
  throw S.fail('Unknown action.');
 }catch(e){return S.json(res,e.status||400,{error:e.message||'Unable to complete this request.'});}
};
