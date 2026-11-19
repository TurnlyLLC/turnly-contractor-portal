import {weekOf,reportRange} from './crm-report-weeks.mjs';
const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format((Number(n)||0)/100);
export function flatOverview(data){
 if(data.admin)return '';
 const member=data.rows.find(r=>r.plan.mode==='flat');
 if(!member)return '';
 const batch=(member.flat_batches||[]).find(b=>b.plan.id===member.plan.id);
 if(!batch)return '<article class="sales-panel"><h2>Your flat-rate progress</h2><p>Your batch is not available yet.</p><a href="crm-earnings.html">View Earnings →</a></article>';
 const target=Number(batch.plan.lead_target),qualified=batch.payment?target:Math.max(0,Math.min(Number(batch.qualified_count)||0,target)),remaining=Math.max(0,target-qualified);
 const status=batch.payment?(batch.payment.paid_at?'Paid':'Approved · awaiting payment'):remaining===0?'Target reached · awaiting admin approval':'In progress';
 return `<article class="sales-panel crm-flat-overview"><div class="sales-panel-header"><div><p class="crm-eyebrow">YOUR CURRENT LEAD BATCH</p><h2>${money(batch.plan.flat_cents)} for ${target} qualifying leads</h2></div><a class="sales-primary-button" href="crm-earnings.html">View leads & progress →</a></div><div class="crm-flat-overview-stats"><div><strong>${qualified}</strong><span>Qualified leads</span></div><div><strong>${remaining}</strong><span>Leads left to qualify</span></div><div><strong>${Math.round(qualified/target*100)}%</strong><span>Batch complete</span></div></div><progress value="${qualified}" max="${target}" aria-label="Current lead batch progress"></progress><p><strong>${status}</strong> · ${Number(batch.plan.min_attempts)} qualifying attempts per lead. Full-batch progress, not just this week.</p><button class="sales-secondary-button" data-refresh-flat>Refresh progress</button></article>`;
}
export async function mountFlatOverview(root,request){
 async function load(){
  root.innerHTML='<p role="status">Loading your progress…</p>';
  try{
   const {from,to}=weekOf();
   root.innerHTML=flatOverview(await request({action:'report',...reportRange(from,to)}));
   const refresh=root.querySelector('[data-refresh-flat]');if(refresh)refresh.onclick=load;
  }catch{
   root.innerHTML='<article class="sales-panel"><p role="status">Unable to load your progress.</p><button class="sales-secondary-button" data-refresh-flat>Retry</button> <a href="crm-earnings.html">View Earnings →</a></article>';
   root.querySelector('[data-refresh-flat]').onclick=load;
  }
 }
 await load();
}
