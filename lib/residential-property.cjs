const {clean}=require('./agent-referrals.cjs');
async function lookup(input,fetcher=fetch){
 if(!process.env.RENTCAST_API_KEY)return {found:false,message:'Automatic property lookup is not connected yet. Please enter your home details.'};
 const address=clean(input.property_address,300),city=clean(input.city,100),state=clean(input.state,2),zip=clean(input.zip,10);
 if(!address||!city||!/^[a-z]{2}$/i.test(state)||!/^\d{5}(-\d{4})?$/.test(zip))throw new Error('Enter the complete property address, city, state and ZIP first.');
 const params=new URLSearchParams({address:`${address}, ${city}, ${state}, ${zip}`,limit:'2'});
 try{
  const r=await fetcher('https://api.rentcast.io/v1/properties?'+params,{headers:{'X-Api-Key':process.env.RENTCAST_API_KEY,Accept:'application/json'},signal:AbortSignal.timeout(12000)});
  if(!r.ok)return {found:false,message:'Property records are unavailable right now. Please enter your home details to continue.'};
  const rows=await r.json();
  if(!Array.isArray(rows)||rows.length!==1)return {found:false,message:'We couldn’t find a unique property match. Please enter your home details below.'};
  const p=rows[0];
  const number=(value,min,max,step=1)=>typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max&&value/step%1===0?value:null;
  return {found:true,source:'RentCast',address:clean(p.formattedAddress,500),beds:number(p.bedrooms,0,30),baths:number(p.bathrooms,.5,30,.5),sqft:number(p.squareFootage,100,50000)};
 }catch{return {found:false,message:'We couldn’t retrieve the property record. You can enter the details yourself.'};}
}
module.exports={lookup};
