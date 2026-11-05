const S=require('../lib/residential-server.cjs'),A=require('../lib/ambassadors.cjs'),social=require('../lib/ba-social.cjs');
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 if(!['GET','HEAD'].includes(req.method)){res.statusCode=405;return res.end('Method not allowed');}
 const code=req.query?.code;
 if(!social.valid(code)){res.statusCode=400;return res.end('Invalid referral link');}
 try{
  if(!await A.referralMember(S.database(),code)){res.statusCode=404;return res.end('This referral link is unavailable. Contact Turnly for help.');}
  const isImage=req.query.image==='1';res.setHeader('Content-Type',isImage?'image/png':'text/html; charset=utf-8');
  if(req.method==='HEAD')return res.end();
  return res.end(isImage?await social.image(code):social.page(code));
 }catch{res.statusCode=503;return res.end('Please try again shortly.');}
};
