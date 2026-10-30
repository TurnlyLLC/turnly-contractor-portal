const S=require('./residential-server.cjs');
const A=require('./residential-accounts.cjs');
const {uuid}=require('./agent-referrals.cjs');
const APP_COOKIE='__Host-turnly_app_customer';
const editable=['requested','review_required','awaiting_card','scheduled','needs_reschedule'];
const unpaid=['not_collected','card_saved','action_required'];
function appToken(req){const value=String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(APP_COOKIE+'='))?.slice(APP_COOKIE.length+1);return /^[A-Za-z0-9_.-]{20,6000}$/.test(value||'')?value:null;}
function appCookie(res,token,seconds=3600){res.setHeader('Set-Cookie',`${APP_COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${seconds}`);}
async function identity(db,req){
 const token=appToken(req);
 if(!token)return {...await A.account(db,req),kind:'website',uid:null};
 const {data,error}=await db.auth.getUser(token);if(error||!data?.user)throw S.fail('Please sign in again.',401);
 const u=data.user,p=S.checked(await db.from('profiles').select('role,status,full_name').eq('id',u.id).maybeSingle());
 if(p?.role!=='customer'||['disabled','suspended','inactive','rejected'].includes(p.status))throw S.fail('Please use an active customer account.',403);
 return {id:u.id,uid:u.id,kind:'app',name:p.full_name||u.user_metadata?.full_name||'Customer',email:u.email,verified:!!u.email_confirmed_at&&u.app_metadata?.turnly_autoconfirmed!==true};
}
async function claimBooking(db,a,input){
 if(!input.booking||!input.booking_token)return;
 const b=await S.owned(db,{id:input.booking,token:input.booking_token});
 if(b.email!==a.email)throw S.fail('Sign in with the email used for this booking.',403);
 if(a.uid)S.checked(await db.from('residential_referral_links').upsert({booking_id:b.id,user_id:a.uid,method:'token'},{onConflict:'booking_id',ignoreDuplicates:true}));
 else if(Array.isArray(a.booking_ids)&&a.booking_ids.length)S.checked(await db.rpc('link_customer_rebooking',{p_account:a.id,p_anchor:a.booking_ids[0],p_booking:b.id}));
}
async function scope(db,a){
 if(!a.uid)return Array.isArray(a.booking_ids)?{ids:a.booking_ids}:{email:a.email};
 if(a.verified){
  const rows=S.checked(await db.from('referral_bookings').select('id').eq('email',a.email).is('assignment_deleted_at',null));
  if(rows.length)S.checked(await db.from('residential_referral_links').upsert(rows.map(b=>({booking_id:b.id,user_id:a.uid,method:'email'})),{onConflict:'booking_id',ignoreDuplicates:true}));
 }
 const links=S.checked(await db.from('residential_referral_links').select('booking_id').eq('user_id',a.uid));
 return {ids:links.map(l=>l.booking_id)};
}
function query(db,scope,fields='*',options){let q=db.from('referral_bookings').select(fields,options).is('assignment_deleted_at',null);return scope.email?q.eq('email',scope.email):q.in('id',scope.ids.length?scope.ids:['00000000-0000-0000-0000-000000000000']);}
async function owned(db,scope,id){if(!uuid(id))throw S.fail('Choose a cleaning.',400);const b=S.checked(await query(db,scope).eq('id',id).maybeSingle());if(!b)throw S.fail('Cleaning not found.',404);return b;}
function canModify(b,job){return editable.includes(b.status)&&unpaid.includes(b.payment_status)&&(b.status==='needs_reschedule'||Date.parse(b.charge_at)>Date.now())&&!['en_route','in_progress','qa_pending','completed','cancelled'].includes(job?.status);}
function publicName(name){const parts=String(name||'').trim().split(/\s+/).filter(Boolean);return parts.length?parts[0]+(parts.length>1?' '+parts.at(-1)[0]+'.':''):'Your cleaner';}
async function present(db,rows,detail=false){
 if(!rows.length)return [];
 const jobs=S.checked(await db.from('assignment_blocks').select('id,status,assigned_to_name,claimed_by_name,assigned_to,claimed_by,started_at,completed_at,checklist_responses').in('id',rows.map(b=>b.id)));
 return rows.map(b=>{const j=jobs.find(j=>j.id===b.id);return {...S.summary(b),name:b.name,property_address:b.property_address,city:b.city,state:b.state,zip:b.zip,beds:b.beds,baths:b.baths,sqft:b.sqft,notes:b.notes,created_at:b.created_at,paid_at:b.paid_at,completed_at:b.completed_at,can_modify:canModify(b,j),job:j?{status:j.status,cleaner:publicName(j.claimed_by_name||j.assigned_to_name),started_at:j.started_at,completed_at:j.completed_at,checklist:detail?(Array.isArray(j.checklist_responses)?j.checklist_responses:[]).filter(x=>x.task).map(x=>({task:String(x.task),completed:!!x.completed,section:x.module_name||x.category||'Cleaning checklist'})):undefined}:null};});
}
async function completeCard(db,st,id,strict=false){
 const s=await st.checkout.sessions.retrieve(id,{expand:['setup_intent']});
 if(s.metadata?.source!=='customer_portal_card')return false;
 const si=s.setup_intent;
 if(s.mode!=='setup'||s.status!=='complete'||si?.status!=='succeeded')throw S.fail('Card setup is not complete.',409);
 const b=S.checked(await db.from('referral_bookings').select('id,stripe_customer,stripe_payment_method').eq('id',s.metadata.booking_id).single());
 if(s.client_reference_id!==b.id||s.customer!==b.stripe_customer||si.customer!==b.stripe_customer)throw S.fail('Card does not match this cleaning.',409);
 const pm=typeof si.payment_method==='string'?si.payment_method:si.payment_method?.id;
 if(!/^pm_[A-Za-z0-9]+$/.test(pm||''))throw S.fail('Card confirmation is unavailable.',409);
 if(b.stripe_payment_method===pm)return true;
 const r=await db.rpc('customer_portal_change',{p_id:b.id,p_email:null,p_uid:null,p_op:'card',p_data:{customer:s.customer,payment_method:pm,session:s.id}});
 // A late completion must never replace a card while a charge is in progress.
 if(r.error){if(!strict&&r.error.code==='P0001'){console.error('Customer card update arrived after the visit became locked.');return true;}throw S.fail('Your card was saved in Stripe, but this visit could not be updated. Contact Turnly before changing its payment.',409);}
 return true;
}
module.exports={claimBooking,identity,scope,query,owned,present,canModify,publicName,appToken,appCookie,completeCard,editable,unpaid};
