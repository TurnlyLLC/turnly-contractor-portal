const S=require('./residential-server.cjs');
const {email,phone,clean}=require('./agent-referrals.cjs');
function contact(x){const name=clean(x.name,160),em=email(x.email),ph=phone(x.phone);if(!name||!em||!ph||x.consent!==true)throw S.fail('Enter your name, email and phone, and agree to referral tracking.');return{name,email:em,phone:ph};}
function sessionId(token){try{return JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString()).session_id||null;}catch{return null;}}
async function access(db,req,{allowReset=false,bridge=false}={}){
 const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');if(!token)throw S.fail('Please sign in.',401);
 const auth=await db.auth.getUser(token);if(auth.error||!auth.data?.user)throw S.fail('Please sign in again.',401);
 const id=auth.data.user.id,p=S.checked(await db.from('profiles').select('role,status').eq('id',id).maybeSingle());
 if(!p||['inactive','disabled','suspended','rejected'].includes(p.status))throw S.fail('This account is inactive.',403);
 if(['admin','owner','super_admin'].includes(p.role))return{id,admin:true};
 const designation=S.checked(await db.from('app_user_access').select('roles').eq('user_id',id).maybeSingle());
 if(!designation?.roles?.includes('brand_ambassador'))throw S.fail('Brand Ambassador access is not enabled for this account.',403);
 const member=S.checked(await db.from('ba_members').select('*').eq('user_id',id).maybeSingle());
 if(!member?.enabled)throw S.fail('Ambassador access is inactive.',403);
 const sid=sessionId(token);
 // Preserve the existing portal session; additional app sessions are independently revocable.
 if(bridge||!member.session_id||member.session_id!==sid){
  const valid=sid&&S.checked(await db.rpc('ba_app_session',{p_user:id,p_session:sid,p_register:bridge}));
  if(!valid)throw S.fail('Please sign in to the ambassador portal again.',401);
 }
 if(member.must_change_password&&!allowReset)throw S.fail('Please change your temporary password.',428);
 return{id,admin:false,member};
}
// Approved contractors with an admin-assigned Brand Ambassador role share right away.
// Checked live on every request; the DB keeps the audited record (ba_exemption_audit).
const EXEMPT_STATUSES=new Set(['active']);
function qualifiesAsContractor(member,profile,roles){
 return !!member?.enabled&&!!profile&&EXEMPT_STATUSES.has(profile.status)&&profile.contractor_approved===true&&Array.isArray(roles)&&roles.includes('contractor')&&roles.includes('brand_ambassador');
}
async function contractorExemptions(db,ids){
 const profiles=[],access=[];
 for(let i=0;i<ids.length;i+=100){
  profiles.push(...S.checked(await db.from('profiles').select('id,status,contractor_approved').in('id',ids.slice(i,i+100))));
  access.push(...S.checked(await db.from('app_user_access').select('user_id,roles').in('user_id',ids.slice(i,i+100))));
 }
 const qualified=new Set(),eligible=new Set();
 for(const id of ids){const p=profiles.find(r=>r.id===id),a=access.find(r=>r.user_id===id);if(p&&p.status==='active'&&a?.roles?.includes('brand_ambassador'))eligible.add(id);if(qualifiesAsContractor({enabled:true},p,a?.roles))qualified.add(id);}
 return {qualified,eligible};
}
function readiness(m,training,agreement_current,contractorQualified){
 const standard=!!m.enabled&&!!m.onboarding_completed_at&&training.complete&&agreement_current;
 const exempt=!!m.enabled&&contractorQualified;
 const basis=exempt?'approved_contractor':standard?'standard':null;
 return {referrals_ready:standard||exempt,referral_access:{basis,training_optional:exempt,agreement_optional:exempt,onboarding_optional:exempt}};
}
async function referralReadiness(db,members){
 const course=require('./ba-training-course.json');
 const ids=members.map(m=>m.user_id),progress=[],agreements=[];
 const version=require('./ba-agreement.cjs').VERSION;
 for(let i=0;i<ids.length;i+=100){
  const rows=S.checked(await db.from('ba_training_progress').select('user_id,lesson_id,score,completed_at').in('user_id',ids.slice(i,i+100)).eq('course_version',course.version));
  progress.push(...rows);
  agreements.push(...S.checked(await db.from('ba_documents').select('user_id').in('user_id',ids.slice(i,i+100)).eq('kind','agreement').eq('version',version)));
 }
 const exempt=await contractorExemptions(db,ids);
 return members.map(m=>{
  const completed=course.lessons.filter(l=>progress.some(p=>p.user_id===m.user_id&&p.lesson_id===l.id&&p.completed_at&&p.score===l.questions.length)).length;
  const training={completed,total:course.lessons.length,complete:completed===course.lessons.length};
  const agreement_current=agreements.some(a=>a.user_id===m.user_id);
  return {...m,training,agreement_current,...readiness({...m,enabled:m.enabled&&exempt.eligible.has(m.user_id)},training,agreement_current,exempt.qualified.has(m.user_id))};
 });
}
async function referralMember(db,code){
 const m=S.checked(await db.from('ba_members').select('user_id,name,code,enabled,onboarding_completed_at').eq('code',String(code||'')).eq('enabled',true).maybeSingle());
 if(!m)return null;
 const [ready]=await referralReadiness(db,[m]);
 return ready.referrals_ready?{name:m.name,code:m.code}:null;
}
module.exports={contact,sessionId,access,referralReadiness,referralMember,qualifiesAsContractor,readiness};
