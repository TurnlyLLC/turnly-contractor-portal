const S=require('../lib/residential-server.cjs'),I=require('../lib/integrations.cjs');
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return S.json(res,405,{error:'Use POST.'});
 try{const db=S.database(),user=await I.admin(db,req);return S.json(res,200,await I.manage(db,user,await S.body(req)));}
 catch(e){return S.json(res,e.status||503,{error:e.status?e.message:'Integrations are temporarily unavailable.'});}
};
