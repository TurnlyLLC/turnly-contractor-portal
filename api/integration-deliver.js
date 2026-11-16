const crypto=require('node:crypto'),S=require('../lib/residential-server.cjs'),I=require('../lib/integrations.cjs');
module.exports=async(req,res)=>{
 if(req.method!=='GET')return S.json(res,405,{error:'Use GET.'});
 if(!process.env.CRON_SECRET||!crypto.timingSafeEqual(Buffer.from(I.hash(req.headers.authorization||'')),Buffer.from(I.hash('Bearer '+process.env.CRON_SECRET))))return S.json(res,401,{error:'Unauthorized.'});
 try{return S.json(res,200,await I.deliver(S.database()));}catch{return S.json(res,503,{error:'Webhook delivery needs attention.'});}
};
