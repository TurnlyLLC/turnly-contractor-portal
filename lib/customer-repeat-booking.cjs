const S=require('./residential-server.cjs'),Calendar=require('./booking-calendar.cjs'),Pricing=require('./residential-pricing.cjs'),G=require('./gift-cards.cjs');
const CONSENT='I authorize Turnly to charge my saved card for the displayed visit price, less confirmed gift credit, on the service morning (6 AM Eastern, or an earlier arrival start). For a recurring plan, I authorize future standard cleans at the displayed recurring price and frequency until I cancel. Gift credit applies to this visit only. Preferred cleaner is subject to availability.';
function price(b,input){
 let q;try{q=Pricing.quote({service:input.service,sqft:input.sqft??b.sqft,frequency:input.frequency||'once'});}catch(e){throw S.fail(e.message);}
 if(q.frequency!=='once'&&q.service!=='standard')throw S.fail('Recurring plans use standard cleaning. Choose Standard to see your savings.');
 q.one_time_cents=Pricing.quote({service:'standard',sqft:q.sqft,frequency:'once'}).amount_cents;
 if(q.frequency!=='once'){q.amount_cents=q.maintenance_cents;q.savings_cents=q.one_time_cents-q.amount_cents;}
 return q;
}
async function quote(db,b,input){
 const q=price(b,input);q.gift_cents=0;
 if(input.gift){const card=await G.card(db,input.gift);if(card.status!=='active')throw S.fail('This gift card is unavailable.');q.gift_cents=Math.min(q.amount_cents,card.balance_cents-card.reserved_cents);if(q.gift_cents<=0)throw S.fail('This gift card has no available balance.');}
 q.card_charge_cents=q.amount_cents-q.gift_cents;return q;
}
function nextDate(day,frequency,anchorDay){
 const d=new Date(day+'T12:00:00Z');
 if(frequency==='monthly'){d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+1);const end=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(anchorDay,end));}
 else d.setUTCDate(d.getUTCDate()+(frequency==='weekly'?7:14));
 return d.toISOString().slice(0,10);
}
async function renew(db){
 let created=0,attention=0,cursor=null;const calendar=(await Calendar.load(db)).settings;
 for(;;){let query=db.from('customer_recurring_plans').select('*').eq('status','active').order('id').limit(100);if(cursor)query=query.gt('id',cursor);const plans=S.checked(await query);if(!plans.length)break;
 for(const plan of plans){
  try{
  const b=S.checked(await db.from('referral_bookings').select('*').eq('id',plan.latest_booking_id).single());
  const job=S.checked(await db.from('assignment_blocks').select('status').eq('id',b.id).maybeSingle());
  if(b.status==='cancelled'||b.assignment_deleted_at){S.checked(await db.from('customer_recurring_plans').update({status:'needs_review',review_reason:'Latest visit cancelled. Confirm the next date with the customer.'}).eq('id',plan.id).eq('status','active'));attention++;continue;}
  if(!['qa_pending','completed'].includes(job?.status))continue;
  const day=nextDate(b.service_date,plan.frequency,plan.anchor_day),start=b.arrival_start.slice(0,5),end=b.arrival_end.slice(0,5),error=Calendar.error(calendar,day,start,end);
  if(error){S.checked(await db.from('customer_recurring_plans').update({status:'needs_review',review_reason:error}).eq('id',plan.id).eq('status','active'));attention++;continue;}
  const account=plan.account_id?S.checked(await db.from('residential_accounts').select('email').eq('id',plan.account_id).single()):null;
  const q={...b.quote,service:'standard',frequency:plan.frequency,amount_cents:plan.price_cents,gift_cents:0,card_charge_cents:plan.price_cents};
  const result=await db.rpc('customer_portal_book_v2',{p_anchor:b.id,p_email:account?.email||null,p_uid:plan.user_id,p_account:plan.account_id,p_plan:plan.id,p_request:S.hash('recurring:'+plan.id+':'+b.id),p_data:{service_date:day,arrival_start:start,arrival_end:end,quote:q,visit_details:b.visit_details,notes:b.notes,token_hash:S.hash(require('node:crypto').randomBytes(32)),consent_text:plan.consent_text}});
  if(result.error){attention++;continue;}created++;
  }catch{attention++;console.error('Recurring plan scheduling will retry.',{plan_id:plan.id});}
 }
 cursor=plans.at(-1).id;if(plans.length<100)break;
 }return {created,attention};
}
module.exports={CONSENT,price,quote,nextDate,renew};
