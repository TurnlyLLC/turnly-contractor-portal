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
module.exports={contact,sessionId,access};
