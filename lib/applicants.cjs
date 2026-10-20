const {fail}=require('./residential-server.cjs');
const ROLES=['cleaner','brand_ambassador'], CITIES=['Raleigh','Durham','Asheville','Greensboro'];
const STATUSES=['new','reviewing','contacted','interview','onboarding','waitlist','not_selected','withdrawn'];
const CHANNELS=['door_to_door','social_media','personal_referrals','networking','community_events','realtor_partnerships','local_business','other'];
const trim=(v,max)=>typeof v==='string'?v.trim().slice(0,max):'';
function validate(v){
 if(!v||!ROLES.includes(v.role))throw fail('Choose a position.');
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v.request_id||''))throw fail('Reload the application and try again.');
 const zones=v.role==='cleaner'?(v.service_cities===undefined?[v.service_city]:v.service_cities):[v.service_city];
 if(!Array.isArray(zones)||!zones.length||zones.length>4||zones.some(x=>!CITIES.includes(x)))throw fail('Choose at least one valid service zone.');
 const selectedZones=CITIES.filter(city=>zones.includes(city));
 const out={id:v.request_id,role:v.role,name:trim(v.name,160),email:trim(v.email,254).toLowerCase(),phone:trim(v.phone,30),city:trim(v.city,100),state:trim(v.state,2).toUpperCase(),service_city:selectedZones[0],answers:{},consent_version:'2026-10-19'};
 if(out.name.length<2||!/^\S+@\S+\.\S+$/.test(out.email)||!/^\+?[\d().\s-]{10,30}$/.test(out.phone)||out.phone.replace(/\D/g,'').length<10||!out.city||!/^[A-Z]{2}$/.test(out.state)||!CITIES.includes(out.service_city))throw fail('Enter your name, valid email and phone, city, state, and preferred service area.');
 if(v.accurate!==true||v.contact_consent!==true)throw fail('Confirm your information and permission to contact you about this application.');
 out.answers.contact_consent=true;out.answers.accurate=true;
 if(v.role==='cleaner'){
   out.answers.service_cities=selectedZones;
   for(const [key,allowed] of Object.entries({experience:['new','under_1','1_3','3_plus'],transport:['yes','planning','discuss'],supplies:['ready','some','need_guidance'],insurance:['current','will_obtain','discuss'],availability:['weekdays','weekends','both','flexible']})){
     if(!allowed.includes(v[key]))throw fail('Complete all cleaner readiness and availability questions.');out.answers[key]=v[key];
   }
   if(!Array.isArray(v.services)||!v.services.length||v.services.some(x=>!['residential','turnover'].includes(x)))throw fail('Choose at least one cleaning service.');
   out.answers.services=[...new Set(v.services)];
   for(const key of ['training_ready','documents_ready','standards_ready']){if(v[key]!==true)throw fail('Confirm the onboarding, training, and service standards acknowledgments.');out.answers[key]=true;}
   out.answers.experience_details=trim(v.experience_details,2000);out.answers.availability_details=trim(v.availability_details,1000);
 }else{
   out.consent_version='ambassador-application-2026-10-19-v1';
   out.answers.application_version='ambassador-2026-10-19-v1';
   out.answers.compensation_acknowledged='$25 on first confirmed booking + $25 on first completed clean; maximum $50 per qualifying new customer';
   out.answers.zip=trim(v.zip,10);
   if(!/^\d{5}(-\d{4})?$/.test(out.answers.zip))throw fail('Enter a valid ZIP code.');
   for(const key of ['age_18','commission_only','independent_ack','marketing_ack']){
    if(v[key]!==true)throw fail('Confirm age eligibility, commission-only compensation, the independent contractor arrangement, and marketing standards.');
    out.answers[key]=true;
   }
   out.answers.strategy=trim(v.strategy,3000);
   if(out.answers.strategy.length<20)throw fail('Describe how you would acquire your first five paying customers (at least 20 characters).');
   if(!Array.isArray(v.channels)||!v.channels.length||v.channels.some(c=>!CHANNELS.includes(c)))throw fail('Choose at least one marketing channel.');
   out.answers.channels=[...new Set(v.channels)];out.answers.channel_other=trim(v.channel_other,300);
   if(v.channels.includes('other')&&!out.answers.channel_other)throw fail('Describe your other marketing channel.');
   for(const [key,max] of Object.entries({preferred_name:100,sales_experience:2000,ambassador_experience:2000,languages:300}))out.answers[key]=trim(v[key],max);
   out.answers.interest=trim(v.interest,1500);out.answers.profile_url=trim(v.profile_url,300);
   if(out.answers.profile_url&&!/^https:\/\/[^\s]+$/.test(out.answers.profile_url))throw fail('Use a complete https:// profile link, or leave it blank.');
 }
 out.answers.additional=trim(v.additional,1500);out.answers.source=trim(v.source,100);
 return out;
}
function review(v){if(!STATUSES.includes(v.status))throw fail('Choose a valid application status.');if(!Number.isInteger(v.version)||v.version<1)throw fail('Refresh the application before saving.');if(typeof v.note!=='string'||v.note.length>3000)throw fail('Keep review notes under 3,000 characters.');return {status:v.status,note:v.note.trim()};}
module.exports={validate,review,ROLES,CITIES,STATUSES,CHANNELS};
