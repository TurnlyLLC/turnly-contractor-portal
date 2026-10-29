const {checked,fail}=require('./residential-server.cjs');
const personal=email=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email||'')&&!/(^|\.)indeed(email)?\.com$/i.test(String(email).split('@')[1]||'');
async function status(db,id){
 const rows=checked(await db.from('recruiting_applications').select('id,answers').eq('hired_user_id',id).eq('role','cleaner'));
 return {required:(rows||[]).some(a=>a.answers?.needs_personal_email===true)};
}
async function confirm(db,id,token){
 const {data,error}=await db.auth.getUser(token),u=data?.user;
 if(error||u?.id!==id)throw fail('Sign in again to confirm your email.',401);
 if(!personal(u.email)||!u.email_confirmed_at||u.new_email)throw fail('Confirm your personal email using the email confirmation link first. Indeed relay addresses cannot be your permanent login.');
 const result=await db.rpc('confirm_imported_contractor_email',{p_user:id});
 if(result.error)throw fail('Your email could not be synchronized. Contact Turnly support.',409);
 return {ok:true,email:u.email};
}
module.exports={personal,status,confirm};
