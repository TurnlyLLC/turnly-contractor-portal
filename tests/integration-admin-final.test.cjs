const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{PGlite}=require('@electric-sql/pglite');
const Control=require('../lib/integration-admin-control.cjs'),Msg=require('../lib/integration-customer-messages.cjs'),Reprice=require('../lib/integration-booking-reprice.cjs'),M=require('../api/turnly-mcp.js');
const actor='11111111-1111-4111-8111-111111111111',rep='22222222-2222-4222-8222-222222222222',key='33333333-3333-4333-8333-333333333333';
test('new actions are scoped, no-deletion stays enforced, and request validation rejects dangerous inputs',()=>{
 const all=M.definitions(['platform:full'],{deny_record_deletion:true}).map(x=>x.name);
 for(const n of ['sales_unassign_leads','connections_create_key','customer_messages_send','bookings_apply_change','finance_import_expenses'])assert.ok(all.includes('turnly_'+n));
 assert.ok(!all.some(x=>/_(delete|remove|purge|destroy)(_|$)/.test(x)));assert.ok(!M.definitions(['leads:read']).some(x=>x.name==='turnly_connections_create_key'));
 assert.throws(()=>Control.validate('assign',{operator_ids:[rep],lead_ids:[actor],only_unassigned:'false'}));assert.throws(()=>Control.validate('limits',{rep:null,settings:{owner_monthly_limit:100000},expected_settings:{}}));
 assert.throws(()=>Msg.validate({target_type:'arbitrary_url',target_id:actor,channel:'email',body:'hello',subject:'test',purpose:'transactional',consent:true}));
 assert.throws(()=>Reprice.merge({}, {payment_status:'paid'}));assert.throws(()=>Reprice.editable({booking:{status:'scheduled',payment_status:'paid'}}));
 const b={property_address:'100 Test St',city:'Raleigh',state:'NC',zip:'27601',beds:2,baths:2,sqft:1000,service:'standard',frequency:'once',visit_details:{pets:'no',parking:'driveway',access_method:'resident'}};
 const q=Reprice.merge(b,{visit_details:{pets:'yes',pet_details:'One dog'}});assert.equal(q.amount_cents,22500);assert.equal(q.visit_details.parking,'driveway');
 const recurring=Reprice.merge({...b,recurring_plan_id:key,frequency:'weekly'}, {sqft:1000});assert.equal(recurring.amount_cents,14000);
});
async function fixture(){const db=new PGlite();await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;");
 const builtin=new Set(['text','uuid','bool','int2','int4','int8','numeric','float4','float8','date','time','timestamptz','timestamp','jsonb','json','inet']);
 for(const {table_name,columns}of require('./fixtures/admin-control-schema.json')){
  const cols=Object.entries(columns).map(([n,c])=>{const raw=c.type.startsWith('_')?c.type.slice(1):c.type,base=builtin.has(raw)?raw:'text',type=base+(c.type.startsWith('_')?'[]':'');let def=(c.default||'').replaceAll('extensions.gen_random_uuid()','gen_random_uuid()');if(def.includes('auth.')||def.includes('nextval')||/public\./.test(def))def='';if(!builtin.has(raw)&&!c.type.startsWith('_'))def=def.replace(/::[a-z_]+/g,'::text');return '"'+n+'" '+type+(n==='id'?' primary key':'')+(def?' default '+def:'');});
  await db.exec('create table '+table_name+'('+cols.join(',')+')');
 }
 await db.exec('create table customer_recurring_plans(id uuid primary key,latest_booking_id uuid,status text,review_reason text);');
 await db.exec('alter table communication_rep_limits add primary key(user_id);');
 await db.exec("create function current_user_can_use_sales_portal()returns boolean language sql as $$select exists(select 1 from profiles where id=auth.uid() and role='admin' and status='active')$$;create function current_user_has_role(text[])returns boolean language sql as $$select exists(select 1 from profiles where id=auth.uid() and role=any($1))$$;create function communication_alerts()returns void language sql as $$select$$;create function communication_totals(p_user uuid default null)returns jsonb language sql as $$select '{\"daily_cents\":0,\"monthly_cents\":0}'::jsonb$$;");
 for(const f of require('./fixtures/admin-control-functions.json'))await db.exec(f.definition);
 for(const path of ['docs/integration-admin-final-controls.sql','docs/integration-booking-amend.sql','docs/integration-external-message-budget.sql','docs/owner-assistant-diagnostics.sql'])await db.exec(fs.readFileSync(path,'utf8'));
 await db.query("insert into profiles(id,role,status,full_name,email)values($1,'admin','active','Test Admin','admin@example.test'),($2,'sales','active','Test Rep','rep@example.test')",[actor,rep]);
 return db;
}
test('bulk sales workflows preserve status/notes and budget edits reject stale settings',async()=>{const db=await fixture();try{
 await db.query("insert into sales_leads(id,name,business_segment,pipeline_stage,do_not_contact,lead_notes,sales_city,sales_region)values($1,'Test','residential','new_leads',false,'Preserve me','Raleigh','NC')",[key]);
 const run=(op,i)=>db.query('select integration_sales_control($1,$2,$3) result',[actor,op,JSON.stringify(i)]);
 assert.equal((await run('allocate',{operator_ids:[rep],count:1,city:'Raleigh'})).rows[0].result.count,1);
 let l=(await db.query('select * from sales_leads where id=$1',[key])).rows[0];assert.equal(l.sales_owner_id,rep);assert.equal(l.lead_notes,'Preserve me');assert.equal(l.pipeline_stage,'new_leads');
 assert.equal((await run('unassign',{operator_id:rep,status:'all',started_at:new Date().toISOString()})).rows[0].result.count,1);
 l=(await db.query('select * from sales_leads where id=$1',[key])).rows[0];assert.equal(l.sales_owner_id,null);assert.equal(l.lead_notes,'Preserve me');assert.equal((await db.query('select count(*)n from sales_activities')).rows[0].n,2);
 await db.exec("insert into communication_settings(id,daily_cents,monthly_cents,paused,calls_paused,texts_paused,max_call_minutes,default_rep_daily_cents,default_rep_monthly_cents,voice_cents_per_minute,sms_cents_per_segment)values(true,100,1000,false,false,false,5,100,1000,3,2)");
 const before=(await db.query('select to_jsonb(t) s from communication_settings t')).rows[0].s;
 await run('limits',{rep:null,expected_settings:before,settings:{daily_cents:200}});await assert.rejects(()=>run('limits',{rep:null,expected_settings:before,settings:{monthly_cents:900}}));assert.equal((await db.query('select monthly_cents from communication_settings')).rows[0].monthly_cents,1000);
 }finally{await db.close();}});
