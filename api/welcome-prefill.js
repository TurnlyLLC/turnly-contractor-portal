const S = require('../lib/residential-server.cjs');
const {open} = require('../lib/contractor-onboarding.cjs');
const {hiringKey} = require('../lib/applicant-hiring.cjs');
module.exports = async (req,res) => {
  if(req.method!=='POST') return S.json(res,405,{error:'Use POST.'});
  try {
    const {token} = await S.body(req);
    if(typeof token!=='string'||token.length>4096) throw Error();
    const entry = open(token,hiringKey(),'welcome-prefill-v1');
    if(!(entry.expires>Date.now())) throw Error();
    const {data,error} = await S.database().auth.admin.getUserById(entry.userId);
    const meta = data?.user?.app_metadata;
    if(error || !meta?.turnly_force_password_change || meta.applicant_id!==entry.applicationId) throw Error();
    return S.json(res,200,{username:entry.username,password:entry.password});
  } catch {
    return S.json(res,400,{error:'This welcome link is no longer available. Enter your credentials to sign in.'});
  }
};
