const S=require('../lib/residential-server.cjs');
const V=require('../lib/residential-video-consent.cjs');
module.exports=async(req,res)=>{
 if(req.method!=='POST')return S.json(res,405,{error:'Method not allowed.'});
 try{return S.json(res,200,await V.run(S.database(),req,await S.body(req)));}
 catch(e){return S.json(res,e.status||503,{error:e.status?e.message:'Unable to load the video consent record.'});}
};
