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
   await require('../lib/crm-roster.cjs').requireMember(db,i.user_id,false);
   S.checked(await db.rpc(i.mode==='flat'?'crm_set_flat_plan':'crm_set_pay_plan_v2',{p_admin:user.id,...P.validatePlan(i)}));
   }else if(['flat_approve','flat_record_paid'].includes(i.action)){
   if(!user.admin)throw S.fail('Administrator access required.',403);
   const plan=S.checked(await db.from('crm_pay_plans').select('user_id').eq('id',i.plan_id).single());
   await require('../lib/crm-roster.cjs').requireMember(db,plan.user_id,i.archived===true);
   const result=await db.rpc('crm_review_flat_pay',{p_admin:user.id,p_plan:i.plan_id,p_action:i.action.slice(5),p_expected:i.amount_cents,p_reference:String(i.reference||'')});
   if(result.error)throw S.fail(result.error.code==='P0001'?result.error.message:'Unable to review this batch. Refresh and try again.');
   return S.json(res,200,{ok:true});
  }else if(i.action!=='report')throw S.fail('Unknown activity action.');
  return S.json(res,200,await P.report(db,user,i));
 }catch(e){return S.json(res,e.status||400,{error:e.status?e.message:'Unable to load activity or save pay settings. Please retry.'});}
};