test('child keys inherit deletion block; secrets are claimed once by their owner',async()=>{const db=await fixture();try{
 await db.query("insert into integration_keys(id,name,created_by,scopes,deny_record_deletion)values($1,'Parent',$2,array['platform:full'],true)",[key,actor]);
 const child=crypto.randomUUID(),handoff=crypto.randomUUID();await db.query('select integration_create_connection($1,$2,$3,$4,$5,$6)',[actor,key,'key_create',JSON.stringify({id:child,name:'Child',secret_hash:'testhash',prefix:'testprefix',scopes:['platform:full'],expires_at:new Date(Date.now()+86400000).toISOString(),deny_record_deletion:false}),handoff,'sealed-only']);
 assert.equal((await db.query('select deny_record_deletion d from integration_keys where id=$1',[child])).rows[0].d,true);
 await assert.rejects(()=>db.query('select integration_claim_handoff($1,$2)',[rep,handoff]));assert.equal((await db.query('select integration_claim_handoff($1,$2)s',[actor,handoff])).rows[0].s,'sealed-only');await assert.rejects(()=>db.query('select integration_claim_handoff($1,$2)',[actor,handoff]));
 await db.exec('set role anon');await assert.rejects(()=>db.query('select * from integration_credential_handoffs'));await assert.rejects(()=>db.query('select integration_booking_snapshot($1,$2)',[actor,key]));
 }finally{await db.close();}});
