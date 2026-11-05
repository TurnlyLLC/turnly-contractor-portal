const S=require('../lib/residential-server.cjs'),C=require('../lib/crm-sales.cjs');
const reviewed=r=>{if(r.error)throw S.fail(r.error.code==='P0001'?r.error.message:'Unable to save hourly review. Please retry.',400);return r.data;};
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');if(req.method!=='POST')return S.json(res,405,{error:'Use POST.'});
 try{
  const db=S.database(),user=await C.access(db,req),i=await S.body(req);
  const historical=!user.admin&&(await require('../lib/seller-agreement.cjs').current(db,user)).mode!=='hourly';
  const through=new Date(i.through);if(!Number.isFinite(through.getTime())||through.getTime()>Date.now())throw S.fail('Choose a completed review date.');
  if(['approve','record_paid'].includes(i.action)){
   if(!user.admin)throw S.fail('Administrator access required.',403);
   await require('../lib/crm-roster.cjs').requireMember(db,i.user_id,i.archived===true);
   if(!Number.isSafeInteger(i.amount_cents)||i.amount_cents<=0)throw S.fail('Review a valid positive amount.');
   reviewed(await db.rpc('crm_hourly_payment_review',{p_admin:user.id,p_user:i.user_id,p_action:i.action,p_from:i.period_start||null,p_to:through.toISOString(),p_expected:i.amount_cents,p_id:i.id||null,p_reference:String(i.reference||'').trim()}));
  }else if(i.action!=='list')throw S.fail('Unknown earnings action.');
  let [rows,periods]=await Promise.all([
   db.rpc('crm_hourly_summary',{p_user:user.admin?null:user.id,p_through:through.toISOString()}).then(S.checked),
   C.all(db,'crm_hourly_payments','*',q=>user.admin?q:q.eq('user_id',user.id))
  ]);
  if(user.admin){const roster=await require('../lib/crm-roster.cjs').members(db,i.archived===true),ids=new Set(roster.map(p=>p.id));rows=rows.filter(r=>ids.has(r.user_id));periods=periods.filter(r=>ids.has(r.user_id));}
  if(!user.admin){for(const row of rows)for(const key of Object.keys(row))if(key.endsWith('_seconds'))delete row[key];for(const period of periods)delete period.hours_seconds;}
  return S.json(res,200,{admin:user.admin,historical,hidden:historical&&!periods.length&&!rows.some(r=>r.pending_cents>0||r.approved_cents>0||r.paid_cents>0),rows,periods,through:through.toISOString()});
 }catch(e){return S.json(res,e.status||400,{error:e.message||'Unable to review hourly pay.'});}
};
