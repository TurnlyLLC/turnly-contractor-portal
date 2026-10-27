const {createClient}=require('@supabase/supabase-js');
const {access}=require('./contractor-review.js');
const C=require('../lib/contractor-crm.cjs');
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
 if(req.method!=='POST'){res.statusCode=405;return res.end(JSON.stringify({error:'Use POST'}));}
 try{const db=createClient(process.env.SUPABASE_URL||'https://nwnzdoveskthebfyndcs.supabase.co',process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SERVICE_KEY||process.env.SUPABASE_SERVICE_ROLE||process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});const actor=await access(db,req);let raw=req.body||'';if(!raw)for await(const c of req){raw+=c;if(raw.length>8000)throw C.fail('Request too large');}if(typeof raw==='string'&&raw.length>8000)throw C.fail('Request too large');const input=typeof raw==='string'?JSON.parse(raw):raw;res.end(JSON.stringify(await C.run(db,actor,input)));}catch(e){res.statusCode=e.status||503;res.end(JSON.stringify({error:e.status?e.message:'Unable to complete this action. Refresh before retrying; payment retries are protected against duplicates.'}));}
};
