const crypto=require('node:crypto'),S=require('./residential-server.cjs'),I=require('./integrations.cjs'),C=require('./integration-catalog.cjs'),P=require('./integration-principal.cjs');
const uuid=v=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v||'');
const checked=r=>{if(r.error)throw S.fail(r.error.message?.includes('conflict')?'Record changed or idempotency key reused. Refresh before retrying.':'The requested operation could not be completed.',r.error.message?.includes('conflict')?409:400);return r.data;};
function validate(resource,data,create){const r=C.resources[resource];if(!r||!r.write.length||create&&r.create===false)throw S.fail('This resource must be changed through a documented action.',405);if(!data||typeof data!=='object'||Array.isArray(data)||!Object.keys(data).length)throw S.fail('Provide a data object.');for(const [k,v] of Object.entries(data)){if(!r.write.includes(k))throw S.fail('Unsupported field: '+k);if(v!==null&&typeof v==='object'&&!(k==='tags'&&Array.isArray(v)&&v.every(t=>typeof t==='string'&&t.length<=100)))throw S.fail('Invalid field: '+k);if(typeof v==='string'&&v.length>10000)throw S.fail('Field too long: '+k);if(k.endsWith('_id')&&v!==null&&!uuid(v))throw S.fail('Invalid ID: '+k);if(['do_not_contact','is_active'].includes(k)&&typeof v!=='boolean')throw S.fail('Expected boolean: '+k);if(['amount','quote_amount','customer_price','contractor_pay','square_feet','bedroom_count','bathroom_count'].includes(k)&&v!==null&&(!Number.isFinite(v)||v<0))throw S.fail('Expected a nonnegative number: '+k);}if(create&&r.required.some(k=>data[k]===undefined||data[k]===null||data[k]===''))throw S.fail('Required: '+r.required.join(', '));return data;}
function requestKey(req){const key=String(req.headers['idempotency-key']||'');if(!/^[A-Za-z0-9_-]{8,100}$/.test(key))throw S.fail('A unique Idempotency-Key of 8–100 letters, numbers, underscores or hyphens is required.');return key;}
async function read(db,resource,q={}){const r=C.resources[resource];if(!r)throw S.fail('Unknown resource.',404);const limit=Math.min(100,Math.max(1,Math.floor(Number(q.limit)||25)));let query=db.from(r.table).select(r.fields.join(',')).order(r.pk).limit(limit+1);if(q.id){if(!uuid(q.id))throw S.fail('Invalid record ID.');query=query.eq(r.pk,q.id);}if(q.after){if(!uuid(q.after))throw S.fail('Invalid cursor.');query=query.gt(r.pk,q.after);}for(const [k,v] of Object.entries(r.filter||{}))query=query.eq(k,v);if(q.filters){const allowed=C.catalog().resources[resource].filter_fields;if(typeof q.filters!=='object'||Array.isArray(q.filters))throw S.fail('filters must be an object.');for(const [k,v] of Object.entries(q.filters)){if(!allowed.includes(k)||typeof v!=='string'||v.length>160)throw S.fail('Unsupported filter: '+k);query=query.eq(k,v);}}const data=checked(await query);return {data:data.slice(0,limit),next_cursor:data.length>limit?data[limit-1][r.pk]:null};}
const handlers={
 ambassadors:()=>require('../api/ambassadors.js'),
 'crm-sales':()=>require('../api/crm-sales.js'),
 'crm-overview':()=>require('../api/crm-overview.js'),
 'residential-booking':()=>require('../api/residential-booking.js'),
 applicants:()=>require('../api/applicants.js'),
 'gift-cards':()=>require('../api/gift-cards.js')
};
async function invoke(db,actor,a,input,key){if(a.endpoint==='integration-background')return require('./integration-background.cjs').run(db,key,a.action,input);if(a.endpoint==='integration-documents')return require('./integration-documents.cjs').run(db,actor,key,a.action,input);if(a.endpoint==='contractor-crm')return require('./contractor-crm.cjs').run(db,actor,{...input,action:a.action});const req={method:'POST',headers:{},body:{...input,action:a.action}};P.bind(req,actor);let status=200,result;const res={setHeader(){},get statusCode(){return status;},set statusCode(v){status=v;},end(raw){result=JSON.parse(raw);}};await handlers[a.endpoint]()(req,res);if(status>=400)throw S.fail(result?.error||'Action failed.',status);return result;}
async function execute(db,req){
 const q=req.query||{},body=req.body||{},action=q.action||body.operation,resource=q.resource||body.resource||'catalog';
 const a=action&&C.actions[action],r=C.resources[resource],write=req.method!=='GET';
 if(action&&!a)throw S.fail('Unknown action.',404);if(!action&&resource!=='catalog'&&!r)throw S.fail('Unknown resource.',404);
 const scope=a?a.scope:resource==='catalog'?'catalog:read':resource==='leads'&&req.method==='POST'?'leads:create':resource+':'+(write?'write':'read');
 const key=await I.apiKey(db,req,scope),owner=checked(await db.from('integration_keys').select('created_by,scopes').eq('id',key).single());
 const request_id=crypto.randomUUID(),started=Date.now(),operation=action||resource+'.'+req.method.toLowerCase();
 checked(await db.from('integration_audit').insert({id:request_id,key_id:key,operation,status:'started'}));
 let result;
 try{
  if(resource==='catalog'&&!action){if(write)throw S.fail('Use GET for the catalog.',405);result={...C.catalog(),granted_scopes:owner.scopes};}
  else if(action){
   if(req.method!=='POST')throw S.fail('Actions use POST.',405);const input=body.input||{};if(!input||typeof input!=='object'||Array.isArray(input))throw S.fail('input must be an object.');if(a.required.some(k=>!Object.hasOwn(input,k)))throw S.fail('Required fields: '+a.required.join(', '));
   if(a.write&&body.confirm!==true)throw S.fail('Set confirm=true after reviewing this action.');
   if(!a.write)result=await invoke(db,owner.created_by,a,input,key);
   else {const idem=requestKey(req),fingerprint=I.hash(JSON.stringify({action,input}));const claim=checked(await db.rpc('integration_action_claim',{p_key:key,p_request:idem,p_hash:fingerprint,p_operation:action}));
    if(claim.replayed)result=claim.response;
    else try{result=await invoke(db,owner.created_by,a,input,key);checked(await db.from('integration_operations').update({state:'completed',response:result}).eq('key_id',key).eq('request_key',idem));}catch(e){await db.from('integration_operations').update({state:'uncertain'}).eq('key_id',key).eq('request_key',idem);throw e;}
   }
  }else if(req.method==='GET')result=await read(db,resource,{...q,filters:typeof q.filters==='string'?JSON.parse(q.filters):q.filters});
  else if(resource==='leads'&&req.method==='POST'){const data=I.leadInput(body.data);result=checked(await db.rpc('integration_create_lead',{p_key:key,p_request:requestKey(req),p_hash:I.hash(JSON.stringify(data)),p_data:data}));}
  else if(['POST','PATCH'].includes(req.method)){
   const create=req.method==='POST';validate(resource,body.data,create);if(!create&&!uuid(body.id))throw S.fail('A record ID is required.');if(!create&&r.fields.includes('updated_at')&&!body.expected_updated_at)throw S.fail('Send expected_updated_at from the record you read.');
   result=checked(await db.rpc('integration_mutate',{p_key:key,p_request:requestKey(req),p_resource:resource,p_id:create?null:body.id,p_data:body.data,p_expected:body.expected_updated_at||null}));
  }else throw S.fail('Method not supported.',405);
  checked(await db.from('integration_audit').update({status:'succeeded',http_status:200,duration_ms:Date.now()-started}).eq('id',request_id));
  return {...result,request_id};
 }catch(e){await db.from('integration_audit').update({status:'failed',http_status:e.status||503,duration_ms:Date.now()-started}).eq('id',request_id);e.request_id=request_id;throw e;}
}
module.exports={execute,read,validate,invoke,requestKey};
