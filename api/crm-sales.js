const S=require('../lib/residential-server.cjs'),C=require('../lib/crm-sales.cjs');
module.exports=async(req,res)=>{
 if(req.method!=='POST')return S.json(res,405,{error:'Method not allowed.'});
 try{
  const i=await S.body(req),db=S.database();
  if(i.action==='public_context'){await S.rate(db,req,'sales-context');const a=await C.attribution(db,i.ref,i.contact);return S.json(res,200,{representative:a.representative||null});}
  if(i.action==='unsubscribe'){
   await S.rate(db,req,'sales-unsubscribe');if(!/^[a-f0-9]{32}$/.test(i.token||''))throw S.fail('Invalid link.');
   const l=S.checked(await db.from('crm_checkout_links').select('lead_id').eq('token',i.token).single());
   S.checked(await db.from('sales_leads').update({do_not_contact:true}).eq('id',l.lead_id));return S.json(res,200,{ok:true});
  }
  const user=await C.access(db,req);
  if(i.action==='send')return S.json(res,200,{message:await C.send(db,user,i)});
  if(i.action==='ack'){let q=db.from('crm_notifications').update({acknowledged_at:new Date().toISOString()}).eq('id',i.id);if(!user.admin)q=q.eq('recipient_id',user.id);S.checked(await q);return S.json(res,200,{ok:true});}
  if(i.action==='notifications'){let q=db.from('crm_notifications').select('*').eq('resolved',false).is('acknowledged_at',null).lte('due_at',new Date().toISOString()).order('due_at').limit(100);if(!user.admin)q=q.eq('recipient_id',user.id);return S.json(res,200,{notifications:S.checked(await q)});}
  if(i.action!=='context')throw S.fail('Unknown action.');
  let notices=db.from('crm_notifications').select('*').eq('resolved',false).is('acknowledged_at',null).lte('due_at',new Date().toISOString()).order('due_at').limit(100);if(!user.admin)notices=notices.eq('recipient_id',user.id);
  const filter=q=>{q=q.not('paid_at','is',null);return user.admin?q:q.eq('sales_user_id',user.id);};
  const [link,orders,notificationResult,settings,commissions]=await Promise.all([C.link(db,user),C.all(db,'gift_orders','id,name,email,quantity,amount_cents,paid_at,status,buyer_kind,refunded_cents,disputed,sales_user_id,sales_lead_id',filter),notices,db.from('crm_sales_settings').select('commission_mode,commission_rate').eq('id',true).single(),C.all(db,'crm_sales_commissions','*',q=>user.admin?q:q.eq('sales_user_id',user.id),'order_id')]);
  const stats=C.summarize(orders,commissions);const own=C.summarize(orders.filter(o=>o.sales_user_id===user.id),commissions.filter(c=>c.sales_user_id===user.id));
  let prospects=db.from('sales_leads').select('id',{count:'exact',head:true}).eq('business_segment','residential').eq('prospect_type','realtor');if(!user.admin)prospects=prospects.eq('sales_owner_id',user.id);const count=await prospects;S.checked(count);
  const conversion={prospects:count.count||0,buyers:new Set(orders.filter(o=>o.buyer_kind==='realtor'&&o.sales_lead_id).map(o=>o.sales_lead_id)).size};
  const memberStats=user.admin?[...new Set(orders.map(o=>o.sales_user_id).filter(Boolean))].map(id=>({user_id:id,...C.summarize(orders.filter(o=>o.sales_user_id===id),commissions.filter(c=>c.sales_user_id===id))})):[];
  return S.json(res,200,{link,stats,own,conversion,memberStats,notifications:S.checked(notificationResult),settings:S.checked(settings),sending:C.capabilities()});
 }catch(e){return S.json(res,e.status||400,{error:e.message||'Unable to load sales data.'});}
};
