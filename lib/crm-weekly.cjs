// Date-scoped activity, attributed to the person who performed it.
function summarizeWeekly(id,calls,messages,orders,commissions,start,end){
 const within=v=>Date.parse(v)>=start&&Date.parse(v)<end;
 const attempts=calls.filter(c=>c.user_id===id&&c.call_sid&&within(c.dialed_at||c.created_at));
 const sent=messages.filter(m=>m.user_id===id&&m.status==='accepted'&&within(m.created_at));
 const sales=orders.filter(o=>o.sales_user_id===id&&within(o.paid_at));
 const ids=new Set(sales.map(o=>o.id));
 return {leads_contacted:new Set([...attempts,...sent].map(r=>r.lead_id).filter(Boolean)).size,
 emails_sent:sent.filter(m=>m.channel==='email').length,texts_sent:sent.filter(m=>m.channel==='sms').length,
 sales_made:sales.length,cards_sold:sales.reduce((n,o)=>n+Number(o.quantity||0),0),
 sales_cents:sales.reduce((n,o)=>n+Number(o.amount_cents||0),0),refund_cents:sales.reduce((n,o)=>n+Number(o.refunded_cents||0),0),
 commission_cents:commissions.filter(c=>c.sales_user_id===id&&ids.has(c.order_id)&&c.status==='earned').reduce((n,c)=>n+Number(c.amount_cents||0),0)};
}
module.exports={summarizeWeekly};
