const S=require('../lib/residential-server.cjs'),C=require('../lib/crm-sales.cjs'),O=require('../lib/crm-overview.cjs');
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return S.json(res,405,{error:'Use POST.'});
 try{const db=S.database(),user=await C.access(db,req);if(!user.admin)throw S.fail('Administrator access required.',403);return S.json(res,200,await O.overview(db,user,await S.body(req)));}
 catch(e){return S.json(res,e.status||500,{error:e.status?e.message:'Unable to load team activity. Please retry.'});}
};
