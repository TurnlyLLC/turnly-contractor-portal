const S=require('../lib/residential-server.cjs'),C=require('../lib/crm-sales.cjs');
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');if(req.method!=='POST')return S.json(res,405,{error:'Use POST.'});
 try{
  const db=S.database(),user=await C.access(db,req);if(!user.admin)throw S.fail('Administrator access required.',403);
  const i=await S.body(req),uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if(!['approve','record_paid'].includes(i.action)||!uuid.test(i.request_id||'')||!Array.isArray(i.items)||!i.items.length||i.items.length>500)throw S.fail('Select 1–500 earnings items to review.');
  for(const r of i.items)if(!r||!['hourly','commission'].includes(r.kind)||!uuid.test(r.user_id||'')||!Number.isSafeInteger(r.amount_cents)||r.amount_cents<=0)throw S.fail('Invalid earnings selection. Refresh and retry.');
  const r=await db.rpc('crm_bulk_pay_review',{p_admin:user.id,p_request:i.request_id,p_action:i.action,p_items:i.items,p_reference:String(i.reference||'').trim()});
  if(r.error)throw S.fail(r.error.code==='P0001'?r.error.message:'Unable to complete the batch. Refresh and retry.',400);
  return S.json(res,200,r.data);
 }catch(e){return S.json(res,e.status||400,{error:e.status?e.message:'Unable to complete the batch. Please retry.'});}
};
