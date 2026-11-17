const S=require('./residential-server.cjs'),P=require('./integration-platform.cjs'),C=require('./integration-catalog.cjs');
const uuid=v=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v||'');
async function run(db,actor,action,input,key){
 let result;
 if(action==='update'){
  if(!C.resources[input.resource]?.write.length||!uuid(input.request_id)||!Array.isArray(input.records)||input.records.length<1||input.records.length>100)throw S.fail('Provide writable resource, unique request UUID and 1–100 updates.');
  for(const r of input.records){if(!uuid(r.id)||!r.expected_updated_at)throw S.fail('Read each record and provide current revision.');P.validate(input.resource,r.data,false);}
  result=await db.rpc('integration_admin_batch',{p_key:key,p_resource:input.resource,p_request:input.request_id,p_records:input.records});
 }else if(action==='series'){
  if(!Array.isArray(input.windows)||input.windows.length<1||input.windows.length>100)throw S.fail('Provide 1–100 date windows.');
  for(const w of input.windows){const valid=v=>typeof v==='string'&&/T.*(?:Z|[+-]\d\d:\d\d)$/.test(v)&&Number.isFinite(Date.parse(v));if(Object.keys(w).some(k=>!['start_window','end_window'].includes(k))||!valid(w.start_window)||!valid(w.end_window)||Date.parse(w.end_window)<=Date.parse(w.start_window))throw S.fail('Each window needs offset-aware ordered start/end timestamps.');}
  if(typeof input.pay_amount!=='number'||!Number.isFinite(input.pay_amount)||input.pay_amount<0)throw S.fail('Pay must be nonnegative dollars.');
  result=await db.rpc('integration_assignment_series',{p_actor:actor,p_input:input});
 }else throw S.fail('Unknown bulk operation.');
 if(result.error)throw S.fail(result.error.code==='P0001'?result.error.message:'Bulk change failed; no partial records saved.',409);return result.data;
}
module.exports={run};
