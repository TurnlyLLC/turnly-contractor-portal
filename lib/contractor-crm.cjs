const S=require('./residential-server.cjs');
const {uuid}=require('./agent-referrals.cjs');
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
function checked(r){if(r.error)throw fail(r.error.message,503);return r.data;}
async function rows(db,table,fields='*',filter=q=>q){let out=[];for(let i=0;;i+=500){const page=checked(await filter(db.from(table).select(fields)).order('id').range(i,i+499));out.push(...page);if(page.length<500)return out;}}
const paid=j=>j.paid_out||j.paid_at||[j.payment_status,j.pay_status,j.payout_status,j.quickbooks_payment_status,j.metadata?.payment?.status].includes('paid');
function amount(j){const p=j.metadata?.payment||{};return Math.round(Math.max(0,Number(j.pay_amount||0)+Number(p.added_fee_amount||0)-Number(p.fee_amount||0))*100);}
const completed=j=>['completed','approved','paid'].includes(j.status);
async function profile(db,id){if(!uuid(id))throw fail('Choose a contractor');const p=checked(await db.from('profiles').select('id,full_name,email,role,status').eq('id',id).maybeSingle());if(p?.role!=='contractor')throw fail('Contractor not found',404);return p;}
async function transfer(db,st,actor,input){
 const reservation=checked(await db.rpc('reserve_contractor_payout',{p_actor:actor,p_contractor:input.id,p_assignment:input.assignment,p_method:input.action==='external'?'external':'stripe',p_expected:input.expected_amount,p_reference:String(input.reference||'')}));
 if(reservation.status==='completed')return {payment:reservation};
 if(reservation.method==='external')return {payment:checked(await db.rpc('finish_contractor_payout',{p_id:reservation.id,p_transfer:null}))};
 // Reconcile a previous ambiguous response before any retry. A reserved payment is never automatically released.
 const previous=await st.transfers.list({transfer_group:'turnly_'+reservation.id,limit:100});
 let sent=previous.data.find(t=>t.metadata?.payout_id===reservation.id);
 if(!sent){
  if(Date.now()-Date.parse(reservation.created_at)>23*3600*1000)throw fail('This transfer needs Stripe reconciliation before it can be retried. No additional money was sent.',409);
  const account=await st.accounts.retrieve(reservation.destination);
  if(!account.payouts_enabled||account.capabilities?.transfers!=='active')throw fail('The contractor must complete Stripe payout setup. This payment is reserved; retry it after setup.',409);
  sent=await st.transfers.create({amount:Number(reservation.amount_cents),currency:'usd',destination:reservation.destination,transfer_group:'turnly_'+reservation.id,metadata:{payout_id:reservation.id,assignment_id:reservation.assignment_id,contractor_id:reservation.contractor_id}},{idempotencyKey:'turnly-contractor-'+reservation.id});
 }
 if(sent.destination!==reservation.destination||sent.amount!==Number(reservation.amount_cents)||sent.currency!=='usd'||sent.reversed||sent.amount_reversed)throw fail('Stripe transfer needs admin reconciliation; no duplicate payment was sent.',409);
 return {payment:checked(await db.rpc('finish_contractor_payout',{p_id:reservation.id,p_transfer:sent.id}))};
}
async function run(db,actor,input,stripeFactory=S.stripe){
 if(input.action==='list'){
  const [profiles,availability,jobs]=await Promise.all([rows(db,'profiles','id',q=>q.eq('role','contractor')),rows(db,'contractor_availability'),rows(db,'assignment_blocks','id,status,claimed_by,assigned_to,pay_amount,payment_status,pay_status,payout_status,paid_out,paid_at,quickbooks_payment_status,metadata')]);
  const totals=new Map();for(const j of jobs){if(!completed(j))continue;const id=j.claimed_by||j.assigned_to;if(!id)continue;const x=totals.get(id)||{jobs:0,due_cents:0};x.jobs++;if(!paid(j))x.due_cents+=amount(j);totals.set(id,x);}
  const av=new Map(availability.map(a=>[a.contractor_id,a]));return {contractors:profiles.map(p=>({id:p.id,availability:av.get(p.id)||null,...(totals.get(p.id)||{jobs:0,due_cents:0})}))};
 }
 const p=await profile(db,input.id);
 if(input.action==='account_access'){const r=await db.auth.admin.getUserById(p.id);if(r.error)throw fail('Login details could not be loaded',503);const u=r.data.user;return {email:u.email,last_sign_in_at:u.last_sign_in_at||null,created_at:u.created_at,password_reset_required:!!u.app_metadata?.turnly_force_password_change};}
 if(input.action==='availability'){
  const days=['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
  if(!['available','limited','unavailable'].includes(input.status)||!input.days||days.some(d=>typeof input.days[d]!=='boolean'))throw fail('Choose availability and days');
  if([input.start,input.end].some(t=>t&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)))throw fail('Enter valid times');
  if(input.start&&input.end&&input.start>=input.end)throw fail('End time must be after start time');
  const notes=String(input.notes||'');if(notes.length>2000)throw fail('Keep notes under 2,000 characters');
  checked(await db.from('contractor_availability').upsert({contractor_id:p.id,status:input.status,days:Object.fromEntries(days.map(d=>[d,input.days[d]])),preferred_start_time:input.start||null,preferred_end_time:input.end||null,notes,updated_at:new Date().toISOString()},{onConflict:'contractor_id'}));return {ok:true};
 }
 if(['transfer','external'].includes(input.action)){if(!uuid(input.assignment)||!Number.isSafeInteger(input.expected_amount)||input.expected_amount<=0)throw fail('Select a valid payable assignment');return transfer(db,input.action==='transfer'?stripeFactory():null,actor,input);}
 if(input.action!=='detail')throw fail('Unknown action');
 const [availability,link,jobs,payouts]=await Promise.all([db.from('contractor_availability').select('*').eq('contractor_id',p.id).maybeSingle().then(checked),db.from('contractor_connect_accounts').select('account_id').eq('profile_id',p.id).maybeSingle().then(checked),rows(db,'assignment_blocks','*',q=>q.or(`claimed_by.eq.${p.id},assigned_to.eq.${p.id}`)),rows(db,'contractor_payouts','*',q=>q.eq('contractor_id',p.id))]);
 let connect_ready=false,connect_status='Not connected — contractor needs to set up Stripe payouts.';
 if(link){try{const a=await stripeFactory().accounts.retrieve(link.account_id);connect_ready=!!a.payouts_enabled&&a.capabilities?.transfers==='active';connect_status=connect_ready?'Ready to receive Stripe transfers':'Stripe setup incomplete or restricted — contractor should resume setup.';}catch{connect_status='Stripe status could not be checked. Refresh before paying.';}}
 const ledger=new Map(payouts.map(r=>[r.assignment_id,r]));
 return {availability,connect_ready,connect_status,jobs:jobs.filter(j=>completed(j)&&(j.claimed_by||j.assigned_to)===p.id).map(j=>{const r=ledger.get(j.id);return {id:j.id,title:j.title||j.property_name||'Cleaning assignment',date:String(j.start_window||'').slice(0,10),amount_cents:r?Number(r.amount_cents):amount(j),payable:!paid(j)&&!r, retry:r?.method==='stripe'&&r.status==='reserved',payment_label:r?`${r.method==='stripe'?'Stripe':'External'} · ${r.status==='completed'?(r.method==='stripe'?'Transferred (bank settlement in Stripe)':'Paid'):'Reserved — check transfer'}${r.reference?' · '+r.reference:''}`:paid(j)?'Previously paid':'Unpaid'};})};
}
module.exports={run,transfer,amount,paid,rows,checked,profile,fail};
