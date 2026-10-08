const S=require('../lib/residential-server.cjs');
const {timingSafeEqual}=require('node:crypto');
module.exports=async(req,res)=>{
 if(req.method!=='GET')return S.json(res,405,{error:'Method not allowed.'});
 if(!process.env.CRON_SECRET||!timingSafeEqual(Buffer.from(S.hash(req.headers.authorization||'')),Buffer.from(S.hash('Bearer '+process.env.CRON_SECRET))))return S.json(res,401,{error:'Unauthorized.'});
 try{return S.json(res,200,await require('../lib/residential-jobs.cjs').syncBatch(S.database()));}
 catch{return S.json(res,503,{error:'Residential job synchronization needs attention.'});}
};
