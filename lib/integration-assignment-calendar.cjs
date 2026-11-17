const S=require('./residential-server.cjs'),C=require('./integration-catalog.cjs');
function midnight(day){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day||'')||new Date(day+'T00:00:00Z').toISOString().slice(0,10)!==day)throw S.fail('Use YYYY-MM-DD dates.');
 const target=Date.parse(day+'T00:00:00Z');let value=target;
 for(let i=0;i<3;i++){const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(value).map(p=>[p.type,p.value]));const local=Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`);value+=target-local;}
 return new Date(value).toISOString();
}
async function read(db,input){
 const allowed=['start_date','end_date','calendar','after','contractor_id','property_id'];if(Object.keys(input).some(k=>!allowed.includes(k)))throw S.fail('Unsupported calendar input.');
 const start=midnight(input.start_date),end=midnight(input.end_date);
 if(end<=start||Date.parse(end)-Date.parse(start)>367*86400000)throw S.fail('Choose an exclusive end date after the start, within one year.');
 const scope=input.calendar||'both';if(!['both','commercial','residential'].includes(scope))throw S.fail('Choose both, commercial, or residential.');
 const offset=input.after===undefined?0:Number(input.after);if(!Number.isSafeInteger(offset)||offset<0||offset>100000)throw S.fail('Invalid calendar cursor.');
 let q=db.from('assignment_blocks').select('id,title,property_name,address,start_window,end_window,status,pay_amount,assigned_to,claimed_by,assigned_to_name,claimed_by_name,property_id,payment_status,paid_at,completed_at,updated_at,metadata').gte('start_window',start).lt('start_window',end).order('start_window').order('id');
 if(input.contractor_id){if(!/^[a-f0-9-]{36}$/i.test(input.contractor_id))throw S.fail('Use a contractor UUID.');q=q.or(`assigned_to.eq.${input.contractor_id},claimed_by.eq.${input.contractor_id}`);}
 if(input.property_id){if(!/^[a-f0-9-]{36}$/i.test(input.property_id))throw S.fail('Use a property UUID.');q=q.eq('property_id',input.property_id);}
 const rows=S.checked(await q.range(offset,offset+25));
 const {assignmentServiceScope}=await import('../assignment-service-scope.mjs');
 const data=rows.slice(0,25).map(({metadata,...r})=>({...r,calendar:assignmentServiceScope({metadata})})).filter(r=>scope==='both'||r.calendar===scope);
 return {data,next_cursor:rows.length>25?String(offset+25):null,timezone:'America/New_York',start_date:input.start_date,end_date_exclusive:input.end_date,calendar:scope,as_of:new Date().toISOString(),note:'Scheduled assignment records, all statuses including completed and cancelled. Dates filter scheduled start, not creation or completion. Follow next_cursor even when this filtered page is empty. Booking availability settings and unscheduled booking requests are separate.'};
}
module.exports={read,midnight};
