const S=require('../lib/residential-server.cjs'),C=require('../lib/crm-sales.cjs'),P=require('../lib/crm-productivity.cjs');
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');if(req.method!=='POST')return S.json(res,405,{error:'Use POST.'});
 try{
  const db=S.database(),i=await S.body(req);
  const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
  if(['start','heartbeat','logout'].includes(i.action)){
   const auth=await db.auth.getUser(token);if(auth.error||!auth.data?.user)throw S.fail('Sign in again.',401);
   const r=S.checked(await db.rpc('crm_track_activity',{p_user:auth.data.user.id,p_session:P.sessionId(token),p_action:i.action,p_active:i.active===true,p_work:i.work===true}));
   if(r.expired)return S.json(res,401,{error:'Your session ended after five minutes of inactivity. Sign in again.',expired:true});
   return S.json(res,200,r);
  }
  const user=await C.access(db,req);
  if(i.action==='set_pay'){
   if(!user.admin)throw S.fail('Administrator access required.',403);
   S.checked(await db.rpc('crm_set_pay_plan_v2',{p_admin:user.id,...P.validatePlan(i)}));
  }else if(i.action!=='report')throw S.fail('Unknown activity action.');
  return S.json(res,200,await P.report(db,user,i));
 }catch(e){return S.json(res,e.status||400,{error:e.status?e.message:'Unable to load activity or save pay settings. Please retry.'});}
};
