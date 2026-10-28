const S=require('./residential-server.cjs'),{seal,open}=require('./contractor-onboarding.cjs'),{randomBytes,randomUUID}=require('node:crypto');
const key=()=>process.env.CONTRACTOR_DRAFT_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SERVICE_KEY||process.env.SUPABASE_SERVICE_ROLE||process.env.SUPABASE_SECRET_KEY;
function welcome(a,password){
 const cleaner=a.role==='cleaner',login=cleaner?'https://portal.turnlypros.com/contractor-login.html':'https://ba.turnlypros.com/ba-login.html';
 const stores=require('./turnly-app-links.cjs');
 if(cleaner&&(!stores.apple||!stores.google))throw S.fail('Add the Apple App Store and Google Play links before sending cleaner welcome emails.',503);
 const apps=cleaner?`\n\nGet the Turnly app:\nApple App Store: ${stores.apple}\nGoogle Play: ${stores.google}`:'';
 return {from:process.env.REFERRAL_FROM_EMAIL,to:[a.email],reply_to:'admin@turnlypros.com',subject:cleaner?'Welcome to Turnly — your contractor account is ready':'Welcome to Turnly — your ambassador account is ready',text:`Welcome to Turnly, ${a.name}!\n\nYou have been hired as a ${cleaner?'cleaning contractor':'brand ambassador'}. Your account is ready.\n\nLogin: ${login}\nUsername (email): ${a.email}\n${password?'Temporary password: '+password+'\nPlease change this temporary password when you first sign in.':'You already have a Turnly account. Use your existing password; it has not been changed. Use Forgot password if you need help signing in.'}\n\nComplete your onboarding documents and training in your portal before ${cleaner?'accepting cleaning jobs':'sharing referral links'}. ${cleaner?'Hiring does not bypass required onboarding or background checks.':'Your referrals become available once all onboarding and training requirements are complete.'}${apps}\n\nQuestions? Reply to admin@turnlypros.com.\n\nThe Turnly team`};
}
async function hire(db,actor,id){
 if(!process.env.RESEND_API_KEY||!process.env.REFERRAL_FROM_EMAIL||!key())throw S.fail('Welcome email service is not configured.',503);
 const a=S.checked(await db.from('recruiting_applications').select('*').eq('id',id).is('deleted_at',null).single());
 const prior=S.checked(await db.from('recruiting_hires').select('sent_at').eq('application_id',id).maybeSingle());
 if(prior?.sent_at)return {ok:true,email_sent:true,already_hired:true};
 const existing=S.checked(await db.from('profiles').select('id,role,status').eq('email',a.email).maybeSingle());
 const role=a.role==='cleaner'?'contractor':'brand_ambassador';
 if(existing&&(existing.role!==role||['inactive','disabled','suspended','rejected'].includes(existing.status)))throw S.fail('This email belongs to another role or an inactive account. Review it in Directory before hiring.',409);
 const password=existing?null:randomBytes(24).toString('base64url')+'!a9',userId=existing?.id||randomUUID();
 const reservation=await db.rpc('reserve_applicant_hire',{p_id:id,p_user:userId,p_payload:seal({password,email:welcome(a,password)},key(),'applicant-hire:'+id),p_existing:!!existing});
 if(reservation.error)throw S.fail('Hiring is already processing or this application is unavailable. Refresh before retrying.',409);
 const job=reservation.data;if(job.sent_at)return {ok:true,email_sent:true,already_hired:true};
 try{
  const payload=open(job.encrypted_payload,key(),'applicant-hire:'+id);
  let auth=await db.auth.admin.getUserById(job.user_id);
  if(!auth.data?.user){
   if(job.existing_account)throw S.fail('Existing account unavailable. Review it in Directory.',409);
   const meta={role,team:role,turnly_force_password_change:true,turnly_temp_password_created_at:new Date().toISOString(),turnly_temp_password_created_by:actor,applicant_id:id};
   auth=await db.auth.admin.createUser({id:job.user_id,email:a.email,password:payload.password,email_confirm:true,app_metadata:meta,user_metadata:{full_name:a.name,role,turnly_force_password_change:true}});
   if(auth.error)throw S.fail('Account could not be created. An account may already use this email. No existing password was changed.',409);
  }
  if(auth.data.user.email.toLowerCase()!==a.email.toLowerCase())throw S.fail('Account email changed. Review it before continuing.',409);
  if(!job.existing_account){
   // Initialize once. Retrying mail must never reset completed onboarding or a changed password.
   if(!a.hired_at){
    S.checked(await db.from('profiles').upsert({id:job.user_id,email:a.email,full_name:a.name,phone:a.phone,role,team:role,status:'active',contractor_approved:false,approval_status:'pending',allowed_regions:a.answers?.service_cities||[a.service_city],market:a.service_city,service_types:a.answers?.services||[],invited_by_admin:true,invited_by:actor},{onConflict:'id'}));
    if(role==='brand_ambassador')S.checked(await db.from('ba_members').upsert({user_id:job.user_id,name:a.name,email:a.email,code:'BA-'+randomBytes(8).toString('hex').toUpperCase(),must_change_password:true},{onConflict:'user_id',ignoreDuplicates:true}));
   }
  }
  S.checked(await db.from('recruiting_applications').update({status:'hired',hired_at:a.hired_at||new Date().toISOString(),hired_user_id:job.user_id,reviewed_by:actor,review_note:'Hired; account linked. Onboarding requirements remain in effect.',version:a.version+1}).eq('id',id));
  if(job.attempts>1&&Date.now()-Date.parse(job.created_at)>23*3600000)throw S.fail('Welcome email needs delivery review before retrying; the account is already created.',409);
  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'applicant-hired-'+id},body:JSON.stringify(payload.email),signal:AbortSignal.timeout(15000)});
  const receipt=await response.json();if(!response.ok||!receipt.id)throw S.fail('Account created, but welcome email was not confirmed. Retry from the Hired view.',503);
  S.checked(await db.from('recruiting_hires').update({sent_at:new Date().toISOString(),provider_id:receipt.id,encrypted_payload:null,last_error:null,processing_at:null}).eq('application_id',id));
  return {ok:true,email_sent:true,existing_account:job.existing_account};
 }catch(e){await db.from('recruiting_hires').update({processing_at:null,last_error:e.status?e.message:'Hiring needs review; retry from the application.'}).eq('application_id',id);throw e;}
}
module.exports={hire,welcome};
