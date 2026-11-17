const crypto=require('node:crypto'),S=require('./residential-server.cjs'),I=require('./integrations.cjs'),C=require('./integration-catalog.cjs'),P=require('./integration-principal.cjs');
const uuid=v=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v||'');
const checked=r=>{if(r.error)throw S.fail(r.error.message?.includes('conflict')?'Record changed or idempotency key reused. Refresh before retrying.':'The requested operation could not be completed.',r.error.message?.includes('conflict')?409:400);return r.data;};
function validate(resource,data,create){const r=C.resources[resource];if(!r||!r.write.length||create&&r.create===false)throw S.fail('This resource must be changed through a documented action.',405);if(!data||typeof data!=='object'||Array.isArray(data)||!Object.keys(data).length)throw S.fail('Provide a data object.');for(const [k,v] of Object.entries(data)){if(!r.write.includes(k))throw S.fail('Unsupported field: '+k);require('./integration-value-validation.cjs').field(k,v);if(typeof v==='string'&&v.length>10000)throw S.fail('Field too long: '+k);if(k.endsWith('_id')&&v!==null&&!uuid(v))throw S.fail('Invalid ID: '+k);if(['do_not_contact','is_active','recurring_enabled'].includes(k)&&typeof v!=='boolean')throw S.fail('Expected boolean: '+k);if(['amount','quote_amount','customer_price','contractor_pay','square_feet','bedroom_count','bathroom_count','recurring_pay_amount','monthly_recurring_revenue','unit_count'].includes(k)&&v!==null&&(!Number.isFinite(v)||v<0))throw S.fail('Expected a nonnegative number: '+k);}if(create&&r.required.some(k=>data[k]===undefined||data[k]===null||data[k]===''))throw S.fail('Required: '+r.required.join(', '));return data;}
function requestKey(req){const key=String(req.headers['idempotency-key']||'');if(!/^[A-Za-z0-9_-]{8,100}$/.test(key))throw S.fail('A unique Idempotency-Key of 8–100 letters, numbers, underscores or hyphens is required.');return key;}
async function read(db,resource,q={}){const r=C.resources[resource];if(!r)throw S.fail('Unknown resource.',404);const limit=Math.min(100,Math.max(1,Math.floor(Number(q.limit)||25)));let query=db.from(r.table).select(r.fields.join(',')).order(r.pk).limit(limit+1);if(q.search!==undefined){const columns={client_contacts:['name','email'],managers:['full_name','email'],regions:['name'],checklist_templates:['name'],checklist_modules:['name'],qa_videos:['title','property_name'],inquiries:['name','email'],customer_referrals:['name','email'],contractors:['full_name'],assignments:['title','property_name','scope','address'],leads:['name','company_name','contact_email'],customers:['name','email'],clients:['company_name','name'],properties:['property_name'],portal_properties:['property_name','company_name','address'],contracts:['company_name','name'],applicants:['name','email'],agents:['name','email']}[resource];if(!columns||typeof q.search!=='string'||!q.search.trim()||q.search.length>160||/[\r\n]/.test(q.search))throw S.fail('Provide a supported name search of 1–160 characters.');const term=q.search.trim().replace(/[\\%_]/g,'\\$&');if(columns.length===1)query=query.ilike(columns[0],'%'+term+'%');else{const value=JSON.stringify('%'+term+'%');query=query.or(columns.map(c=>c+'.ilike.'+value).join(','));}}if(q.id){if(!uuid(q.id))throw S.fail('Invalid record ID.');query=query.eq(r.pk,q.id);}if(q.after){if(!uuid(q.after))throw S.fail('Invalid cursor.');query=query.gt(r.pk,q.after);}for(const [k,v] of Object.entries(r.filter||{}))query=query.eq(k,v);if(q.filters){const allowed=C.catalog().resources[resource].filter_fields;if(typeof q.filters!=='object'||Array.isArray(q.filters))throw S.fail('filters must be an object.');for(const [k,v] of Object.entries(q.filters)){if(!allowed.includes(k)||typeof v!=='string'||v.length>160)throw S.fail('Unsupported filter: '+k);query=query.eq(k,v);}}const data=checked(await query);return {data:data.slice(0,limit),next_cursor:data.length>limit?data[limit-1][r.pk]:null};}
const handlers={
 'quickbooks-status':()=>require('../api/quickbooks-status.js'),
 'quickbooks-invoice-statuses':()=>require('../api/quickbooks-invoice-statuses.js'),
 'quickbooks-sync-invoices':()=>require('../api/quickbooks-sync-invoices.js'),
 'quickbooks-sync-payment-statuses':()=>require('../api/quickbooks-sync-payment-statuses.js'),
 'agent-referrals':()=>require('../api/agent-referrals.js'),
 'admin-resident-feedback':()=>require('../api/admin-resident-feedback.js'),
 'resident-feedback':()=>require('../api/resident-feedback.js'),
 'admin-map':()=>require('../api/admin-map.js'),
 'city-demand':()=>require('../api/city-demand.js'),
 'admin-upsert-contractor-user':()=>require('../api/admin-upsert-contractor-user.js'),
 'admin-upsert-property-manager-user':()=>require('../api/admin-upsert-property-manager-user.js'),
 'admin-reset-contractor-password':()=>require('../api/admin-reset-contractor-password.js'),

 'crm-team':()=>require('../api/crm-team.js'),
 'finance-summary':()=>require('../api/finance-summary.js'),
 'finance-mark-invoice-sent':()=>require('../api/finance-mark-invoice-sent.js'),
 'crm-hourly-pay':()=>require('../api/crm-hourly-pay.js'),
 'crm-earnings':()=>require('../api/crm-earnings.js'),
 'crm-productivity':()=>require('../api/crm-productivity.js'),
 'crm-onboarding':()=>require('../api/crm-onboarding.js'),
 ambassadors:()=>require('../api/ambassadors.js'),
 'crm-sales':()=>require('../api/crm-sales.js'),
 'crm-overview':()=>require('../api/crm-overview.js'),
 'residential-booking':()=>require('../api/residential-booking.js'),
 applicants:()=>require('../api/applicants.js'),
 'gift-cards':()=>require('../api/gift-cards.js')
};
async function invoke(db,actor,a,input,key){if(a.endpoint==='integration-admin-batch')return require('./integration-admin-batch.cjs').run(db,actor,a.action,input,key);if(a.endpoint==='integration-qa-upload')return require('./integration-qa-upload.cjs').run(db,actor,key,a.action,input);if(a.endpoint==='integration-onboarding-templates')return require('./integration-onboarding-templates.cjs').run(db,actor,a.action,input,key);if(a.endpoint==='integration-admin-extended')return require('./integration-admin-extended.cjs').run(db,actor,a.action,input);if(a.endpoint==='admin-upsert-contractor-user'||a.endpoint==='admin-upsert-property-manager-user'){const prior=checked(await db.from('profiles').select('id').ilike('email',String(input.email||'').trim()).limit(1));if(prior.length)throw S.fail('An account already exists. Read and edit it; creation cannot reset an existing login.',409);} if(a.endpoint==='crm-productivity'&&['report','set_pay'].includes(a.action)){const from=Date.parse(input.from),to=Date.parse(input.to);if(!Number.isFinite(from)||!Number.isFinite(to)||to<=from||to-from>94*86400000)throw S.fail('Provide from/to ISO timestamps for a report range up to 93 days before changing a pay plan.');}if(a.endpoint==='integration-booking-admin')return require('./integration-booking-admin.cjs').run(db,actor,a.action,input);if(a.endpoint==='integration-admin-workflow')return require('./integration-admin-workflow.cjs').run(db,actor,a.action,input);if(a.endpoint==='integration-contractor-review')return require('./integration-contractor-review.cjs').run(db,actor,a.action,input,key);if(a.endpoint==='integration-guide')return require('./integration-guide.cjs').read(input);if(a.endpoint==='global-payouts')return require('./global-payouts.cjs').run(db,actor,{...input,action:a.action});if(a.endpoint==='integration-assignment-calendar')return require('./integration-assignment-calendar.cjs').read(db,input);if(a.endpoint==='integration-onboarding')return require('./integration-onboarding.cjs').run(db,actor,a.action,input,key);if(a.endpoint==='integration-coding')return require('./integration-coding.cjs').run(db,actor,a.action,input);if(a.endpoint==='integration-assignments')return require('./integration-assignments.cjs').run(db,actor,a.action,input);if(a.endpoint==='integration-background')return require('./integration-background.cjs').run(db,key,a.action,input);if(a.endpoint==='integration-documents')return require('./integration-documents.cjs').run(db,actor,key,a.action,input);if(a.endpoint==='contractor-crm')return require('./contractor-crm.cjs').run(db,actor,{...input,action:a.action});const req={method:['finance-summary','quickbooks-status','quickbooks-invoice-statuses'].includes(a.endpoint)?'GET':'POST',url:'/api/'+a.endpoint+'?'+new URLSearchParams(Object.entries(input).filter(([,v])=>typeof v==='string')),headers:{'content-type':'application/json',origin:'https://portal.turnlypros.com'},query:{...input},body:{...input,action:a.action}};P.bind(req,actor);let status=200,result;const res={setHeader(){},status(v){status=v;return this;},json(data){result=data;return this;},get statusCode(){return status;},set statusCode(v){status=v;},end(raw){result=JSON.parse(raw);}};await handlers[a.endpoint]()(req,res);if(status>=400)throw S.fail(result?.error||'Action failed.',status);return result;}
async function countRecords(db,resource,filters={}){
 const r=C.resources[resource];if(!r)throw S.fail('Unknown resource.',404);
 if(!filters||typeof filters!=='object'||Array.isArray(filters))throw S.fail('filters must be an object.');
 const allowed=C.catalog().resources[resource].filter_fields;
 let query=db.from(r.table).select(r.pk,{count:'exact',head:true});
 for(const [k,v] of Object.entries(r.filter||{}))query=query.eq(k,v);
 for(const [k,v] of Object.entries(filters)){if(!allowed.includes(k)||typeof v!=='string'||v.length>160)throw S.fail('Unsupported filter: '+k);query=query.eq(k,v);}
 const result=await query;checked(result);
 if(!Number.isSafeInteger(result.count)||result.count<0)throw S.fail('Exact count unavailable. Retry later.',503);
 return {resource,total:result.count,filters,definition:resource==='contractors'?'Contractor-role profiles; excludes admin-only and brand-ambassador-only profiles.':undefined,as_of:new Date().toISOString()};
}
async function execute(db,req){
 const q=req.query||{},body=req.body||{},action=q.action||body.operation,resource=q.resource||body.resource||'catalog';
 const a=action&&C.actions[action],r=C.resources[resource],write=req.method!=='GET';
 if(action&&!a)throw S.fail('Unknown action.',404);if(!action&&resource!=='catalog'&&!r)throw S.fail('Unknown resource.',404);
 const scope=a?a.scope:resource==='catalog'?'catalog:read':resource==='leads'&&req.method==='POST'?'leads:create':resource+':'+(write?'write':'read');
 const key=await I.apiKey(db,req,scope),owner=checked(await db.from('integration_keys').select('created_by,scopes,deny_record_deletion').eq('id',key).single());
 const request_id=crypto.randomUUID(),started=Date.now(),operation=action||resource+'.'+req.method.toLowerCase();
 checked(await db.from('integration_audit').insert({id:request_id,key_id:key,operation,status:'started'}));
 let result;
 try{
  require('./integration-policy.cjs').enforce(action||resource+'.'+req.method.toLowerCase(),owner);require('./integration-policy.cjs').enforceData(body.data||body.input,owner);
  if(resource==='catalog'&&!action){if(write)throw S.fail('Use GET for the catalog.',405);result={...require('./integration-policy.cjs').catalog(C.catalog(),owner),granted_scopes:owner.scopes};}
  else if(action){
   if(req.method!=='POST')throw S.fail('Actions use POST.',405);const input=body.input||{};if(!input||typeof input!=='object'||Array.isArray(input))throw S.fail('input must be an object.');if(a.required.some(k=>!Object.hasOwn(input,k)))throw S.fail('Required fields: '+a.required.join(', '));
   if(a.write&&body.confirm!==true)throw S.fail('Set confirm=true after reviewing this action.');
   if(!a.write)result=await invoke(db,owner.created_by,a,input,key);
   else {const idem=requestKey(req),fingerprint=I.hash(JSON.stringify({action,input}));const claim=checked(await db.rpc('integration_action_claim',{p_key:key,p_request:idem,p_hash:fingerprint,p_operation:action}));
    if(claim.replayed)result=claim.response;
    else try{result=await invoke(db,owner.created_by,a,input,key);checked(await db.from('integration_operations').update({state:'completed',response:result}).eq('key_id',key).eq('request_key',idem));}catch(e){await db.from('integration_operations').update({state:'uncertain'}).eq('key_id',key).eq('request_key',idem);throw e;}
   }
  }else if(req.method==='GET'){const filters=typeof q.filters==='string'?JSON.parse(q.filters):q.filters;result=q.count_only===true||q.count_only==='true'?await countRecords(db,resource,filters):await read(db,resource,{...q,filters});}
  else if(resource==='leads'&&req.method==='POST'){const data=I.leadInput(body.data);result=checked(await db.rpc('integration_create_lead',{p_key:key,p_request:requestKey(req),p_hash:I.hash(JSON.stringify(data)),p_data:data}));}
  else if(['POST','PATCH'].includes(req.method)){
   const create=req.method==='POST';validate(resource,body.data,create);if(!create&&!uuid(body.id))throw S.fail('A record ID is required.');if(!create&&r.fields.includes('updated_at')&&!body.expected_updated_at)throw S.fail('Send expected_updated_at from the record you read.');
   result=checked(await db.rpc('integration_mutate',{p_key:key,p_request:requestKey(req),p_resource:resource,p_id:create?null:body.id,p_data:body.data,p_expected:body.expected_updated_at||null}));
  }else throw S.fail('Method not supported.',405);
  checked(await db.from('integration_audit').update({status:'succeeded',http_status:200,duration_ms:Date.now()-started}).eq('id',request_id));
  return {...result,request_id};
 }catch(e){await db.from('integration_audit').update({status:'failed',http_status:e.status||503,duration_ms:Date.now()-started}).eq('id',request_id);e.request_id=request_id;throw e;}
}
module.exports={execute,read,countRecords,validate,invoke,requestKey};
