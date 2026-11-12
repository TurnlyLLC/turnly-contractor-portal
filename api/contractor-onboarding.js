const {createClient}=require('@supabase/supabase-js');
const {access,run}=require('../lib/contractor-onboarding.cjs');
const checkStatus=require('../lib/onboarding-request-guard.cjs').createGuard();
const reportStatus=require('../lib/onboarding-diagnostics.cjs').createReporter();
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
 if(req.method!=='POST'){res.setHeader('Allow','POST');res.statusCode=405;return res.end(JSON.stringify({error:'Use POST.'}));}
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);
 let report=()=>{};
 try{
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SERVICE_KEY||process.env.SUPABASE_SERVICE_ROLE||process.env.SUPABASE_SECRET_KEY;if(!key)throw Error('Unavailable');
  const token=String(req.headers.authorization||'').match(/^Bearer (.+)$/i)?.[1];
  let raw=req.body||'';if(!raw)for await(const c of req){raw+=c.toString();if(raw.length>4300000)throw Object.assign(Error('File is too large.'),{status:413});}
  const input=typeof raw==='string'?JSON.parse(raw):raw;
  if(JSON.stringify(input).length>4300000)throw Object.assign(Error('File is too large.'),{status:413});
  if(input.action==='status'){report=reportStatus(req.headers);checkStatus(token);}
  const transport=(url,options={})=>fetch(url,{...options,signal:options.signal?AbortSignal.any([controller.signal,options.signal]):controller.signal});
  const db=createClient(process.env.SUPABASE_URL||'https://nwnzdoveskthebfyndcs.supabase.co',key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:transport}}),profile=await access(db,token);
  const result=await run(db,profile,input,token,process.env.CONTRACTOR_DRAFT_KEY||key,transport);res.statusCode=200;res.end(JSON.stringify(result));
 }catch(e){if(e.retryAfter)res.setHeader('Retry-After',String(e.retryAfter));res.statusCode=controller.signal.aborted?503:e.status||500;res.end(JSON.stringify({error:controller.signal.aborted?'Turnly is taking too long to respond. Please wait a moment and try again.':e.status?e.message:'Unable to load onboarding. Please try again.'}));}
 finally{clearTimeout(timer);report(res.statusCode);}
};
