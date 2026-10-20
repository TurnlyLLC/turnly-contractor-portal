const S=require('./residential-server.cjs');
const {email,phone,clean}=require('./agent-referrals.cjs');
function contact(x){const name=clean(x.name,160),em=email(x.email),ph=phone(x.phone);if(!name||!em||!ph||x.consent!==true)throw S.fail('Enter your name, email and phone, and agree to referral tracking.');return{name,email:em,phone:ph};}
function sessionId(token){try{return JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString()).session_id||null;}catch{return null;}}
async function access(db,req,{allowReset=false}={}){
 const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');if(!token)throw S.fail('Please sign in.',401);
 const auth=await db.auth.getUser(token);if(auth.error||!auth.data?.user)throw S.fail('Please sign in again.',401);
 const id=auth.data.user.id,p=S.checked(await db.from('profiles').select('role,status').eq('id',id).maybeSingle());
 if(!p||['inactive','disabled','suspended','rejected'].includes(p.status))throw S.fail('This account is inactive.',403);
 if(['admin','owner','super_admin'].includes(p.role))return{id,admin:true};
 const member=S.checked(await db.from('ba_members').select('*').eq('user_id',id).maybeSingle());
 if(!member?.enabled||!member.session_id||member.session_id!==sessionId(token))throw S.fail('Please sign in to the ambassador portal again.',401);
 if(member.must_change_password&&!allowReset)throw S.fail('Please change your temporary password.',428);
 return{id,admin:false,member};
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
 return members.map(m=>{
  const completed=course.lessons.filter(l=>progress.some(p=>p.user_id===m.user_id&&p.lesson_id===l.id&&p.completed_at&&p.score===l.questions.length)).length;
  const training={completed,total:course.lessons.length,complete:completed===course.lessons.length};
  const agreement_current=agreements.some(a=>a.user_id===m.user_id);
  return {...m,training,agreement_current,referrals_ready:!!m.enabled&&!!m.onboarding_completed_at&&training.complete&&agreement_current};
 });
}
async function referralMember(db,code){
 const m=S.checked(await db.from('ba_members').select('user_id,name,code,enabled,onboarding_completed_at').eq('code',String(code||'')).eq('enabled',true).not('onboarding_completed_at','is',null).maybeSingle());
 if(!m)return null;
 const [ready]=await referralReadiness(db,[m]);
 return ready.referrals_ready?{name:m.name,code:m.code}:null;
}
module.exports={contact,sessionId,access,referralReadiness,referralMember};
