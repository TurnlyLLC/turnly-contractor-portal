const S=require('../lib/residential-server.cjs'),A=require('../lib/ambassadors.cjs'),R=require('../lib/recruiting-workflows.cjs'),G=require('../lib/ba-agreement.cjs');
const {randomUUID}=require('node:crypto');
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return S.json(res,405,{error:'Method not allowed.'});
 try{
 const x=await R.requestBody(req),db=S.database();
 if(x.action==='verify'){
  await S.rate(db,req,'ba-verify');
  if(!/^[a-f0-9]{64}$/i.test(x.token||''))throw S.fail('This verification link is invalid.');
  const authClient=S.database(),r=await authClient.auth.verifyOtp({token_hash:x.token,type:'email'});
  if(r.error||!r.data?.session)throw S.fail('This verification link has expired or was already used. Request another below.',401);
  const m=S.checked(await db.from('ba_members').select('user_id,enabled').eq('user_id',r.data.user.id).maybeSingle());
  if(!m?.enabled)throw S.fail('Contact Turnly about ambassador account access.',403);
  S.checked(await db.from('ba_members').update({session_id:A.sessionId(r.data.session.access_token)}).eq('user_id',m.user_id).eq('enabled',true));
  return S.json(res,200,{session:{access_token:r.data.session.access_token,refresh_token:r.data.session.refresh_token}});
 }
 if(x.action==='resend'){
  await S.rate(db,req,'ba-enrollment-email');
  const email=String(x.email||'').trim().toLowerCase();
  const m=S.checked(await db.from('ba_members').select('user_id,enabled,email').eq('email',email).maybeSingle());
  if(m?.enabled&&process.env.RESEND_API_KEY&&process.env.REFERRAL_FROM_EMAIL){
   const r=await db.auth.admin.generateLink({type:'magiclink',email});
   if(!r.error){const link='https://ba.turnlypros.com/ba-onboarding.html#verify='+r.data.properties.hashed_token;
    const sent=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({from:process.env.REFERRAL_FROM_EMAIL,to:[email],subject:'Continue your Turnly ambassador onboarding',text:'Verify your email to continue onboarding:\n'+link+'\n\nIf you did not request this, ignore this message.'}),signal:AbortSignal.timeout(15000)});if(!sent.ok)throw S.fail('Email is temporarily unavailable. Please try again later.',503);
   }
  }
  return S.json(res,200,{ok:true});
 }
 const actor=await A.access(db,req,{allowReset:true});
 const id=actor.admin&&x.member_id?x.member_id:actor.id;
 const member=S.checked(await db.from('ba_members').select('user_id,name,email,must_change_password,onboarding_completed_at,enabled').eq('user_id',id).maybeSingle());
 if(!member)throw S.fail('Choose an ambassador account.',404);
 const record=S.checked(await db.from('ba_onboarding').select('*').eq('user_id',id).maybeSingle());
 if(x.action==='status')return S.json(res,200,{member,record:record?{...record,w9_path:undefined,w9_uploaded:!!record.w9_path}:null,agreement:{version:G.VERSION,text:G.TEXT}});
 if(x.action==='download'){
  if(!record?.w9_path)throw S.fail('No W-9 has been uploaded.',404);
  return S.json(res,200,{url:await R.signedDownload(db,record.w9_path)});
 }
 if(actor.admin)throw S.fail('The ambassador must complete and sign their own onboarding.',403);
 if(member.must_change_password)throw S.fail('Set your personal password first.',428);
 if(record?.completed_at)throw S.fail('Onboarding is already complete. Contact Turnly to update documents.');
 if(x.action==='sign'){
  if(record?.signed_at)return S.json(res,200,{ok:true});
  const name=String(x.name||'').trim();if(name.length<2||name.length>160||x.consent!==true||x.marketing!==true||x.insurance!==true||x.payout!==true||x.version!==G.VERSION)throw S.fail('Review the current agreement and confirm every acknowledgment.');
  const values={user_id:id,agreement_version:G.VERSION,agreement_text:G.TEXT,signature_name:name,signed_at:new Date().toISOString(),marketing_ack:true,insurance_ack:true,payout_ack:true};
  const r=await db.from('ba_onboarding').insert(values);if(r.error&&r.error.code!=='23505')S.checked(r);
  return S.json(res,200,{ok:true});
 }
 if(x.action==='w9'){
  if(!record?.signed_at)throw S.fail('Sign your agreement first.');
  const path=await R.upload(db,'w9/'+id+'/'+randomUUID()+'.pdf',x.file);
  S.checked(await db.from('ba_onboarding').update({w9_path:path,w9_received_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('user_id',id).is('completed_at',null));
  return S.json(res,200,{ok:true});
 }
 if(x.action==='complete'){S.checked(await db.rpc('finish_ba_onboarding',{p_user:id}));return S.json(res,200,{ok:true});}
 throw S.fail('Unknown action.');
 }catch(e){return S.json(res,e.status||503,{error:e.status?e.message:'Unable to complete onboarding. Please try again.'});}
};
