const S=require('./residential-server.cjs');
const operations=new Set(['document_file','mobile_account','mobile_details','mobile_file','mobile_review','mobile_requirement','review_document','approve','override','remove_override','correction_email']);
function details(raw){const safe=require('./mobile-contractor-review.cjs').safeFile(raw);return {...safe,contact:raw.contact||{},items:safe.items.map(i=>{const original=(raw.items||[]).find(o=>o.id===i.id);return{...i,submission:i.submission?{...i.submission,fields:Array.isArray(original?.submission?.fields)?original.submission.fields.map(f=>({id:f.id,label:f.label,value:f.sensitive||f.sealed?null:f.value,masked:f.sensitive||f.sealed?f.masked||'****':undefined,sensitive:!!(f.sensitive||f.sealed)})):[]}:null};}),notice:'Original submissions and signatures are preserved. Sensitive bank/tax answers stay masked. Contact/profile corrections do not rewrite signed documents.'};}
async function run(db,actor,action,input,key){
 if(!operations.has(action))throw S.fail('Unsupported contractor review operation.',403);
 const secret=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SERVICE_KEY||process.env.SUPABASE_SERVICE_ROLE||process.env.SUPABASE_SECRET_KEY;
 if(!secret)throw S.fail('Private onboarding connection unavailable.',503);
 const origin=require('./mobile-backend.cjs').backendOrigin();
 const transport=(url,options={})=>{
  const u=new URL(url);if(!u.href.startsWith(origin+'/onboarding/admin/'))throw S.fail('Unsupported onboarding destination.',403);
  return fetch(url,{...options,headers:{...options.headers,'X-Supabase-Auth':secret,'X-Turnly-Integration-Id':key},redirect:'error'});
 };
 if(action==='mobile_details'){if(!require('./agent-referrals.cjs').uuid(input.id))throw S.fail('Choose a contractor UUID.');const call=require('./mobile-contractor-review.cjs').client(secret,transport);return details(await call('contractors/'+input.id));}
 if(action==='mobile_account')return require('./mobile-contractor-review.cjs').file(require('./mobile-contractor-review.cjs').client(secret,transport),input.id);
 return require('../api/contractor-review.js').run(db,actor,{...input,action},secret,transport);
}
module.exports={run,operations,details};