test('repricing atomically adjusts gift reservation, charge and 36% pay; stale and started payments stay protected',async()=>{const db=await fixture();try{
 const card=crypto.randomUUID();await db.query("insert into referral_bookings(id,name,status,payment_status,amount_cents,gift_applied_cents,charge_at,property_address,city,state,zip,beds,baths,sqft,service,frequency,quote,visit_details)values($1,'Test customer','scheduled','card_saved',30000,20000,now()+interval '5 days','100 Test St','Raleigh','NC','27601',2,2,1000,'deep','once','{}','{}')",[key]);
 await db.query("insert into assignment_blocks(id,title,property_name,status,pay_amount,metadata,assigned_to,updated_at)values($1,'Test','Test','claimed',108,'{\"source\":\"residential_booking\"}',$2,now())",[key,rep]);
 await db.query("insert into gift_cards(id,status,balance_cents,reserved_cents)values($1,'active',20000,20000);",[card]);await db.query("insert into gift_reservations(booking_id,card_id,amount_cents,status)values($1,$2,20000,'reserved')",[key,card]);
 const plan=crypto.randomUUID();await db.query("insert into customer_recurring_plans(id,latest_booking_id,status)values($1,$2,'active')",[plan,key]);await db.query('update referral_bookings set recurring_plan_id=$1 where id=$2',[plan,key]);
 const snapshot=async()=>(await db.query('select integration_booking_snapshot($1,$2)s',[actor,key])).rows[0].s;const s=await snapshot();
 const review={revision:s.revision,assignment_revision:s.assignment.updated_at,gift_revision:s.gift_revision,plan_revision:s.plan_revision,amount_cents:17500,gift_applied_cents:17500,contractor_pay:63,reason:'Owner amended test scope'};
 const booking={...s.booking,amount_cents:17500,service:'standard',quote:{amount_cents:17500}};
 const apply=()=>db.query('select integration_booking_amend($1,$2,$3,$4,$5)r',[actor,key,JSON.stringify(review),JSON.stringify(booking),JSON.stringify({address:'100 Test St',scope:'Standard clean',service_type:'Standard',metadata:{source:'residential_booking'},property_checklist_items:[]})]);
 const r=(await apply()).rows[0].r;assert.equal(r.card_charge_cents,0);assert.equal(r.contractor_pay,63);assert.equal(r.charged_now,false);assert.equal(r.recurring_renewal_paused,true);assert.equal((await db.query('select status from customer_recurring_plans where id=$1',[plan])).rows[0].status,'needs_review');
 const next=await snapshot();assert.equal(next.card.reserved_cents,17500);assert.equal(next.card.balance_cents,20000);assert.equal(next.assignment.assigned_to,null);assert.equal(next.assignment.status,'pending');await assert.rejects(apply);
 await db.query("update referral_bookings set stripe_payment_intent='pi_test' where id=$1",[key]);const started=await snapshot();review.revision=started.revision;review.assignment_revision=started.assignment.updated_at;review.gift_revision=started.gift_revision;await assert.rejects(apply);
 }finally{await db.close();}});
test('external SMS shares Alice allowance and blocks at the existing $25 cap',async()=>{const db=await fixture();try{
 await db.exec("insert into communication_settings(id,daily_cents,monthly_cents,paused,calls_paused,texts_paused,max_call_minutes,default_rep_daily_cents,default_rep_monthly_cents,voice_cents_per_minute,sms_cents_per_segment)values(true,10000,100000,false,false,false,5,10000,100000,3,2);insert into owner_sms_settings(id,fixed_cents,setup_cents,stream_cents)values(true,2499,0,0)");
 await assert.rejects(()=>db.query("select communication_reserve('test',$1,'sms','A.L.I.C.E. external message',1)",[actor]));
 await db.exec('update owner_sms_settings set fixed_cents=2000');await db.query("select communication_reserve('test',$1,'sms','A.L.I.C.E. external message',1)",[actor]);assert.equal((await db.query('select owner_assistant_reserved() n')).rows[0].n,2002);
 const diag=crypto.randomUUID();await db.query("select owner_assistant_diagnostic_reserve($1,'test-agent',50)",[diag]);assert.equal((await db.query('select owner_assistant_reserved() n')).rows[0].n,2052);await db.query("update owner_assistant_diagnostics set state='done',actual_cents=1.5 where id=$1",[diag]);assert.equal((await db.query('select owner_assistant_reserved() n')).rows[0].n,2004);
 }finally{await db.close();}});
