const S=require('./residential-server.cjs'),{uuid}=require('./agent-referrals.cjs'),Price=require('./residential-pricing.cjs');

const Review=require('./integration-review-plans.cjs');
const fields=['property_address','city','state','zip','beds','baths','sqft','service','frequency','visit_details','notes'];

function merge(b,data){

 if(!data||Array.isArray(data)||!Object.keys(data).length||Object.keys(data).some(k=>!fields.includes(k)))throw S.fail('Use documented booking fields only.');

 if(data.visit_details!==undefined&&(!data.visit_details||typeof data.visit_details!=='object'||Array.isArray(data.visit_details)||JSON.stringify(data.visit_details).length>2500))throw S.fail('Provide valid visit details.');

 const m={...b,...data,visit_details:{...b.visit_details,...data.visit_details}};

 for(const k of ['property_address','city','state','zip'])if(typeof m[k]!=='string'||!m[k].trim()||m[k].length>300)throw S.fail('Provide complete address details.');

 if(!Number.isInteger(m.beds)||m.beds<0||m.beds>30||typeof m.baths!=='number'||m.baths<.5||m.baths>30||m.baths*2%1)throw S.fail('Enter valid room counts.');

 if(m.notes!==null&&m.notes!==undefined&&(typeof m.notes!=='string'||m.notes.length>1800))throw S.fail('Notes up to1800 characters.');

 m.visit_details=require('./residential-visit.cjs').visitDetails(m.visit_details);m.quote=(b.recurring_plan_id||b.quote?.one_time_cents!==undefined)?require('./customer-repeat-booking.cjs').price(m,{service:m.service,frequency:m.frequency,sqft:m.sqft,pets:m.visit_details.pets}):Price.quote({...m,...m.visit_details});m.amount_cents=m.quote.amount_cents;

 return m;

}

function editable(s){const b=s.booking,j=s.assignment;if(!b||b.assignment_deleted_at||!['requested','review_required','awaiting_card','scheduled','needs_reschedule'].includes(b.status)||!['not_collected','card_saved','action_required'].includes(b.payment_status)||b.stripe_payment_intent||b.charge_started_at||b.charge_locked_at||b.paid_at||b.charge_at&&Date.parse(b.charge_at)<=Date.now()||j&&(j.started_at||j.completed_at||j.paid_at||j.paid_out||!['pending','open','preferred_pending','claimed','scheduled'].includes(j.status)))throw S.fail('Booking payment/work has started or the booking is no longer editable. Reconcile it before repricing.',409);}

async function snapshot(db,actor,id){const r=await db.rpc('integration_booking_snapshot',{p_actor:actor,p_id:id});if(r.error)throw S.fail('Booking snapshot unavailable.',409);return r.data;}

async function run(db,actor,action,input,key){

 if(action==='preview'){

  if(!uuid(input.id)||typeof input.reason!=='string'||input.reason.trim().length<5||input.reason.length>1000)throw S.fail('Choose booking and a specific reason.');

  const s=await snapshot(db,actor,input.id);editable(s);const b=s.booking,m=merge(b,input.data);

  let coverage=null;if(['property_address','city','state','zip'].some(k=>m[k]!==b[k]))coverage=await require('./service-coverage.cjs').requireCoverage(m);

  const gift=s.gift;if(gift&&gift.status!=='reserved'||gift&&s.card?.status!=='active')throw S.fail('Gift reservation needs reconciliation first.',409);

  const applied=gift?Math.min(m.amount_cents,s.card.balance_cents-s.card.reserved_cents+gift.amount_cents):0;

  const override=s.assignment?.metadata?.contractor_pay_override===true;const pay=override?s.assignment.pay_amount:Math.round(m.amount_cents*.36)/100;

  const review={id:b.id,data:input.data,reason:input.reason,revision:s.revision,assignment_revision:s.assignment?.updated_at||null,gift_revision:s.gift_revision,plan_revision:s.plan_revision,amount_cents:m.amount_cents,gift_applied_cents:applied,contractor_pay:pay,coverage};

  return {id:b.id,old_total_cents:b.amount_cents,new_total_cents:m.amount_cents,gift_applied_cents:applied,card_charge_cents:m.amount_cents-applied,contractor_pay:pay,contractor_pay_override_preserved:override,quote:m.quote,address:[m.property_address,m.city,m.state,m.zip].join(', '),effects:[s.plan?.latest_booking_id===b.id&&s.plan.status==='active'?'Updates this visit and pauses recurring renewal for review before another visit is generated.':'Only the selected visit changes; existing other visits stay unchanged.','Releases assigned contractor and returns existing assignment/checklist to pending admin review.','Updates the scheduled charge amount; no charge or customer email is sent now.','Original customer acceptance remains in history; this is an owner-directed amendment.'],review_token:await Review.save(db,actor,'booking-reprice',review,{id:b.id,old_total_cents:b.amount_cents,new_total_cents:m.amount_cents,contractor_pay:pay,reason:input.reason})};

 }

 if(action!=='apply')throw S.fail('Unsupported booking change.');const p=await Review.load(db,actor,input.review_token,'booking-reprice');if(p.state==='applied')return p.result;const r=p.data,s=await snapshot(db,actor,r.id);editable(s);

 if(s.revision!==r.revision||s.assignment?.updated_at!==undefined&&s.assignment.updated_at!==r.assignment_revision||s.gift_revision!==r.gift_revision||s.plan_revision!==r.plan_revision)throw S.fail('Booking changed. Preview again.',409);

 const m=merge(s.booking,r.data);if(m.amount_cents!==r.amount_cents)throw S.fail('Pricing changed. Preview again.',409);

 const job=require('./residential-jobs.cjs').assignmentFor(m);

 const R=await import('../residential-assignment.mjs');const templates=S.checked(await db.from('checklist_templates').select('*').eq('scope_type','residential').eq('residential_service',R.residentialChecklistService(m.service)).eq('residential_beds',m.beds).eq('residential_baths',m.baths));const template=R.matchingResidentialChecklist(templates,m.beds,m.baths,m.service);job.property_checklist_items=R.residentialChecklistItems(template);Object.assign(job.metadata,{checklist_review_required:true,checklist_review_reason:'Review amended service before releasing assignment.',...(template?{checklist_template_id:template.id,checklist_template_name:template.name,checklist_item_count:job.property_checklist_items.length}:{})});

 const res=await db.rpc('integration_booking_amend',{p_actor:actor,p_id:r.id,p_review:r,p_booking:Object.fromEntries([...fields,'quote','amount_cents'].map(k=>[k,m[k]??null])),p_assignment:{address:job.address,service_type:job.service_type,scope:job.scope,special_instructions:job.special_instructions,metadata:job.metadata,property_checklist_items:job.property_checklist_items}});

 if(res.error)throw S.fail(res.error.code==='P0001'?res.error.message:'Booking amendment could not be saved. Read current state.',409);await Review.finish(db,p.id,res.data);return res.data;

}

module.exports={run,merge,editable,fields};
