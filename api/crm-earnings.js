const S=require('../lib/residential-server.cjs'),C=require('../lib/crm-sales.cjs');
module.exports=async(req,res)=>{
 if(req.method!=='POST')return S.json(res,405,{error:'Method not allowed.'});
 res.setHeader('Cache-Control','no-store');
 try{
  const db=S.database(),user=await C.access(db,req),i=await S.body(req);
  if(!user.admin){const a=await require('../lib/seller-agreement.cjs').current(db,user);if(a.mode!=='commission')return S.json(res,200,{admin:false,hidden:true,rows:[],periods:[]});}
  if(['approve','record_paid'].includes(i.action)){
   if(!user.admin)throw S.fail('Administrator access required.',403);
   S.checked(await db.rpc('crm_commission_payment_review',{p_admin:user.id,p_order:i.order_id,p_action:i.action,p_reference:String(i.reference||'').trim(),p_expected:i.amount_cents}));
  }else if(i.action!=='list')throw S.fail('Unknown earnings action.');
  const scope=q=>user.admin?q:q.eq('sales_user_id',user.id);
  const [commissions,payments,orders,people]=await Promise.all([
   C.all(db,'crm_sales_commissions','*',scope,'order_id'),C.all(db,'crm_commission_payments','*',scope,'order_id'),
   C.all(db,'gift_orders','id,name,quantity,amount_cents,paid_at,sales_user_id',q=>scope(q).not('paid_at','is',null)),
   user.admin?C.all(db,'profiles','id,full_name',q=>q.in('role',['admin','sales','sales_team'])):[]
  ]);
  const rows=commissions.map(c=>{const p=payments.find(p=>p.order_id===c.order_id),o=orders.find(o=>o.id===c.order_id);return {...c,customer:o?.name||'Customer',cards:o?.quantity||0,purchased_at:o?.paid_at,sale_cents:o?.amount_cents||0,representative:people.find(p=>p.id===c.sales_user_id)?.full_name||'You',payment:p||null,approval_current:!!p&&p.approved_cents===c.amount_cents&&c.status==='earned'};}).sort((a,b)=>String(b.purchased_at).localeCompare(String(a.purchased_at)));
  return S.json(res,200,{admin:user.admin,rows});
 }catch(e){return S.json(res,e.status||400,{error:e.message||'Unable to load earnings.'});}
};
