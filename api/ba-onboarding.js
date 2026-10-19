const S=require('../lib/residential-server.cjs'),A=require('../lib/ambassadors.cjs'),R=require('../lib/recruiting-workflows.cjs'),G=require('../lib/ba-agreement.cjs');
const {randomUUID}=require('node:crypto');
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return S.json(res,405,{error:'Method not allowed.'});
 try{
 const x=await R.requestBody(req),db=S.database();
 if(['enrollment','signup'].includes(x.action)){
  await S.rate(db,req,'ba-'+x.action);const E=require('../lib/ba-enrollment.cjs');
  if(x.action==='enrollment'){const a=await E.enrollment(db,x);return S.json(res,200,{name:a.name,email:a.email});}
  return S.json(res,200,await E.signup(db,x));
 }
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
 if(['documents','draft','save_draft','sign_document','view_document'].includes(x.action)){
  const D=require('../lib/ba-documents.cjs');
  if(x.action==='documents'){const docs=S.checked(await db.from('ba_documents').select('id,kind,version,signature_name,signed_at').eq('user_id',id).order('signed_at'));return S.json(res,200,{documents:docs,legacy:record?{agreement:!!record.signed_at,w9:!!record.w9_path}:null});}
  if(!['agreement','w9'].includes(x.kind))throw S.fail('Choose a document.');
  const signed=S.checked(await db.from('ba_documents').select('*').eq('user_id',id).eq('kind',x.kind).maybeSingle());
  if(x.action==='view_document'){
   if(signed)return S.json(res,200,{document:{...signed,storage_path:undefined},url:signed.storage_path?S.checked(await db.storage.from(R.BUCKET).createSignedUrl(signed.storage_path,60)).signedUrl:null});
   if(x.kind==='agreement'&&record?.signed_at)return S.json(res,200,{document:{kind:'agreement',data:{text:record.agreement_text},signature_name:record.signature_name,signed_at:record.signed_at}});
   if(x.kind==='w9'&&record?.w9_path)return S.json(res,200,{url:S.checked(await db.storage.from(R.BUCKET).createSignedUrl(record.w9_path,60)).signedUrl});
   throw S.fail('Document not found.',404);
  }
  const draft=S.checked(await db.from('ba_document_drafts').select('*').eq('user_id',id).eq('kind',x.kind).maybeSingle());
  const version=x.kind==='agreement'?G.VERSION:D.W9_VERSION;
  if(x.action==='draft')return S.json(res,200,{draft:draft||{revision:0,data:{name:member.name,signature_name:member.name}},signed:!!signed,version,agreement:G.TEXT,certification:D.CERTIFICATION});
  if(actor.admin)throw S.fail('The ambassador must edit and sign their own documents.',403);
  if(member.must_change_password)throw S.fail('Set your personal password first.',428);
  if(signed||record?.completed_at||(x.kind==='agreement'&&record?.signed_at)||(x.kind==='w9'&&record?.w9_path))throw S.fail('This document is signed and stored in Documents.',409);
  if(!Number.isInteger(x.revision)||x.revision<0)throw S.fail('Reload this document.',409);
  if(x.action==='save_draft'){const data=D.normalize(x.kind,x.data);const r=await db.rpc('ba_save_document',{p_user:id,p_kind:x.kind,p_revision:x.revision,p_data:data});if(r.error)throw S.fail('This draft changed in another tab. Reload before editing.',409);return S.json(res,200,{revision:r.data,saved_at:new Date().toISOString()});}
  if(!draft||draft.revision!==x.revision||x.confirm!==true||x.version!==version)throw S.fail('Review the latest saved version and confirm your signature.',409);
  const data=D.normalize(x.kind,draft.data,true),signedAt=new Date().toISOString();let storage=null;
  if(x.kind==='w9'){const bytes=await D.w9Pdf(data,signedAt);storage='w9/'+id+'/'+randomUUID()+'.pdf';S.checked(await db.storage.from(R.BUCKET).upload(storage,bytes,{contentType:'application/pdf',upsert:false}));}
  const result=await db.rpc('ba_sign_document',{p_user:id,p_kind:x.kind,p_revision:x.revision,p_data:data,p_name:data.signature_name,p_version:version,p_hash:S.hash(JSON.stringify(data)),p_path:storage,p_session:actor.member?.session_id||null});
  if(result.error)throw S.fail('The document changed before signing. Reload and review it again.',409);
  return S.json(res,200,{ok:true,id:result.data});
 }
 if(x.action==='status')return S.json(res,200,{member,record:record?{...record,w9_path:undefined,w9_uploaded:!!record.w9_path}:null,agreement:{version:G.VERSION,text:G.TEXT}});
 if(x.action==='download'){
  if(!record?.w9_path)throw S.fail('No W-9 has been uploaded.',404);
  return S.json(res,200,{url:await R.signedDownload(db,record.w9_path)});
 }
 if(actor.admin)throw S.fail('The ambassador must complete and sign their own onboarding.',403);
 if(member.must_change_password)throw S.fail('Set your personal password first.',428);
 if(record?.completed_at)throw S.fail('Onboarding is already complete. Contact Turnly to update documents.');
 if(x.action==='complete'){S.checked(await db.rpc('finish_ba_onboarding',{p_user:id}));return S.json(res,200,{ok:true});}
 throw S.fail('Unknown action.');
 }catch(e){return S.json(res,e.status||503,{error:e.status?e.message:'Unable to complete onboarding. Please try again.'});}
};
