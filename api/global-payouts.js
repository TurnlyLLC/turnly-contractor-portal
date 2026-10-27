const {createClient}=require('@supabase/supabase-js');
const {access}=require('./contractor-review.js');
const G=require('../lib/global-payouts.cjs');
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
 if(req.method!=='POST'){res.statusCode=405;return res.end(JSON.stringify({error:'Use POST'}));}
 try{
  const db=createClient(process.env.SUPABASE_URL||'https://nwnzdoveskthebfyndcs.supabase.co',process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SERVICE_KEY||process.env.SUPABASE_SERVICE_ROLE||process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const actor=await access(db,req);let body=req.body||'';
  if(!body)for await(const part of req){body+=part;if(body.length>8000)throw Object.assign(Error('Request too large'),{status:400});}
  if(JSON.stringify(body).length>16000)throw Object.assign(Error('Request too large'),{status:400});
  res.end(JSON.stringify(await G.run(db,actor,typeof body==='string'?JSON.parse(body):body)));
 }catch(e){res.statusCode=e.status||503;res.end(JSON.stringify({error:e.status?e.message:'Unable to update this payment. Refresh and check its status before retrying.'}));}
};
