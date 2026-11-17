const S=require('./residential-server.cjs');
const uuid=v=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v||'');
const arrays=new Set(['tags','service_types','allowed_regions','allowed_property_names','account_manager_names','service_needs','sales_pain_points']);
const ids=new Set(['allowed_property_ids','account_manager_ids']);
const jsonTypes={sections:'array',section:'object',materials_list:'array',checklist_items:'array',checklist_module_counts:'object',projected_monthly_turnovers:'object',metadata:'object'};
function field(k,v){
 if(v===null)return;
 if(arrays.has(k)){if(!Array.isArray(v)||v.length>200||v.some(x=>typeof x!=='string'||x.length>500))throw S.fail('Expected a string list: '+k);return;}
 if(ids.has(k)){if(!Array.isArray(v)||v.length>500||v.some(x=>!uuid(x)))throw S.fail('Expected a UUID list: '+k);return;}
 if(jsonTypes[k]){if((jsonTypes[k]==='array'?!Array.isArray(v):!v||typeof v!=='object'||Array.isArray(v))||JSON.stringify(v).length>150000)throw S.fail('Invalid structured field: '+k);return;}
 if(typeof v==='object')throw S.fail('Invalid field: '+k);
 if(/(?:^|_)(revenue|value|amount|count|feet)$/.test(k)||['sort_order','opportunity_score','residential_beds','residential_baths'].includes(k)){if(typeof v!=='number'||!Number.isFinite(v)||v<0)throw S.fail('Expected a nonnegative number: '+k);}
}
module.exports={field,arrays,ids,jsonTypes};
