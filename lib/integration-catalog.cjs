// Public business API contract. Never use select('*') or caller-supplied table names.
const resource=(table,fields,write='',required=[],extra={})=>({table,fields:fields.split(','),write:write?write.split(','):[],required,pk:'id',...extra});
const resources={
 leads:resource('sales_leads','id,name,company_name,contact_name,contact_email,contact_phone,address,sales_city,sales_state,sales_website,pipeline_stage,sales_owner_id,sales_owner_name,lead_notes,next_step,next_step_due_at,do_not_contact,follow_up_due_at,business_segment,prospect_type,created_at,updated_at','name,company_name,contact_name,contact_email,contact_phone,address,sales_city,sales_state,sales_website,pipeline_stage,sales_owner_id,sales_owner_name,lead_notes,next_step,next_step_due_at,do_not_contact,follow_up_due_at',['name'],{create:false}),
 customers:resource('referral_customers','id,name,email,phone,agent_id,first_booking_id,created_at','name,email,phone',['name'],{create:false}),
 clients:resource('clients','id,name,company_name,primary_contact_name,primary_contact_email,primary_contact_phone,billing_email,billing_address,notes,status,region,market,tags,created_at,updated_at','name,company_name,primary_contact_name,primary_contact_email,primary_contact_phone,billing_email,billing_address,notes,status,region,market,tags',['company_name']),
 properties:resource('properties','id,client_id,property_name,address,city,state,zip,access_notes,supply_notes,service_notes,is_active,created_at,updated_at','client_id,property_name,address,city,state,zip,access_notes,supply_notes,service_notes,is_active',['client_id','property_name']),
 units:resource('property_units','id,property_id,unit_name,square_feet,customer_price,contractor_pay,status,notes,bedroom_count,bathroom_count,created_at,updated_at','property_id,unit_name,square_feet,customer_price,contractor_pay,status,notes,bedroom_count,bathroom_count',['property_id','unit_name']),
 tasks:resource('sales_tasks','id,lead_id,task_type,task_priority,task_status,task_due_at,next_step,created_at,updated_at','lead_id,task_type,task_priority,task_status,task_due_at,next_step',['lead_id','next_step']),
 quotes:resource('sales_quotes','id,lead_id,quote_amount,quote_status,quote_sent_at,quote_expires_at,quote_notes,created_at,updated_at','lead_id,quote_amount,quote_status,quote_expires_at,quote_notes',['lead_id','quote_amount']),
 expenses:resource('finance_expenses','id,vendor_name,category,description,amount,due_day,due_date,recurrence,status,payment_method,notes,paid_at,created_at,updated_at','vendor_name,category,description,amount,due_day,due_date,recurrence,status,payment_method,notes',['vendor_name','amount']),
 bookings:resource('referral_bookings','id,customer_id,agent_id,name,email,phone,property_address,city,state,zip,service,frequency,amount_cents,service_date,arrival_start,arrival_end,status,payment_status,notes,visit_details,completed_at,created_at'),
 assignments:resource('assignment_blocks','id,title,property_name,address,service_type,scope,pay_amount,start_window,end_window,status,claimed_by,assigned_to,completed_at,completion_notes,property_id,unit_id,payment_status,paid_at,created_at,updated_at'),
 contractors:resource('profiles','id,full_name,email,phone,status,region,market,contractor_approved,background_check_status,avatar_url,created_at,updated_at','full_name,phone,region,market',['full_name'],{create:false,filter:{role:'contractor'}}),
 applicants:resource('recruiting_applications','id,role,name,email,phone,city,state,service_city,status,review_note,version,hired_user_id,hired_at,archived_at,created_at,updated_at'),
 documents:resource('contractor_documents','id,profile_id,contractor_name,document_type,title,status,expiration_date,file_name,review_notes,reviewed_at,created_at,updated_at'),
 ambassadors:resource('ba_members','user_id,name,email,code,enabled,onboarding_completed_at,created_at','',[],{pk:'user_id'}),
 referrals:resource('ba_leads','id,member_id,name,email,phone,customer_id,first_booking_id,stage,booked_at,completed_at,created_at'),
 agents:resource('referral_agents','id,name,brokerage,email,phone,city,state,website,status,notes,follow_up_on,referral_code,created_at,updated_at','name,brokerage,email,phone,city,state,website,notes,follow_up_on',['name'],{create:false}),
 gift_orders:resource('gift_orders','id,name,email,quantity,amount_cents,status,email_status,paid_at,service_zone,refunded_cents,created_at'),
 payouts:resource('contractor_payouts','id,assignment_id,contractor_id,method,amount_cents,status,reference,created_at,completed_at'),
 activities:resource('sales_activities','id,lead_id,user_id,user_name,activity_type,activity_text,created_at')
};
const actions={};
function action(name,scope,endpoint,action,description,required=[],write=true){actions[name]={scope,endpoint,action,description,required,write};}
action('bookings.complete','bookings:write','residential-booking','admin_complete','Complete a booking and synchronize its assignment.',['id']);
action('bookings.cancel','bookings:write','residential-booking','admin_cancel','Cancel through the existing booking workflow.',['id']);
action('bookings.approve_job','assignments:write','residential-booking','admin_approve_job','Release a booking to contractors after its checklist review.',['id']);
action('bookings.reconcile','bookings:write','residential-booking','admin_sync','Reconcile payment and assignment state.',['id']);
action('assignments.reassign','assignments:write','integration-assignments','reassign','Reassign an unpaid assignment to an active contractor. Synchronizes assigned/claimed contractor and directory metadata. Read the assignment and contractor first. Requires expected_updated_at. Does not erase work history.',['id','contractor_id','expected_updated_at','reason']);
action('assignments.set_pay','assignments:write','integration-assignments','set_pay','Change the contractor base pay on an unpaid assignment. pay_amount is dollars, not cents. Does not change the customer price or send a payout. Read the assignment first.',['id','pay_amount','expected_updated_at','reason']);
action('calendar.read','calendar:read','residential-booking','calendar_get','Read booking calendar configuration.',[],false);
action('calendar.save','calendar:write','residential-booking','calendar_save','Save booking calendar configuration.');
for(const name of ['archive','restore','review','hire','delete'])action('applicants.'+name,'applicants:write','applicants',name,'Run applicant '+name+' using the same workflow as the admin portal.',['id']);
action('gift_cards.search','gift_orders:read','gift-cards','admin_search','Search gift orders or cards.',[],false);
action('gift_cards.service_area','gift_orders:write','gift-cards','admin_service_area','Assign a purchased gift order to a service area.',['id','expected_zone']);
action('gift_cards.refund','payments:write','gift-cards','admin_refund','Refund an eligible gift card through Stripe.',['id','reason']);
action('contractors.availability','contractors:write','contractor-crm','availability','Update a contractor availability schedule.',['id','status','days']);
action('contractors.detail','contractors:read','contractor-crm','detail','Read contractor jobs, earnings, availability, and feedback.',['id'],false);
action('payouts.transfer','payments:write','contractor-crm','transfer','Transfer an eligible contractor payout through Stripe.',['id','assignment','expected_amount']);
action('payouts.record_external','payments:write','contractor-crm','external','Record a contractor payout paid outside Stripe.',['id','assignment','expected_amount','reference']);
action('sales.overview','sales:read','crm-overview','overview','Daily and weekly team activity, hours, sales, contacts and hourly pay.',[],false);
action('sales.summary','sales:read','crm-sales','context','Sales, commissions, links, and outstanding notifications.',[],false);
action('sales.send','communications:write','crm-sales','send','Send a sales email or SMS using the existing CRM workflow.');
action('ambassadors.dashboard','ambassadors:read','ambassadors','dashboard','Ambassador referrals, readiness, sharing assets, and earnings.',[],false);
action('ambassadors.toggle','ambassadors:write','ambassadors','toggle','Enable or disable ambassador portal access.',['member_id','enabled']);
action('ambassadors.record_payment','payments:write','ambassadors','record_payment','Record a paid ambassador earning.',['id','reference']);
action('documents.upload_start','documents:upload','integration-documents','upload_start','Prepare a private contractor document upload (PDF/JPEG/PNG/WebP, max 20 MB). Read the contractor and existing documents first. SHA-256 deduplicates API uploads per contractor. PUT local file bytes to the returned one-file URL, then call documents.upload_complete. Does not approve reports or complete onboarding.',['profile_id','file_name','content_type','file_size','sha256','document_type']);
action('documents.upload_complete','documents:upload','integration-documents','upload_complete','Verify uploaded bytes and attach the document to its contractor file. Requires the upload_ticket from upload_start and the same saved connection. No approval or checklist changes.',['upload_ticket']);
action('background_checks.review','documents:read','integration-background','review','Read a filed background report, current review version and onboarding checklist submission before approval.',['document_id'],false);
action('background_checks.approve','documents:approve','integration-background','approve','Record an explicitly authorized human approval of a background report and atomically complete its onboarding checklist. The user’s instruction to approve the identified report is sufficient authorization; do not ask for a separate reviewed-it confirmation. Do not infer approval from an upload request or report contents. Read background_checks.review first.',['document_id','expected_updated_at','background_version','expected_submission_id','reference']);
action('coding.submit','platform:full','integration-coding','submit','Send an explicit owner request for portal code changes to Codex. Automatically test and publish eligible changes. Cannot delete records. Security, dependency, migration and bridge changes require separate review. Computer worker must be online. Queued is not published.',['instructions','publish']);
action('coding.status','platform:full','integration-coding','status','Read the latest Codex jobs and worker availability. Optional input id selects one job.',[],false);
action('contractors.onboarding','contractors:read','integration-onboarding','read','Read the actual onboarding checklist, latest review notes, saved-draft progress, background state and Academy modules. No signatures or sensitive form answers.',['profile_id'],false);
action('contractors.academy','contractors:read','integration-onboarding','academy','Read actual Academy lesson counts, quiz scores, completion percentage, waivers and current revision tokens.',['profile_id'],false);
action('contractors.training_requirement','contractors:write','integration-onboarding','training_requirement','Waive or restore the Academy requirement using the existing admin workflow. Read contractors.academy first and pass revisions as expected_revision. A waiver does not fabricate lessons or quiz results.',['profile_id','required','expected_revision','reason']);
const examples={
 'coding.submit':{instructions:'Describe the portal change requested by the owner',publish:true},
 'assignments.reassign':{id:'ASSIGNMENT_UUID',contractor_id:'CONTRACTOR_UUID',expected_updated_at:'TIMESTAMP_FROM_ASSIGNMENT',reason:'Owner requested reassignment'},
 'assignments.set_pay':{id:'ASSIGNMENT_UUID',pay_amount:150,expected_updated_at:'TIMESTAMP_FROM_ASSIGNMENT',reason:'Owner requested pay adjustment'},
 'background_checks.review':{document_id:'DOCUMENT_UUID'},
 'background_checks.approve':{document_id:'DOCUMENT_UUID',expected_updated_at:'TIMESTAMP_FROM_REVIEW',background_version:0,expected_submission_id:null,reference:'VERIFIED_FIRST_REFERENCE'},
 'documents.upload_start':{profile_id:'CONTRACTOR_UUID',file_name:'background-check.pdf',content_type:'application/pdf',file_size:123456,sha256:'LOWERCASE_SHA256_OF_LOCAL_FILE',document_type:'background_check',title:'Verified First report'},
 'documents.upload_complete':{upload_ticket:'TICKET_FROM_UPLOAD_START'},
 'sales.overview':{date:'2026-11-16'},'sales.send':{lead_id:'UUID',channel:'email',request_id:'UUID',consent:true},
 'ambassadors.dashboard':{member_id:'OPTIONAL_UUID'},'ambassadors.toggle':{member_id:'UUID',enabled:true},'ambassadors.record_payment':{id:'EARNING_UUID',reference:'Payment reference'},
 'calendar.save':{version:1,settings:'Use settings returned by calendar.read'},'bookings.approve_job':{id:'UUID',checklist_reviewed:true},
 'applicants.review':{id:'UUID',version:1,status:'shortlisted',note:'Review note'},'applicants.archive':{id:'UUID',version:1},'applicants.restore':{id:'UUID',version:1},
 'contractors.availability':{id:'UUID',status:'available',days:{monday:true,tuesday:true,wednesday:true,thursday:true,friday:true,saturday:false,sunday:false},start:'09:00',end:'17:00',notes:''}};
