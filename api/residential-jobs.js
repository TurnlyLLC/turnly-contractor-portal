const S=require('../lib/residential-server.cjs');
const {timingSafeEqual}=require('node:crypto');
module.exports=async(req,res)=>{
 if(req.method!=='GET')return S.json(res,405,{error:'Method not allowed.'});
 if(!process.env.CRON_SECRET||!timingSafeEqual(Buffer.from(S.hash(req.headers.authorization||'')),Buffer.from(S.hash('Bearer '+process.env.CRON_SECRET))))return S.json(res,401,{error:'Unauthorized.'});
 try{const db=S.database(),jobs=await require('../lib/residential-jobs.cjs').syncBatch(db);let recurring;
  try{recurring=await require('../lib/customer-repeat-booking.cjs').renew(db);}catch{console.error('Recurring booking scheduling needs attention.');recurring={error:'Recurring booking scheduling needs attention; existing jobs were synchronized.'};}
  return S.json(res,200,{...jobs,recurring});}
 catch{return S.json(res,503,{error:'Residential job synchronization needs attention.'});}
};
