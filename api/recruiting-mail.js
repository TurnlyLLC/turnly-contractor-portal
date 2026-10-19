const S=require('../lib/residential-server.cjs'),R=require('../lib/recruiting-workflows.cjs');
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET'||!process.env.CRON_SECRET||S.hash(req.headers.authorization||'')!==S.hash('Bearer '+process.env.CRON_SECRET))return S.json(res,401,{error:'Unauthorized'});
 try{const db=S.database();const rows=S.checked(await db.from('recruiting_delivery').select('application_id').is('sent_at',null).lt('attempts',10).order('created_at').limit(20));let sent=0;for(const r of rows){try{if(await R.deliver(db,r.application_id))sent++;}catch{}}return S.json(res,200,{sent});}catch{return S.json(res,503,{error:'Application email queue unavailable.'});}
};
