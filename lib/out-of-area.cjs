const S=require('./residential-server.cjs'),M=require('./map-data.cjs');
async function save(db,input,data,coverage,remember=M.rememberAddress){
 if(coverage.approved)throw S.fail('This address is in the service area. Continue normal booking.');
 if(input.out_of_range_consent!==true)throw S.fail('Confirm this is an out-of-range request, not a confirmed booking.');
 const record={id:input.id,token_hash:S.hash(input.token),name:data.name,email:data.email,phone:data.phone,property_address:data.property_address,city:data.city,state:data.state,zip:data.zip,beds:data.beds,baths:data.baths,sqft:data.sqft,service:data.service,frequency:data.frequency,preferred_date:data.service_date,notes:[data.notes,data.visit_details?.scope_acceptance?`Scope accepted: ${data.visit_details.scope_acceptance.statement} Policy ${data.visit_details.scope_acceptance.version}.`:null].filter(Boolean).join('\n\n'),referral_code:String(input.code||'').slice(0,64),ambassador_code:String(input.ba||'').slice(0,64)};
 record.request_hash=S.hash(JSON.stringify({...record,token_hash:undefined}));
 S.checked(await db.from('out_of_area_requests').upsert(record,{onConflict:'id',ignoreDuplicates:true}));
 const saved=S.checked(await db.from('out_of_area_requests').select('id,token_hash,request_hash').eq('id',input.id).single());
 if(saved.token_hash!==record.token_hash||saved.request_hash!==record.request_hash)throw S.fail('Request changed. Please start a new request.',409);
 await remember(db,data,coverage);
 return {out_of_range:true,request:{id:saved.id,status:'out_of_range'}};
}
module.exports={save};
