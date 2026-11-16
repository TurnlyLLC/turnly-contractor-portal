const S=require('../lib/residential-server.cjs'),I=require('../lib/integrations.cjs');
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 try{return S.json(res,200,await I.publicApi(S.database(),req));}
 catch(e){if(e.status===429)res.setHeader('Retry-After','60');return S.json(res,e.status||503,{error:e.status?e.message:'The API is temporarily unavailable.'});}
};
