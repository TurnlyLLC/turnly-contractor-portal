const S = require('../lib/residential-server.cjs');
module.exports = async function handler(req,res) {
  if (req.method !== 'POST') return S.json(res,405,{error:'Use POST.'});
  const invalid = 'Check your username or email and password.';
  try {
    const db = S.database();
    await S.rate(db,req,'contractor-login');
    const {username,password} = await S.body(req);
    const alias = String(username||'').trim().replace(/\s+/g,' ');
    if (!alias || alias.length>250 || typeof password!=='string' || password.length>1024) return S.json(res,401,{error:invalid});
    const literal = alias.replace(/[\\%_]/g,'\\$&');
    const record = S.checked(await db.from('recruiting_applications').select('hired_user_id').ilike('login_alias',literal).eq('role','cleaner').eq('status','hired').is('deleted_at',null).maybeSingle());
    const user = record?.hired_user_id && (await db.auth.admin.getUserById(record.hired_user_id)).data?.user;
    if (!user) return S.json(res,401,{error:invalid});
    const {data,error} = await db.auth.signInWithPassword({email:user.email,password});
    if (error || data.user?.id!==user.id) return S.json(res,401,{error:invalid});
    return S.json(res,200,{access_token:data.session.access_token,refresh_token:data.session.refresh_token});
  } catch(error) { return S.json(res,error.status===429?429:503,{error:error.status===429?'Too many attempts. Try again later.':'Sign-in is temporarily unavailable.'}); }
};
