const S=require('../lib/residential-server.cjs'),C=require('../lib/crm-sales.cjs'),B=require('../lib/communication-budget.cjs');
module.exports=async(req,res)=>{
 try{
  const db=S.database();
  if(req.method==='GET'){
   if(!process.env.CRON_SECRET||S.hash(req.headers.authorization||'')!==S.hash('Bearer '+process.env.CRON_SECRET))return S.json(res,401,{error:'Unauthorized'});
   await B.sync(db);return S.json(res,200,{ok:true});
  }
  if(req.method!=='POST')return S.json(res,405,{error:'Method not allowed'});
  const user=await C.access(db,req);if(!user.admin)throw S.fail('Administrator access required.',403);
  const i=await S.body(req);
  if(i.action==='save'){
   const result=await db.rpc('communication_save_settings',{p_user:user.id,p_settings:i.settings,p_rep:i.rep||null});
   if(result.error)throw S.fail('Unable to save: check all limits and select a valid sales member.');
  }else if(i.action==='sync'){await B.sync(db);}
  else if(i.action!=='read')throw S.fail('Unknown action.');
  const [settings,totals,provider,reps,limits,usage,audit]=await Promise.all([
   db.from('communication_settings').select('*').eq('id',true).single(),db.rpc('communication_totals'),
   db.from('communication_provider_usage').select('*').eq('id',true).single(),
   db.from('profiles').select('id,full_name,status').in('role',['admin','sales','sales_team']),db.from('communication_rep_limits').select('*'),
   db.from('communication_usage').select('*').order('created_at',{ascending:false}).limit(100),db.from('communication_audit').select('*').order('created_at',{ascending:false}).limit(20)]);
  const members=await Promise.all(S.checked(reps).map(async r=>({...r,totals:S.checked(await db.rpc('communication_totals',{p_user:r.id}))})));
  return S.json(res,200,{settings:S.checked(settings),totals:S.checked(totals),provider:S.checked(provider),members,limits:S.checked(limits),usage:S.checked(usage),audit:S.checked(audit)});
 }catch(e){return S.json(res,e.status||503,{error:e.status?e.message:'Usage sync is unavailable. Existing budget protections remain active; retry shortly.'});}
};
