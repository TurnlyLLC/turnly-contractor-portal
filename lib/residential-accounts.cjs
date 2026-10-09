const {randomBytes,scrypt,timingSafeEqual}=require('node:crypto');
const {promisify}=require('node:util');
const S=require('./residential-server.cjs');
const derive=promisify(scrypt),cookieName='__Host-turnly_customer';
const options={N:131072,r:8,p:1,maxmem:192*1024*1024};
function password(value){if(typeof value!=='string'||value.length<12||value.length>128)throw S.fail('Use a password between 12 and 128 characters.');return value;}
async function hashPassword(value){const salt=randomBytes(16).toString('hex');const key=await derive(password(value),salt,64,options);return `scrypt-v1:${salt}:${key.toString('hex')}`;}
async function verifyPassword(value,stored){
 if(typeof value!=='string'||value.length>128)return false;
 const parts=String(stored||'').split(':');
 const valid=parts[0]==='scrypt-v1'&&/^[a-f0-9]{32}$/.test(parts[1])&&/^[a-f0-9]{128}$/.test(parts[2]);
 // Perform the same expensive operation for an unknown account.
 const actual=await derive(value,valid?parts[1]:'0'.repeat(32),64,options);
 return valid&&timingSafeEqual(actual,Buffer.from(parts[2],'hex'));
}
function sameOrigin(req){
 const origins=[S.ORIGIN];if(process.env.VERCEL_URL)origins.push('https://'+process.env.VERCEL_URL);
 if(!origins.includes(req.headers.origin)||!/^application\/json\b/i.test(req.headers['content-type']||''))throw S.fail('Please use the Turnly customer portal.',403);
}
function sessionToken(req){const match=String(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(cookieName+'='));const token=match?.slice(cookieName.length+1);return /^[a-f0-9]{64}$/.test(token||'')?token:null;}
function setCookie(res,token,seconds=604800){res.setHeader('Set-Cookie',`${cookieName}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${seconds}`);}
async function account(db,req){
 const token=sessionToken(req);if(!token)throw S.fail('Sign in to view your cleans.',401);
 const session=S.checked(await db.from('residential_sessions').select('account_id').eq('token_hash',S.hash(token)).is('revoked_at',null).gt('expires_at',new Date().toISOString()).maybeSingle());
 if(!session)throw S.fail('Your session has expired. Please sign in again.',401);
 const a=S.checked(await db.from('residential_accounts').select('id,name,email').eq('id',session.account_id).single());return a;
}
async function signIn(db,res,id,expectedHash){
 const token=randomBytes(32).toString('hex');
 S.checked(await db.rpc('start_residential_session',{p_account:id,p_password_hash:expectedHash,p_token:S.hash(token)}));
 setCookie(res,token);
}
async function emailLink(to,token,purpose){
 const key=String(process.env.RESEND_API_KEY||'').trim(),from=String(process.env.REFERRAL_FROM_EMAIL||'').trim();
 if(!key||!from)throw S.fail('Account email is temporarily unavailable. Your booking is safe; please try again later.',503);
 const link=`${S.ORIGIN}/customer.html#${purpose}=${token}`;
 const text=purpose==='setup'?`Confirm your Turnly customer account\n\nOpen this link and enter the password you chose after booking:\n${link}\n\nThis link expires in one hour. Your email address is your username. If you did not request an account, ignore this email. Your booking is unchanged.`:`Reset your Turnly customer password\n\nChoose a new password here:\n${link}\n\nThis link expires in one hour. If you did not request this, ignore this email; your password will not change.`;
 const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({from,to:[to],subject:purpose==='setup'?'Confirm your Turnly customer account':'Reset your Turnly customer password',text}),signal:AbortSignal.timeout(15000)});
 if(!r.ok){console.error('Residential account email rejected:',r.status);throw S.fail('We could not send the account email. Your booking is safe. Please try again or contact Turnly.',503);}
 const result=await r.json();if(!result.id)throw S.fail('Account email was not accepted. Please try again.',503);
}
async function sendToken(db,a,purpose,passwordHash){
 const token=randomBytes(32).toString('hex'),tokenHash=S.hash(token);
 S.checked(await db.from('residential_account_tokens').insert({token_hash:tokenHash,email:a.email,name:a.name,purpose,password_hash:passwordHash||null,expires_at:new Date(Date.now()+3600000).toISOString()}));
 try{await emailLink(a.email,token,purpose);}catch(e){await db.from('residential_account_tokens').update({consumed_at:new Date().toISOString()}).eq('token_hash',tokenHash);throw e;}
}
module.exports={password,hashPassword,verifyPassword,sameOrigin,sessionToken,setCookie,account,signIn,sendToken};