for(const [name,a] of Object.entries(actions))a.example_input=examples[name]||Object.fromEntries(a.required.map(k=>[k,k==='expected_amount'?1000:k==='expected_zone'?null:'VALUE']));
const scopes=[...new Set(['platform:full','leads:create',...Object.entries(resources).flatMap(([name,r])=>[name+':read',...(r.write.length?[name+':write']:[])]),...Object.values(actions).map(a=>a.scope)])];
const events=Object.keys(resources).flatMap(r=>[(r==='leads'?'lead':r==='bookings'?'booking':r)+'.created',(r==='leads'?'lead':r==='bookings'?'booking':r)+'.updated']);
function catalog(){return {version:'2026-11-17',workspace:'turnly',resources:Object.fromEntries(Object.entries(resources).map(([n,r])=>[n,{id_field:r.pk,fields:r.fields,writable_fields:r.write,required_on_create:r.required,methods:['GET',...(r.write.length?['PATCH']:[]),...(r.write.length&&r.create!==false?['POST']:[])],filter_fields:r.fields.filter(f=>['full_name','email','contractor_approved','status','pipeline_stage','role','city','sales_city','service_city','member_id','lead_id','contractor_id','property_id','profile_id'].includes(f))}])),actions:Object.fromEntries(Object.entries(actions).map(([n,{endpoint,action,...a}])=>[n,a])),scopes,events};}
module.exports={resources,actions,scopes,events,catalog};
