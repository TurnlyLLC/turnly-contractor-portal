const S=require('./residential-server.cjs');
const {requireCrmSession}=require('./crm-access.cjs');
const {email,phone,uuid}=require('./agent-referrals.cjs');
const checked=S.checked;
const capabilities=()=>({email:!!(process.env.RESEND_API_KEY&&process.env.REFERRAL_FROM_EMAIL),sms:!!(process.env.TWILIO_ACCOUNT_SID&&process.env.TWILIO_AUTH_TOKEN&&process.env.TWILIO_MESSAGING_SERVICE_SID)});
async function access(db,req){
 const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
 const a=await db.auth.getUser(token);if(a.error||!a.data?.user)throw S.fail('Please sign in again.',401);
 const p=checked(await db.from('profiles').select('id,role,status,full_name').eq('id',a.data.user.id).single());
 if(!['admin','sales','sales_team'].includes(p.role)||p.status!=='active')throw S.fail('Active sales access required.',403);
 await requireCrmSession(db,p.id,token);return {...p,admin:p.role==='admin'};
}
async function link(db,user){
 checked(await db.from('crm_sales_links').upsert({user_id:user.id},{onConflict:'user_id',ignoreDuplicates:true}));
 const r=checked(await db.from('crm_sales_links').select('code').eq('user_id',user.id).single());
 return {code:r.code,url:`${S.ORIGIN}/gift-cards.html?ref=${r.code}`};
}
async function attribution(db,ref,contact){
 if(!ref&&!contact)return {};
 if(!/^[a-f0-9]{32}$/.test(ref||''))throw S.fail('This sales link is invalid.');
 const l=checked(await db.from('crm_sales_links').select('user_id').eq('code',ref).maybeSingle());
 if(!l)throw S.fail('This sales link is no longer available.');
 const p=checked(await db.from('profiles').select('id,full_name,role,status').eq('id',l.user_id).single());
 const a=checked(await db.from('crm_user_access').select('enabled').eq('user_id',l.user_id).maybeSingle());
 if(p.status!=='active'||!['admin','sales','sales_team'].includes(p.role)||a?.enabled===false)throw S.fail('This sales link is inactive. Please contact Turnly.');
 let lead=null;
 if(contact){
  if(!/^[a-f0-9]{32}$/.test(contact))throw S.fail('Invalid contact link.');
  const c=checked(await db.from('crm_checkout_links').select('lead_id').eq('token',contact).eq('sales_user_id',p.id).maybeSingle());
  if(!c)throw S.fail('Invalid contact link.');
  lead=checked(await db.from('sales_leads').select('id,prospect_type').eq('id',c.lead_id).eq('business_segment','residential').maybeSingle());
 }
 const config=checked(await db.from('crm_sales_settings').select('*').eq('id',true).single());
 return {sales_user_id:p.id,sales_lead_id:lead?.id||null,commission_mode:config.commission_mode,commission_rate:config.commission_rate,representative:p.full_name};
}
async function leadFor(db,user,id){
 if(!uuid(id))throw S.fail('Choose a lead.');
 const lead=checked(await db.from('sales_leads').select('*').eq('id',id).eq('business_segment','residential').single());
 if(!user.admin&&lead.sales_owner_id!==user.id)throw S.fail('This lead belongs to another sales member.',403);
 if(lead.do_not_contact)throw S.fail('This lead has opted out of contact.',409);
 return lead;
}
async function contactLink(db,user,lead){
 const own=await link(db,user);
 checked(await db.from('crm_checkout_links').upsert({sales_user_id:user.id,lead_id:lead.id},{onConflict:'sales_user_id,lead_id',ignoreDuplicates:true}));
 const c=checked(await db.from('crm_checkout_links').select('token').eq('sales_user_id',user.id).eq('lead_id',lead.id).single());
 return {url:own.url+'&contact='+c.token,token:c.token};
}
// All rows, including portfolios larger than the API's 1,000-row default limit.
async function all(db,table,columns,filter,key='id'){const rows=[];for(let from=0;;from+=500){let q=db.from(table).select(columns).order(key);if(filter)q=filter(q);const batch=checked(await q.range(from,from+499));rows.push(...batch);if(batch.length<500)return rows;}}
function summarize(orders,commissions=[]){
 const paid=orders.filter(o=>o.paid_at),clients=new Map();
 for(const o of paid){const key=o.email.trim().toLowerCase(),c=clients.get(key)||{email:key,name:o.name,realtor:false,purchases:0,cards:0,gross_cents:0,refund_cents:0};c.realtor ||=o.buyer_kind==='realtor';c.purchases++;c.cards+=o.quantity;c.gross_cents+=o.amount_cents;c.refund_cents+=o.refunded_cents||0;clients.set(key,c);}
 const values=[...clients.values()];
 return {purchases:paid.length,cards:paid.reduce((s,o)=>s+o.quantity,0),buyers:values.length,realtor_buyers:values.filter(c=>c.realtor).length,gross_cents:paid.reduce((s,o)=>s+o.amount_cents,0),refund_cents:paid.reduce((s,o)=>s+(o.refunded_cents||0),0),held_cents:paid.filter(o=>o.disputed||o.status==='review').reduce((s,o)=>s+o.amount_cents-(o.refunded_cents||0),0),commission_cents:commissions.filter(c=>c.status==='earned').reduce((s,c)=>s+(c.amount_cents||0),0),unrated:commissions.filter(c=>c.status==='rate_not_set').length,clients:values.sort((a,b)=>b.gross_cents-a.gross_cents)};
}
async function send(db,user,i){
 if(!['email','sms'].includes(i.channel)||!uuid(i.request_id)||i.consent!==true)throw S.fail('Verify permission for the selected communication channel before sending.');
 const lead=await leadFor(db,user,i.lead_id),recipient=i.channel==='email'?email(lead.contact_email):phone(lead.contact_phone);
 if(!recipient)throw S.fail('Add the recipient’s contact information to the lead first.');
 if(!capabilities()[i.channel])throw S.fail('This sending service is not configured yet.',503);
 const existing=checked(await db.from('crm_sales_messages').select('*').eq('request_id',i.request_id).maybeSingle());
 if(existing){if(existing.user_id!==user.id||existing.lead_id!==lead.id||existing.channel!==i.channel)throw S.fail('Request conflict.',409);return existing;}
 const c=await contactLink(db,user,lead),name=lead.contact_name||'there';
 const body=`Hi ${name}, ${user.full_name||'your Turnly representative'} here from Turnly Residential. Here is the gift-card link you requested: ${c.url}\nEach card provides $100 toward eligible Turnly cleaning in our North Carolina service areas, with no expiration. Purchase multiple cards for closing or move-in gifts. Terms and service areas are on the checkout page. ${i.channel==='sms'?'Reply STOP to opt out.':`To stop sales emails, visit ${S.ORIGIN}/crm-unsubscribe.html#${c.token}`}`;
 const inserted=await db.from('crm_sales_messages').insert({request_id:i.request_id,user_id:user.id,lead_id:lead.id,channel:i.channel,recipient,consent_at:new Date().toISOString(),consent_note:'Sales member explicitly confirmed permission for '+i.channel,body}).select('*').single();
 if(inserted.error?.code==='23505')throw S.fail('This send is already processing. Check its activity before retrying.',409);
 const row=checked(inserted);let update;
 try{
  const sms=i.channel==='sms';const response=await fetch(sms?`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`:'https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(18000),headers:sms?{Authorization:'Basic '+Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'}:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'crm-'+row.id},body:sms?new URLSearchParams({To:recipient,MessagingServiceSid:process.env.TWILIO_MESSAGING_SERVICE_SID,Body:body}).toString():JSON.stringify({from:process.env.REFERRAL_FROM_EMAIL,to:[recipient],subject:'Your Turnly $100 gift-card link',text:body})});
  const result=await response.json();if(!response.ok)throw Object.assign(new Error('The provider rejected this send. Check sender configuration and recipient details.'),{definitive:true});
  if(!(result.id||result.sid))throw new Error('No message receipt');update={status:'accepted',provider_id:result.id||result.sid};
 }catch(e){update={status:e.definitive?'failed':'unknown',error:e.definitive?e.message:'Sending outcome is unknown. Check the provider before sending another message.'};}
 checked(await db.from('crm_sales_messages').update(update).eq('id',row.id));
 checked(await db.from('sales_activities').insert({lead_id:lead.id,user_id:user.id,user_name:user.full_name,activity_type:'outreach',activity_text:`Gift-card ${i.channel}: ${update.status}. Consent confirmed.`,metadata:{message_id:row.id}}));
 if(update.status==='accepted'&&!['active','lost','follow_up'].includes(lead.pipeline_stage))checked(await db.from('sales_leads').update({pipeline_stage:'link_sent'}).eq('id',lead.id));
 return {...row,...update};
}
module.exports={access,link,attribution,leadFor,contactLink,all,summarize,send,capabilities};
