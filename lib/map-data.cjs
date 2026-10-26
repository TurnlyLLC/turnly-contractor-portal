const {createHash}=require('node:crypto');
const S=require('./residential-server.cjs');
const stateNames=require('../assets/maps/state-codes.json');
function stateCode(s){s=String(s||'').trim();return s.length===2?s.toUpperCase():Object.entries(stateNames).find(([,v])=>v.toLowerCase()===s.toLowerCase())?.[0]||'';}
function key(address){return createHash('sha256').update(String(address||'').trim().replace(/\s+/g,' ').toUpperCase()).digest('hex');}
function leadStatus(r){if(r.do_not_contact)return 'do_not_contact';const s=r.pipeline_stage||'new_leads';return ({new_leads:'new',active:'purchased',lost:'not_interested',quote_sent:'interested',walkthrough:'follow_up',contract_out:'follow_up'})[s]||s;}
function bookingStatus(r,job){if(r.status==='completed'||job?.status==='completed')return 'completed';if(r.status==='cancelled'||r.assignment_deleted_at)return 'cancelled';if(job?.status==='pending'||['awaiting_card','review_required','needs_reschedule'].includes(r.status))return 'pending';if(r.status==='requested')return 'requested';return 'scheduled';}
async function all(db,table,columns,filter=q=>q){const rows=[];for(let page=0;;page++){const data=S.checked(await filter(db.from(table).select(columns)).order('id').range(page*1000,page*1000+999));rows.push(...data);if(data.length<1000)return rows;}}
async function records(db,dataset){
 if(dataset==='sales')return (await all(db,'sales_leads','id,name,contact_name,company_name,address,sales_city,sales_state,pipeline_stage,sales_owner_id,sales_owner_name,do_not_contact,last_activity_at,created_at',q=>q.eq('business_segment','residential').eq('prospect_type','realtor'))).map(r=>({id:r.id,kind:'lead',name:r.contact_name||r.name||r.company_name||'Realtor',address:r.address||'',city:r.sales_city||'',state:stateCode(r.sales_state),status:leadStatus(r),owner:r.sales_owner_name||'Unassigned',owner_id:r.sales_owner_id,date:r.created_at,last_activity:r.last_activity_at,url:'sales-leads.html#'+r.id}));
 const [bookings,requests,jobs]=await Promise.all([all(db,'referral_bookings','id,name,property_address,city,state,zip,status,service,service_date,created_at,assignment_deleted_at'),all(db,'out_of_area_requests','id,name,property_address,city,state,zip,status,service,preferred_date,created_at'),all(db,'assignment_blocks','id,status,title,property_name,address,service_type,start_window,created_at,metadata,site_latitude,site_longitude')]);
 const byId=new Map(jobs.map(r=>[r.id,r])),bookingIds=new Set(bookings.map(r=>r.id));
 const otherJobs=jobs.filter(r=>!bookingIds.has(r.id)&&!r.metadata?.residential_booking_id).map(r=>{const parts=String(r.address||'').split(',').map(v=>v.trim()),state=r.address?.match(/\b([A-Z]{2})\s+\d{5}(?:-\d{4})?\b/)?.[1]||stateCode(parts.at(-1));return {id:r.id,kind:'assignment',name:r.property_name||r.title||'Cleaning assignment',address:r.address||'',city:parts.length>2?parts.at(-2):'',state:stateCode(state),category:'commercial',status:r.status==='completed'?'completed':['cancelled','canceled','declined'].includes(r.status)?'cancelled':r.status==='pending'?'pending':'scheduled',service:r.service_type,date:r.start_window||r.created_at,url:'assignments.html?assignment='+r.id,latitude:r.site_latitude,longitude:r.site_longitude};});
 return [...bookings.map(r=>({...r,kind:'booking',status:bookingStatus(r,byId.get(r.id)),date:r.service_date||r.created_at,url:'admin-residential.html?booking='+r.id})),...requests.map(r=>({...r,kind:'request',date:r.preferred_date||r.created_at,url:'admin-demand-map.html?request='+r.id}))].map(r=>({id:r.id,kind:r.kind,name:r.name,address:[r.property_address,r.city,r.state,r.zip].filter(Boolean).join(', '),city:r.city,state:stateCode(r.state),status:r.status,category:'residential',service:r.service,date:r.date,url:r.url})).concat(otherJobs);
}
async function attach(db,rows){const cache=new Map();const keys=[...new Set(rows.map(r=>key(r.address)))];for(let i=0;i<keys.length;i+=200){for(const g of S.checked(await db.from('map_geocodes').select('*').in('address_key',keys.slice(i,i+200))))cache.set(g.address_key,g);}
 return rows.map(r=>{const g=cache.get(key(r.address));return {...r,latitude:g?.latitude??r.latitude??null,longitude:g?.longitude??r.longitude??null,location_status:Number.isFinite(r.latitude)&&Number.isFinite(r.longitude)?'matched':!r.address?'missing_address':g?.result||'not_located',location_source:g?.provider||(Number.isFinite(r.latitude)?'Assignment site location':''),matched_address:g?.matched_address||''};});
}
async function locate(address,fetcher=fetch){
 if(!/^\d/.test(address)||/TEST ONLY/i.test(address))return {result:'not_found',latitude:null,longitude:null};
 const url='https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?'+new URLSearchParams({address,benchmark:'Public_AR_Current',format:'json'});
 const response=await fetcher(url,{signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('Address lookup is temporarily unavailable.');
 const data=await response.json(),matches=data.result?.addressMatches;
 if(!Array.isArray(matches))throw Error('Address lookup returned an invalid response.');
 if(matches.length!==1)return {result:'not_found',latitude:null,longitude:null};
 const m=matches[0],lat=m.coordinates?.y,lon=m.coordinates?.x;
 if(!Number.isFinite(lat)||!Number.isFinite(lon)||lat<18||lat>72||lon< -180||lon> -60)return {result:'not_found',latitude:null,longitude:null};
 return {result:'matched',latitude:lat,longitude:lon,matched_address:m.matchedAddress,provider:'US Census · address-range estimate'};
}
async function geocode(db,rows){let matched=0,failed=0;const unique=[...new Map(rows.map(r=>[key(r.address),r])).entries()];
 for(let i=0;i<unique.length;i+=4)await Promise.all(unique.slice(i,i+4).map(async([address_key,r])=>{try{const g=await locate(r.address);S.checked(await db.from('map_geocodes').upsert({address_key,...g,checked_at:new Date().toISOString()}));if(g.result==='matched')matched++;}catch{failed++;}}));
 return {processed:unique.length,matched,failed};
}
async function rememberAddress(db,data,coverage,lookup=locate){
 // Mapping must never prevent a valid booking/request from being saved.
 try{
  const address=[data.property_address,data.city,data.state,data.zip].filter(Boolean).join(', ');
  const g=Number.isFinite(coverage.latitude)&&Number.isFinite(coverage.longitude)?{latitude:coverage.latitude,longitude:coverage.longitude,result:'matched',matched_address:coverage.matched_address,provider:'NC OneMap'}:await lookup(address);
  S.checked(await db.from('map_geocodes').upsert({address_key:key(address),...g,checked_at:new Date().toISOString()}));
 }catch{}
}
module.exports={stateCode,key,leadStatus,bookingStatus,all,records,attach,locate,geocode,rememberAddress};
