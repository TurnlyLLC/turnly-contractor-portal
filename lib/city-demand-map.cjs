const M=require('./map-data.cjs');
function address(zip,state){return `ZIP ${zip} ${state}`;}
async function locateZip(zip,state,fetcher=fetch){
 if(!/^\d{5}$/.test(zip)||!/^[A-Z]{2}$/.test(state))throw Error('Invalid ZIP location.');
 const r=await fetcher('https://api.zippopotam.us/us/'+zip,{signal:AbortSignal.timeout(5000)});
 if(r.status===404)return {result:'not_found',latitude:null,longitude:null};if(!r.ok)throw Error('ZIP lookup is temporarily unavailable.');
 const d=await r.json(),places=(d.places||[]).filter(p=>p['state abbreviation']===state),point=places[0],latitude=Number(point?.latitude),longitude=Number(point?.longitude);
 if(!point||!Number.isFinite(latitude)||!Number.isFinite(longitude)||latitude<17||latitude>72||longitude< -180||longitude> -60)return {result:'not_found',latitude:null,longitude:null};
 return {result:'matched',latitude,longitude,matched_address:`${point['place name']}, ${state} ${zip}`,provider:'Approximate ZIP center · Zippopotam.us'};
}
async function remember(db,row,lookup=locateZip){
 try{const address_key=M.key(address(row.zip,row.state));const cached=await db.from('map_geocodes').select('result').eq('address_key',address_key).maybeSingle();if(cached.data?.result==='matched')return;
 const g=await lookup(row.zip,row.state);if(g.result==='matched')await db.from('map_geocodes').upsert({address_key,...g,checked_at:new Date().toISOString()});
 }catch{} // Demand capture succeeds even when approximate ZIP mapping is unavailable.
}
function records(rows){return rows.map(r=>({id:M.key([r.city_key,r.state,r.zip].join('|')),kind:'city_interest',name:`${r.city}, ${r.state} ${r.zip} · ${r.requests} requests`,address:address(r.zip,r.state),city:r.city,state:r.state,zip:r.zip,status:'city_interest',category:'interest',service:`${r.requests} requests · ${r.recurring} recurring · ${r.last_30_days} in last 30 days`,demand_count:Number(r.requests),recurring_count:Number(r.recurring),date:r.latest_at,url:'admin-demand-map.html?city='+encodeURIComponent(r.city)+'&state='+encodeURIComponent(r.state)+'&zip='+encodeURIComponent(r.zip)+'#cityDemand'}));}
module.exports={address,locateZip,remember,records};
