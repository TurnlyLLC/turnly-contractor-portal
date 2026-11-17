const S=require('./residential-server.cjs'),C=require('./integration-catalog.cjs');
const uuid=v=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v||'');
const configFields=['priority','property_name','unit_number','unit_name','qr_tracker_id','property_id','unit_id','preferred_first','preferred_contractor_ids','preferred_until','recurrence_frequency','recurrence_interval','recurrence_end_date','auto_renewal','property_checklist_items','materials_list','materials_template_id'];
function validate(action,input){
 if(action==='manual_assignment'){
  const valid=v=>typeof v==='string'&&/T.*(?:Z|[+-]\d\d:\d\d)$/.test(v)&&Number.isFinite(Date.parse(v));
  if(!['commercial','residential'].includes(input.calendar)||!valid(input.start_window)||!valid(input.end_window)||Date.parse(input.end_window)<=Date.parse(input.start_window)||typeof input.pay_amount!=='number'||!Number.isFinite(input.pay_amount)||input.pay_amount<0)throw S.fail('Choose calendar, offset-aware start/end and dollar pay.');
  for(const k of ['title','property_name','address','scope','reason'])if(typeof input[k]!=='string'||!input[k].trim()||input[k].length>10000)throw S.fail('Provide '+k);
  if(input.calendar==='residential'&&(typeof input.customer_price!=='number'||!Number.isFinite(input.customer_price)||input.customer_price<=0))throw S.fail('Residential manual jobs require customer_price in dollars for the 36% pay policy.');
  if(input.property_id!==undefined&&input.property_id!==null&&!uuid(input.property_id))throw S.fail('Use a property UUID.');
 }else if(action==='sales_workflow'){
  if(!['walkthroughs','quotes','sales_contracts','tasks'].includes(input.kind)||!uuid(input.lead_id)||!input.expected_lead_updated_at)throw S.fail('Read the lead and choose a supported workflow.');
  if(input.id!==null&&(!uuid(input.id)||!input.expected_updated_at))throw S.fail('Read the existing workflow record first.');
  require('./integration-platform.cjs').validate(input.kind,{...input.data,lead_id:input.lead_id},!input.id);
 }else if(action==='assignment_configure'){
  if(!uuid(input.id)||!input.expected_updated_at||typeof input.reason!=='string'||input.reason.trim().length<5)throw S.fail('Read assignment and provide current revision and reason.');
  const d=input.data;if(!d||Array.isArray(d)||!Object.keys(d).length||Object.keys(d).some(k=>!configFields.includes(k)))throw S.fail('Use documented assignment configuration fields. Pay/status/schedule require their dedicated actions.');
  for(const [k,v]of Object.entries(d)){
   if(['property_name','unit_number','unit_name','qr_tracker_id'].includes(k)&&v!==null&&(typeof v!=='string'||v.length>200))throw S.fail('Invalid text field: '+k);
   if(['property_id','unit_id','materials_template_id'].includes(k)&&v!==null&&!uuid(v))throw S.fail('Invalid '+k);
   if(['preferred_first','auto_renewal'].includes(k)&&typeof v!=='boolean')throw S.fail('Expected boolean: '+k);
   if(k==='preferred_contractor_ids'&&(!Array.isArray(v)||v.length>100||v.some(x=>!uuid(x))))throw S.fail('Invalid preferred contractors.');
   if(['property_checklist_items','materials_list'].includes(k)&&(!Array.isArray(v)||JSON.stringify(v).length>150000))throw S.fail('Invalid checklist/materials.');
   if(k==='priority'&&!['low','normal','high','urgent'].includes(v))throw S.fail('Choose low, normal, high, urgent.');
   if(k==='recurrence_interval'&&(!Number.isInteger(v)||v<1||v>365))throw S.fail('Invalid recurrence interval.');
   if(k==='recurrence_frequency'&&!['one_time','daily','weekly','biweekly','monthly','quarterly','yearly','custom'].includes(v))throw S.fail('Unsupported recurrence frequency.');
   if(['recurrence_end_date','preferred_until'].includes(k)&&v!==null&&!Number.isFinite(Date.parse(v)))throw S.fail('Invalid date.');
  }
 }else if(action!=='video_link')throw S.fail('Unsupported extended workflow.');
}
async function run(db,actor,action,input){
 validate(action,input);
 if(action==='video_link'){
  if(!uuid(input.id))throw S.fail('Choose a QA video.');
  const row=S.checked(await db.from('qa_videos').select('storage_bucket,storage_path').eq('id',input.id).single());
  if(!row?.storage_path)throw S.fail('Video file unavailable.',404);
  const link=S.checked(await db.storage.from(row.storage_bucket||'qa-videos').createSignedUrl(row.storage_path,300));return {url:link.signedUrl,expires_in:300};
 }
 if(action==='manual_assignment'){const r=await db.rpc('integration_manual_assignment',{p_actor:actor,p_input:input});if(r.error)throw S.fail(r.error.code==='P0001'?r.error.message:'Manual assignment failed.',409);return r.data;}
 const r=await db.rpc('integration_admin_extended',{p_actor:actor,p_operation:action,p_input:input});
 if(r.error)throw S.fail(r.error.code==='P0001'?r.error.message:'Change failed. Read current state before retrying.',409);
 return r.data;
}
module.exports={run,validate,configFields};
