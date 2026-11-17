const specs=[

 ['reviews.pending','platform:full','integration-admin-control','pending_reviews','Read this owner’s unexpired booking/message previews across calls/texts. On CONFIRM, match exact previously proposed recipient/content/price; if multiple proposals are ambiguous, clarify.',[],false],

 ['communications.usage','communications:read','integration-admin-control','usage','Read business calling/texting settings, actual provider totals, representative limits and recent usage. Separate from Alice monthly allowance.',[],false],

 ['communications.sync','communications:write','communication-budget','sync','Refresh actual Twilio business usage without sending messages.',[]],

 ['communications.set_limits','communications:write','integration-admin-control','limits','Patch only requested business communication limits. Read usage first; expected_settings must equal the current selected settings; rep null means global, otherwise sales UUID. Does not change Alice $25 allowance.',['rep','expected_settings','settings']],

 ['sales.call_history','sales:read','integration-admin-control','calls','Read paged call history. Optional lead_id,user_id,from,to,after call UUID,limit up to100. No phone credentials or browser dial tokens.',[],false],

 ['sales.allocate_leads','sales:write','integration-admin-control','allocate','Distribute up to2000 new unassigned residential leads evenly across active operator_ids, filtered by optional region/city. Preserves lead statuses and notes. count is total, not per rep.',['operator_ids','count']],

 ['sales.assign_leads','sales:write','integration-admin-control','assign','Assign selected residential lead_ids to active operator_ids, with original activity logging. Set only_unassigned true unless explicitly authorized to reassign. Up to2000 leads.',['lead_ids','operator_ids','only_unassigned']],

 ['sales.unassign_leads','sales:write','integration-admin-control','unassign','Return up to25 leads to unassigned per call without deleting. Read team first. status all/new_leads/contacted/interested/link_sent/follow_up/active/lost/followups. started_at fixed ISO cutoff for entire batch; repeat same cutoff and a NEW idempotency key for each next batch until count=0. Exact retries reuse original key.',['operator_id','status','started_at']],

 ['finance.import_expenses','payments:write','finance-import-expenses','import','Import up to500 parsed workbook rows using portal normalization. Supports vendor/name,amount or monthlyAmount/yearlyAmount,category,description,dueDate,recurrence,paymentMethod,notes. Creates expenses, never overwrites existing expenses. Preview rows before import; retain idempotency key to avoid duplicates.',['rows']],

 ['applicants.attach_imported_resume','applicants:write','applicant-resume-import','attach','Attach exact original imported resume using data base64 up to2.5MB. Server matches original SHA-256 to exactly one imported applicant; existing resume is preserved. Does not hire/send mail.',['data']],

 ['connections.list','platform:full','integration-admin-control','connections_list','Read API connection names/scopes, webhook configuration, delivery history and audit. Secrets excluded.',[],false],

 ['connections.create_key','platform:full','integration-admin-control','key_create','Create API key with name,scopes,days1–365. Child always inherits no-deletion restriction. Returns authenticated portal handoff URL, never the secret in conversation.',['name','scopes','days']],

 ['connections.revoke_key','platform:full','integration-admin-control','key_revoke','Revoke an existing integration key without deleting history. Cannot revoke the current connection or Alice voice/text/worker credentials. Read connections first.',['id']],

 ['connections.create_webhook','platform:full','integration-admin-control','hook_create','Create named public HTTPS webhook for selected events. Review destination/events with owner; returns signing-secret handoff URL.',['name','url','events']],

 ['connections.set_webhook','platform:full','integration-admin-control','hook_toggle','Enable/pause an existing webhook; no deletion.',['id','enabled']],

 ['connections.test_webhook','platform:full','integration-admin-control','hook_test','Queue one test event to an existing enabled webhook, containing no customer data.',['id']],

 ['connections.retry_delivery','platform:full','integration-admin-control','delivery_retry','Retry one failed/cancelled webhook delivery to its enabled destination. Read delivery and confirm destination first.',['id']],

 ['customer_messages.preview','communications:read','integration-customer-messages','preview','Preview free-form customer email/SMS to an existing record. target_type leads/customers/bookings/clients/contractors/ambassadors/agents, target_id UUID, channel email/sms, body, subject for email, purpose transactional/marketing. consent true for permission to use that channel. Returns saved review ID; sends nothing.',['target_type','target_id','channel','body','purpose','consent']],

 ['customer_messages.send','communications:write','integration-customer-messages','send','Send exact preview only after owner authorizes recipient/content. review_token expires10min; request_id UUID stable across retries. Records accepted/failed/unknown accurately. SMS uses business budget plus shared Alice $25 cap.',['review_token','request_id']],

 ['customer_messages.status','communications:read','integration-customer-messages','status','Refresh one message delivery receipt from its provider. Accepted means submitted; delivered means provider-confirmed delivery.',['id'],false],
 ['customer_messages.history','communications:read','integration-customer-messages','history','Read message receipts and delivery outcomes. Optional target_id,id,after,limit100.',[],false],

 ['bookings.preview_change','bookings:read','integration-booking-reprice','preview','Preview customer address/room count/sqft/service/frequency/pets/parking/access changes. data contains requested fields only; visit_details object is merged. Requotes with current pricing, checks coverage, computes gift allocation and 36% contractor pay. Returns saved review ID; no charge/change.',['id','data','reason']],

 ['bookings.apply_change','bookings:write','integration-booking-reprice','apply','Apply exact preview atomically before payment processing/work starts. Confirm new amount and contractor release/checklist reset. Keeps gift balance and booking/assignment synchronized. Updates scheduled charge, does not charge now or fabricate customer acceptance. Only the selected visit changes; an active recurring plan using this visit is paused for review before renewal.',['review_token']]

];

module.exports={specs,register(action){for(const spec of specs)action(...spec);}};
