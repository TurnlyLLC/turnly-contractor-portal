const {createClient}=require('@supabase/supabase-js');
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
 if(req.method!=='POST'){res.statusCode=405;return res.end(JSON.stringify({error:'Use POST.'}));}
 try{
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SERVICE_KEY||process.env.SUPABASE_SERVICE_ROLE||process.env.SUPABASE_SECRET_KEY;
  const db=createClient(process.env.SUPABASE_URL||'https://nwnzdoveskthebfyndcs.supabase.co',key,{auth:{persistSession:false,autoRefreshToken:false}});
  await require('./contractor-review.js').access(db,req);
  let raw=req.body||'';if(!raw)for await(const c of req){raw+=c.toString();if(raw.length>6000)throw Object.assign(Error('Request too large.'),{status:413});}
  const input=typeof raw==='string'?JSON.parse(raw):raw;
  if(JSON.stringify(input).length>6000)throw Object.assign(Error('Request too large.'),{status:413});
  const token=String(req.headers.authorization||'').match(/^Bearer (.+)$/i)?.[1];
  const result=await require('../lib/contractor-onboarding-preview.cjs').run(db,input,token,process.env.CONTRACTOR_DRAFT_KEY||key);
  res.statusCode=200;res.end(JSON.stringify(result));
 }catch(e){res.statusCode=e.status||500;res.end(JSON.stringify({error:e.status?e.message:'Unable to load admin preview.'}));}
};
