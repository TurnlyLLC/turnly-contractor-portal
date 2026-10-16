// Call only after auth.getUser(token) has verified the caller. No JWT claims grant roles.
async function requireCrmSession(client,userId,token){
 const {data,error}=await client.from('crm_user_access').select('user_id,enabled,must_change_password').eq('user_id',userId).maybeSingle();
 if(error)throw Object.assign(new Error('Unable to verify account access.'),{status:503});
 if(!data?.user_id)return;
 let session;try{session=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString()).session_id;}catch{}
 if(!data.enabled||data.must_change_password||!session)throw Object.assign(new Error('Sign in and complete your password setup to continue.'),{status:403});
 const result=await client.rpc('crm_server_session_ready',{p_user:userId,p_session:session});
 if(result.error||!result.data)throw Object.assign(new Error('Your session has been reset. Sign in again.'),{status:403});
}
module.exports={requireCrmSession};
