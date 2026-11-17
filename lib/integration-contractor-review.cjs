const S=require('./residential-server.cjs');
const operations=new Set(['document_file','mobile_account','mobile_file','mobile_review','mobile_requirement','review_document','approve','override','remove_override','correction_email']);
async function run(db,actor,action,input,key){
 if(!operations.has(action))throw S.fail('Unsupported contractor review operation.',403);
 const secret=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SERVICE_KEY||process.env.SUPABASE_SERVICE_ROLE||process.env.SUPABASE_SECRET_KEY;
 if(!secret)throw S.fail('Private onboarding connection unavailable.',503);
 const origin=require('./mobile-backend.cjs').backendOrigin();
 const transport=(url,options={})=>{
  const u=new URL(url);if(!u.href.startsWith(origin+'/onboarding/admin/'))throw S.fail('Unsupported onboarding destination.',403);
  return fetch(url,{...options,headers:{...options.headers,'X-Supabase-Auth':secret,'X-Turnly-Integration-Id':key},redirect:'error'});
 };
 if(action==='mobile_account')return require('./mobile-contractor-review.cjs').file(require('./mobile-contractor-review.cjs').client(secret,transport),input.id);
 return require('../api/contractor-review.js').run(db,actor,{...input,action},secret,transport);
}
module.exports={run,operations};
