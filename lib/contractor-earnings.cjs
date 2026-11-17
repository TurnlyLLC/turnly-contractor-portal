const TIME_ZONE='America/New_York';
const calendar=new Intl.DateTimeFormat('en-CA',{timeZone:TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit'});
const completed=j=>['completed','approved','paid'].includes(j.status);
function payment(j){return j.metadata?.payment||{};}
function firstAmount(values){for(const v of values){if(v===null||v===undefined||v==='')continue;const n=Number(v);if(Number.isFinite(n)&&n>=0)return Math.round(n*100);}return null;}
function net(j){const p=payment(j);return Math.round(Math.max(0,Number(j.pay_amount||0)+Number(p.added_fee_amount||0)-Number(p.fee_amount||0))*100);}
function paidDate(j){const p=payment(j);return j.paid_at||j.payout_at||j.payout_date||j.payout_completed_at||j.payment_sent_at||j.statement_paid_at||j.paid_on||p.paid_at||null;}
function isPaid(j){const p=payment(j);return !!(paidDate(j)||j.paid_out||j.paid===true||j.is_paid===true||p.paid===true||[j.payment_status,j.pay_status,j.payout_status,j.quickbooks_payment_status,p.status].some(s=>['paid','paid-out','payout-paid','payout-sent','settled'].includes(String(s||'').toLowerCase().replaceAll('_','-'))));}
function day(value){if(!value)return null;const d=new Date(/^\d{4}-\d{2}-\d{2}$/.test(value)?value+'T17:00:00Z':value);if(!Number.isFinite(d.getTime()))return null;const parts=Object.fromEntries(calendar.formatToParts(d).map(p=>[p.type,p.value]));return `${parts.year}-${parts.month}-${parts.day}`;}
function paidAmount(j){const p=payment(j);return firstAmount([j.net_paid_amount,j.paid_amount,j.payout_amount,j.amount_paid,p.net_paid_amount,p.paid_amount,p.payout_amount,p.amount_paid]);}
function totals(){return{all_time_earned_cents:0,ytd_earned_cents:0,all_time_paid_cents:0,ytd_paid_cents:0,earned_count:0,ytd_earned_count:0,paid_count:0,ytd_paid_count:0,unpaid_cents:0,reserved_cents:0,undated_earned_cents:0,undated_paid_cents:0,inferred_paid_amount_count:0};}
function summarize(jobs,payouts=[],tips=[],now=new Date()){
 const through=day(now),year=Number(through.slice(0,4)),start=`${year}-01-01`,assignments=totals(),tipTotals=totals();
 const inPeriod=value=>{const d=day(value);return d&&d>=start&&d<=through;};
 const earned=(t,amount,date)=>{t.all_time_earned_cents+=amount;t.earned_count++;if(inPeriod(date)){t.ytd_earned_cents+=amount;t.ytd_earned_count++;}if(!day(date))t.undated_earned_cents+=amount;};
 const paid=(t,amount,date,inferred=false)=>{t.all_time_paid_cents+=amount;t.paid_count++;if(inPeriod(date)){t.ytd_paid_cents+=amount;t.ytd_paid_count++;}if(!day(date))t.undated_paid_cents+=amount;if(inferred)t.inferred_paid_amount_count++;};
 const ledger=new Map(payouts.map(p=>[p.assignment_id,p]));
 for(const j of jobs){
  const p=ledger.get(j.id),amount=p?Number(p.amount_cents):net(j),settled=p?p.status==='completed':isPaid(j);
  if(completed(j)){earned(assignments,amount,j.completed_at||j.checklist_completed_at||j.end_window||j.start_window);if(!settled)assignments.unpaid_cents+=amount;}
  if(p?.status==='reserved')assignments.reserved_cents+=Number(p.amount_cents);
  if(settled){const actual=p?Number(p.amount_cents):paidAmount(j);paid(assignments,actual??amount,p?.completed_at||paidDate(j),actual===null);}
 }
 for(const tip of tips){
  if(['succeeded','refunded'].includes(tip.status)){const amount=Number(tip.net_cents)||0;earned(tipTotals,amount,tip.created_at);if(!tip.paid_at)tipTotals.unpaid_cents+=amount;}
  if(tip.paid_at){const explicit=tip.paid_amount_cents!==null&&tip.paid_amount_cents!==undefined;paid(tipTotals,Number(explicit?tip.paid_amount_cents:tip.net_cents)||0,tip.paid_at,!explicit);}
 }
 return{currency:'USD',time_zone:TIME_ZONE,year,period_start:start,period_through:through,as_of:now.toISOString(),
  ytd_earnings_cents:assignments.ytd_earned_cents+tipTotals.ytd_earned_cents,ytd_paid_cents:assignments.ytd_paid_cents+tipTotals.ytd_paid_cents,
  all_time_earnings_cents:assignments.all_time_earned_cents+tipTotals.all_time_earned_cents,all_time_paid_cents:assignments.all_time_paid_cents+tipTotals.all_time_paid_cents,
  outstanding_cents:assignments.unpaid_cents+tipTotals.unpaid_cents,assignments,tips:tipTotals,
  basis:{earnings:'Completed assignment pay after fee adjustments, plus net customer tips. Earnings use completion dates, then scheduled dates for older assignments.',paid:'Recorded completed payouts and legacy paid records use payment dates and saved paid amounts. Reserved transfers are not paid; ledger and assignment mirrors are counted once.',undated:'Undated entries appear only in all-time totals; no payment date is inferred from a work date.',settlement:'Recorded Stripe transfers do not establish arrival in the contractor’s bank account.'}};
}
function report(profiles,jobs,payouts,tips,input={},now=new Date()){
 const group=(rows,key)=>{const map=new Map();for(const row of rows){const id=key(row);if(!id)continue;if(!map.has(id))map.set(id,[]);map.get(id).push(row);}return map;};
 const byJob=group(jobs,j=>j.claimed_by||j.assigned_to),byPayout=group(payouts,p=>p.contractor_id),byTip=group(tips,t=>t.contractor_id);
 const all=profiles.filter(p=>p.role==='contractor').map(p=>{
  const s=summarize(byJob.get(p.id)||[],byPayout.get(p.id)||[],byTip.get(p.id)||[],now);
  return{id:p.id,name:p.full_name||'',status:p.status,ytd_earnings_cents:s.ytd_earnings_cents,ytd_paid_cents:s.ytd_paid_cents,all_time_earnings_cents:s.all_time_earnings_cents,all_time_paid_cents:s.all_time_paid_cents,outstanding_cents:s.outstanding_cents,completed_assignments:s.assignments.earned_count,reserved_cents:s.assignments.reserved_cents,undated_earned_cents:s.assignments.undated_earned_cents+s.tips.undated_earned_cents,undated_paid_cents:s.assignments.undated_paid_cents+s.tips.undated_paid_cents,inferred_paid_amount_count:s.assignments.inferred_paid_amount_count+s.tips.inferred_paid_amount_count};
 }).sort((a,b)=>a.id.localeCompare(b.id));
 const moneyFields=['ytd_earnings_cents','ytd_paid_cents','all_time_earnings_cents','all_time_paid_cents','outstanding_cents','reserved_cents','undated_earned_cents','undated_paid_cents'];
 const totals=Object.fromEntries(moneyFields.map(k=>[k,all.reduce((sum,p)=>sum+p[k],0)]));
 const matching=input.owed_only?all.filter(p=>p.outstanding_cents>0):all,candidates=input.after?matching.filter(p=>p.id>input.after):matching,limit=input.limit||50,data=candidates.slice(0,limit);
 const period=summarize([],[],[],now);
 return{currency:'USD',time_zone:TIME_ZONE,year:period.year,period_start:period.period_start,period_through:period.period_through,as_of:period.as_of,contractor_count:all.length,contractors_owed:all.filter(p=>p.outstanding_cents>0).length,matched_count:matching.length,roster_totals:totals,data,next_cursor:candidates.length>limit?data.at(-1).id:null,definition:'All contractor-role accounts, including inactive accounts and contractors with no earnings; excludes admin-only and ambassador-only accounts. Roster totals cover all contractors, not just this page or owed-only filter.',basis:period.basis};
}
module.exports={summarize,report,day,paidDate,paidAmount,isPaid};
