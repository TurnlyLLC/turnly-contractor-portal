const S=require('../lib/residential-server.cjs'),C=require('../lib/crm-sales.cjs');
const reviewed=r=>{if(r.error)throw S.fail(r.error.code==='P0001'?r.error.message:'Unable to save hourly review. Please retry.',400);return r.data;};
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');if(req.method!=='POST')return S.json(res,405,{error:'Use POST.'});
 try{
  const db=S.database(),user=await C.access(db,req),i=await S.body(req);
  const through=new Date(i.through);if(!Number.isFinite(through.getTime())||through.getTime()>Date.now())throw S.fail('Choose a completed review date.');
  if(['approve','record_paid'].includes(i.action)){
   if(!user.admin)throw S.fail('Administrator access required.',403);
   if(!Number.isSafeInteger(i.amount_cents)||i.amount_cents<=0)throw S.fail('Review a valid positive amount.');
   reviewed(await db.rpc('crm_hourly_payment_review',{p_admin:user.id,p_user:i.user_id,p_action:i.action,p_from:i.period_start||null,p_to:through.toISOString(),p_expected:i.amount_cents,p_id:i.id||null,p_reference:String(i.reference||'').trim()}));
  }else if(i.action!=='list')throw S.fail('Unknown earnings action.');
  const [rows,periods]=await Promise.all([
   db.rpc('crm_hourly_summary',{p_user:user.admin?null:user.id,p_through:through.toISOString()}).then(S.checked),
   C.all(db,'crm_hourly_payments','*',q=>user.admin?q:q.eq('user_id',user.id))
  ]);
  return S.json(res,200,{admin:user.admin,rows,periods,through:through.toISOString()});
 }catch(e){return S.json(res,e.status||400,{error:e.message||'Unable to review hourly pay.'});}
};
