const S=require('./residential-server.cjs'),C=require('./crm-sales.cjs'),P=require('./crm-productivity.cjs');
const ZONE='America/New_York';
function dayKey(now){return new Intl.DateTimeFormat('en-CA',{timeZone:ZONE,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));}
function shift(day,n){return new Date(Date.parse(day+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);}
function midnight(day){
 const target=Date.parse(day+'T00:00:00Z');let value=target;
 for(let i=0;i<3;i++){const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:ZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value)).map(p=>[p.type,p.value]));const local=Date.UTC(+parts.year,+parts.month-1,+parts.day,+parts.hour,+parts.minute,+parts.second);value+=target-local;}
 return new Date(value).toISOString();
}
function periods(day,now=Date.now()){
 day=day||dayKey(now);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(Date.parse(day+'T12:00:00Z'))||shift(day,0)!==day||day>dayKey(now))throw S.fail('Choose today or an earlier valid date.');
 const weekday=new Date(day+'T12:00:00Z').getUTCDay(),monday=shift(day,-((weekday+6)%7));
 return {day,timezone:ZONE,daily:{from:midnight(day),to:midnight(shift(day,1)),label:day},weekly:{from:midnight(monday),to:midnight(shift(monday,7)),label:monday+' – '+shift(monday,6)}};
}
function combine(report,orders,calls,messages){
 const inside=v=>v&&Date.parse(v)>=Date.parse(report.from)&&Date.parse(v)<Date.parse(report.to);
 const ids=new Set(report.rows.map(r=>r.user_id));
 const contacts=[...calls.filter(c=>ids.has(c.user_id)&&c.call_sid&&inside(c.dialed_at)),...messages.filter(m=>ids.has(m.user_id)&&m.provider_id&&['accepted','sent','delivered'].includes(m.status)&&inside(m.created_at))].filter(c=>c.lead_id);
 const paid=orders.filter(o=>ids.has(o.sales_user_id)&&inside(o.paid_at));
 const rows=report.rows.map(r=>({user_id:r.user_id,name:r.name,logged_seconds:r.logged_seconds,active_seconds:r.active_seconds,hourly_cents:r.hourly_cents||0,online:r.online,sales:paid.filter(o=>o.sales_user_id===r.user_id).length,leads_contacted:new Set(contacts.filter(c=>c.user_id===r.user_id).map(c=>c.lead_id)).size}));
 const sum=k=>rows.reduce((n,r)=>n+Number(r[k]||0),0);
 return {from:report.from,to:report.to,rows,totals:{logged_seconds:sum('logged_seconds'),active_seconds:sum('active_seconds'),hourly_cents:sum('hourly_cents'),sales:paid.length,leads_contacted:new Set(contacts.map(c=>c.lead_id)).size}};
}
async function overview(db,user,input,now=Date.now()){
 if(!user.admin)throw S.fail('Administrator access required.',403);
 const ranges=periods(input.date,now),from=ranges.weekly.from,to=ranges.weekly.to;
 const [daily,weekly,orders,calls,messages,pay]=await Promise.all([
 P.report(db,user,ranges.daily),P.report(db,user,ranges.weekly),
 C.all(db,'gift_orders','id,sales_user_id,paid_at',q=>q.gte('paid_at',from).lt('paid_at',to)),
 C.all(db,'crm_voice_calls','id,user_id,lead_id,call_sid,dialed_at',q=>q.gte('dialed_at',from).lt('dialed_at',to)),
 C.all(db,'crm_sales_messages','id,user_id,lead_id,status,provider_id,created_at',q=>q.gte('created_at',from).lt('created_at',to)),
 db.rpc('crm_hourly_summary',{p_user:null,p_through:new Date(now).toISOString()}).then(S.checked)
 ]);
 const hourly=pay.map(r=>({user_id:r.user_id,name:r.name,pending_cents:Number(r.pending_cents||0),approved_cents:Number(r.approved_cents||0)}));
 return {...ranges,as_of:new Date(now).toISOString(),daily:{...combine(daily,orders,calls,messages),label:ranges.daily.label},weekly:{...combine(weekly,orders,calls,messages),label:ranges.weekly.label},hourly:{rows:hourly,pending_cents:hourly.reduce((n,r)=>n+r.pending_cents,0),approved_cents:hourly.reduce((n,r)=>n+r.approved_cents,0)}};
}
module.exports={periods,combine,overview};
