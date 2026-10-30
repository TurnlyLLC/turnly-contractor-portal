const S=require('../lib/residential-server.cjs');
const {uuid}=require('../lib/agent-referrals.cjs');
const {access}=require('../lib/contractor-onboarding.cjs');
const maps=require('../lib/map-data.cjs');
const coordinate=(lat,lon)=>typeof lat==='number'&&typeof lon==='number'&&Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180;

async function siteFor(db,job,lookup=maps.locate){
 if(coordinate(job.site_latitude,job.site_longitude))return {latitude:job.site_latitude,longitude:job.site_longitude};
 if(!job.address)return null;
 const cached=S.checked(await db.from('map_geocodes').select('latitude,longitude,result').eq('address_key',maps.key(job.address)).maybeSingle());
 if(cached?.result==='matched'&&coordinate(cached.latitude,cached.longitude))return cached;
 const found=await lookup(job.address);
 return found?.result==='matched'&&coordinate(found.latitude,found.longitude)?found:null;
}
async function progress(db,req,input,lookup){
 const token=String(req.headers.authorization||'').match(/^Bearer (.+)$/i)?.[1];
 const profile=await access(db,token);
 if(!uuid(input.id)||!['head_to_job','start_job'].includes(input.action))throw S.fail('Choose a job and a valid action.');
 const job=S.checked(await db.from('assignment_blocks').select('*').eq('id',input.id).maybeSingle());
 if(!job||(job.claimed_by||job.assigned_to)!==profile.id)throw S.fail('This job is not assigned to you.',403);
 if(input.action==='head_to_job'&&!['claimed','scheduled','en_route'].includes(job.status))throw S.fail('Accept this job before heading to it.',409);
 if(input.action==='start_job'&&!['en_route','in_progress'].includes(job.status))throw S.fail('Choose Head to job before starting.',409);
 let site=null;
 try{site=await siteFor(db,job,lookup);}catch(error){if(input.action==='start_job')throw S.fail('The job location could not be verified. Retry or contact Turnly to confirm the address.',503);}
 if(input.action==='start_job'&&!site)throw S.fail('The job needs a verified map location. Contact Turnly to confirm the address before starting.',409);
 if(!site&&!String(job.address||'').trim())throw S.fail('This job needs an address before directions can open. Contact Turnly.',409);
 const position=input.position||{};
 if(input.action==='start_job'&&(!coordinate(position.latitude,position.longitude)||typeof position.accuracy!=='number'||!Number.isFinite(position.accuracy)||position.accuracy<0||position.accuracy>100||!Number.isFinite(Date.parse(position.recorded_at))))throw S.fail('Enable precise location and try again. GPS accuracy must be within 100 metres.');
 const result=await db.rpc('advance_contractor_job',{
   p_actor:profile.id,p_job:job.id,p_action:input.action,
   p_lat:position.latitude??null,p_lon:position.longitude??null,p_accuracy:position.accuracy??null,p_recorded_at:position.recorded_at||null,
   p_site_lat:site?.latitude??null,p_site_lon:site?.longitude??null,
   p_notes:String(input.notes||'').slice(0,2000),p_issues:String(input.issues||'').slice(0,2000)
 });
 if(result.error)throw S.fail(result.error.code==='P0001'?result.error.message:'Unable to update this job. Refresh and try again.',409);
 const query=site?`${site.latitude},${site.longitude}`:job.address;
 return {assignment:result.data,maps_url:query?'https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(query):null};
}
module.exports=async(req,res)=>{
 if(req.method!=='POST')return S.json(res,405,{error:'Use POST.'});
 try{return S.json(res,200,await progress(S.database(),req,await S.body(req)));}
 catch(error){return S.json(res,error.status||503,{error:error.status?error.message:'Job progress is temporarily unavailable. Please try again.'});}
};
module.exports.progress=progress;
module.exports.siteFor=siteFor;
