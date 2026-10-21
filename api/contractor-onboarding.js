const {createClient}=require('@supabase/supabase-js');
const {access,run}=require('../lib/contractor-onboarding.cjs');
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
 if(req.method!=='POST'){res.setHeader('Allow','POST');res.statusCode=405;return res.end(JSON.stringify({error:'Use POST.'}));}
 try{
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SERVICE_KEY||process.env.SUPABASE_SERVICE_ROLE||process.env.SUPABASE_SECRET_KEY;if(!key)throw Error('Unavailable');
  const db=createClient(process.env.SUPABASE_URL||'https://nwnzdoveskthebfyndcs.supabase.co',key,{auth:{persistSession:false,autoRefreshToken:false}}),token=String(req.headers.authorization||'').match(/^Bearer (.+)$/i)?.[1],profile=await access(db,token);
  let raw=req.body||'';if(!raw)for await(const c of req){raw+=c.toString();if(raw.length>4300000)throw Object.assign(Error('File is too large.'),{status:413});}
  const input=typeof raw==='string'?JSON.parse(raw):raw;
  if(JSON.stringify(input).length>4300000)throw Object.assign(Error('File is too large.'),{status:413});
  const result=await run(db,profile,input,token,process.env.CONTRACTOR_DRAFT_KEY||key);res.statusCode=200;res.end(JSON.stringify(result));
 }catch(e){res.statusCode=e.status||500;res.end(JSON.stringify({error:e.status?e.message:'Unable to load onboarding. Please try again.'}));}
};
