const ENDPOINT='https://services.nconemap.gov/secure/rest/services/AddressNC/AddressNC_geocoder/GeocodeServer/findAddressCandidates';
const CITIES=[['Raleigh',35.7796,-78.6382],['Durham',35.994,-78.8986],['Asheville',35.5951,-82.5515],['Greensboro',36.0726,-79.792]];
const OUTSIDE='This address is outside our service area. We serve North Carolina addresses within 25 miles of Raleigh, Durham, Asheville or Greensboro.';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
function miles(a,b,c,d){const rad=n=>n*Math.PI/180;return 3958.7613*2*Math.asin(Math.sqrt(Math.min(1,Math.sin(rad(c-a)/2)**2+Math.cos(rad(a))*Math.cos(rad(c))*Math.sin(rad(d-b)/2)**2)));}
async function verify(input,fetcher=fetch){
 const street=String(input.property_address||'').trim(),city=String(input.city||'').trim(),state=String(input.state||'').trim().toUpperCase(),zip=String(input.zip||'').trim();
 if(!/^\d/.test(street)||street.length>300||!city||city.length>100||! /^[A-Z]{2}$/.test(state)||zip&&!/^\d{5}(?:-\d{4})?$/.test(zip))throw fail('Enter a complete street address, city and state.');
 if(state!=='NC')return {approved:false,message:OUTSIDE};
 let data;
 try{const r=await fetcher(ENDPOINT+'?'+new URLSearchParams({f:'json',SingleLine:[street,city,state,zip].filter(Boolean).join(', '),outSR:'4326',outFields:'Addr_type,Region,City,Postal',maxLocations:'2'}),{signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error();data=await r.json();if(data.error||!Array.isArray(data.candidates))throw Error();}
 catch{throw fail('Address verification is temporarily unavailable. Please retry before continuing.',503);}
 const [p,other]=data.candidates,attr=p?.attributes||{},lat=p?.location?.y,lon=p?.location?.x;
 if(!p||p.score<98||!['PointAddress','Subaddress'].includes(attr.Addr_type)||attr.Region!=='NC'||other&&other.score>=p.score||!Number.isFinite(lat)||!Number.isFinite(lon)||lat<33||lat>37||lon< -85||lon> -75||String(p.address).match(/^\d+/)?.[0]!==street.match(/^\d+/)?.[0]||zip&&attr.Postal!==zip.slice(0,5))throw fail('We could not verify this exact address. Check the street, city, state and ZIP code.');
 const nearest=CITIES.map(([city,a,b])=>({city,miles:miles(a,b,lat,lon)})).sort((a,b)=>a.miles-b.miles)[0];
 return nearest.miles<=25?{approved:true,service_city:nearest.city,distance_miles:Math.round(nearest.miles*10)/10,matched_address:p.address,message:`Approved — within the ${nearest.city} service area.`}:{approved:false,message:OUTSIDE};
}
async function requireCoverage(input){const result=await verify(input);if(!result.approved)throw fail(result.message);return result;}
module.exports={verify,requireCoverage,miles,CITIES};
