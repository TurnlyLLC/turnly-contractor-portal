const {clean}=require('./agent-referrals.cjs');
const ENDPOINT='https://services.nconemap.gov/secure/rest/services/AddressNC/AddressNC_geocoder/GeocodeServer/suggest';
async function suggest(input,fetcher=fetch){
 const query=clean(input.query,180);
 if(query.length<4)return {suggestions:[]};
 try{
  const response=await fetcher(ENDPOINT+'?'+new URLSearchParams({f:'json',text:query,maxSuggestions:'10'}),{signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw new Error('Unavailable');
  const data=await response.json();if(!Array.isArray(data.suggestions))throw new Error('Unavailable');
  const seen=new Set(),suggestions=[];
  for(const item of data.suggestions){
   if(item.isCollection||typeof item.text!=='string')continue;
   // Only offer complete street addresses, not cities, streets, or ZIP areas.
   const parts=item.text.split(',').map(s=>s.trim()),zip=parts.pop(),state=parts.pop(),city=parts.pop(),street=parts.join(', ');
   if(state!=='NC'||!/^\d{5}(?:-\d{4})?$/.test(zip||'')||!city||!/^\d/.test(street)||street.length>300)continue;
   const label=[street,city,state,zip].join(', ');if(seen.has(label))continue;seen.add(label);
   suggestions.push({label,property_address:street,city,state,zip});if(suggestions.length===5)break;
  }
  return {suggestions};
 }catch{return {suggestions:[],unavailable:true};}
}
module.exports={suggest};
