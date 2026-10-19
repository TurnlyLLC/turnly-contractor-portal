const S=require('./residential-server.cjs'),A=require('./ambassadors.cjs'),{uuid}=require('./agent-referrals.cjs'),{randomBytes}=require('node:crypto');
async function enrollment(db,x){
 if(!uuid(x.application)||!/^[a-f0-9]{64}$/.test(x.token||''))throw S.fail('Continue from your application, or sign in to your existing account.',401);
 const row=S.checked(await db.from('recruiting_applications').select('id,name,email,role,enrollment_hash,created_at').eq('id',x.application).eq('enrollment_hash',S.hash(x.token)).maybeSingle());
 if(!row||row.role!=='brand_ambassador'||Date.now()-Date.parse(row.created_at)>86400000)throw S.fail('This signup link expired. Submit a new application or sign in.',401);
 return row;
}
async function signup(db,x){
 const row=await enrollment(db,x);
 if(typeof x.password!=='string'||x.password.length<12||x.password.length>128)throw S.fail('Use a password between 12 and 128 characters.');
 // Confirm only this new ambassador account; global email-verification settings remain unchanged.
 const created=await db.auth.admin.createUser({email:row.email,password:x.password,email_confirm:true,user_metadata:{full_name:row.name},app_metadata:{ambassador_application_id:row.id}});
 if(created.error&&!['email_exists','user_already_exists','email_address_exists'].includes(created.error.code))throw S.fail('Account setup is temporarily unavailable. Please retry.',503);
 const authClient=S.database(),login=await authClient.auth.signInWithPassword({email:row.email,password:x.password});
 if(login.error||!login.data?.session)throw S.fail('This email already has an account. Use its existing password to continue, or sign in. No existing password was changed.',409);
 const id=login.data.user.id;
 if(created.data?.user?.id===id)S.checked(await db.from('profiles').update({role:'brand_ambassador',status:'active',contractor_approved:false}).eq('id',id));
 const profile=S.checked(await db.from('profiles').select('role,status').eq('id',id).single());
 if(['inactive','disabled','suspended','rejected'].includes(profile.status))throw S.fail('Account inactive. Contact Turnly.',403);
 const prior=S.checked(await db.from('ba_members').select('enabled').eq('user_id',id).maybeSingle());
 if(prior?.enabled===false)throw S.fail('Ambassador access is inactive. Contact Turnly.',403);
 S.checked(await db.from('ba_members').upsert({user_id:id,name:row.name,email:row.email,code:'BA-'+randomBytes(8).toString('hex').toUpperCase(),must_change_password:false},{onConflict:'user_id',ignoreDuplicates:true}));
 S.checked(await db.from('ba_members').update({session_id:A.sessionId(login.data.session.access_token),must_change_password:false}).eq('user_id',id).eq('enabled',true));
 return{session:{access_token:login.data.session.access_token,refresh_token:login.data.session.refresh_token}};
}
module.exports={enrollment,signup};
