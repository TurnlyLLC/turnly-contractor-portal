const {createHash}=require('node:crypto');
const states=require('../assets/maps/state-codes.json');
const CONSENT='I understand this is a city-interest request, not a booking or guarantee of service.';
const fail=message=>Object.assign(new Error(message),{status:400});
function validate(input){
 const clean=(v,max)=>String(v||'').trim().replace(/\s+/g,' ').slice(0,max);
 const city=clean(input.city,100),state=clean(input.state,2).toUpperCase(),zip=clean(input.zip,10).slice(0,5),email=clean(input.email,254).toLowerCase(),name=clean(input.name,100);
 if(input.website)throw fail('Unable to submit this request.');
 if(city.length<2||!/[a-z]/i.test(city)||!Object.hasOwn(states,state)||!/^\d{5}(?:-\d{4})?$/.test(String(input.zip||'').trim()))throw fail('Enter your city, state and ZIP code.');
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw fail('Enter a valid email address.');
 if(!['weekly','biweekly','monthly','once','undecided'].includes(input.frequency))throw fail('Choose how often you would want cleaning.');
 if(!['standard','deep','move'].includes(input.service))throw fail('Choose a cleaning service.');
 if(input.accepted!==true)throw fail('Confirm this is an interest request, not a booking.');
 return {city:city.toLowerCase().replace(/\b\w/g,c=>c.toUpperCase()),city_key:city.toLowerCase(),state,zip,email,name,frequency:input.frequency,service:input.service,notify_launch:input.notify_launch===true,consent_text:CONSENT,consent_version:'2026-11-14',source:clean(input.source||'booking',60),referral_code:clean(input.ref,80),ambassador_code:clean(input.ba,80),utm_source:clean(input.utm_source,100),utm_medium:clean(input.utm_medium,100),utm_campaign:clean(input.utm_campaign,100),dedupe_key:createHash('sha256').update(email+'|'+zip).digest('hex')};
}
async function save(db,input){const row=validate(input);const r=await db.from('city_demand_requests').upsert(row,{onConflict:'dedupe_key',ignoreDuplicates:true});if(r.error)throw Object.assign(new Error('We could not save your request. Please try again.'),{status:503});return {ok:true,message:'Your city request is saved. Share this page with neighbors to help us understand local demand. No clean is booked.'};}
module.exports={validate,save,CONSENT};
