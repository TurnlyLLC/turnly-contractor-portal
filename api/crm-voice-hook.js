const S=require('../lib/residential-server.cjs'),V=require('../lib/crm-voice.cjs');
module.exports=async(req,res)=>{
 if(req.method!=='POST')return S.json(res,405,{error:'Method not allowed.'});
 const kind=req.query?.kind;
 if(!['connect','status','amd'].includes(kind))return S.json(res,400,{error:'Invalid event.'});
 try{
  let p=req.body;
  if(!p){let raw='';for await(const c of req){raw+=c;if(raw.length>20000)throw S.fail('Too large.');}p=raw;}
  if(typeof p==='string'||Buffer.isBuffer(p))p=Object.fromEntries(new URLSearchParams(String(p)));
  if(!p||!V.verify(req,p,kind))return S.json(res,403,{error:'Invalid signature.'});
  const db=S.database();
  if(kind==='amd'){await V.amd(db,p,req.query.intent);return S.json(res,200,{ok:true});}
  if(kind==='status'){await V.status(db,p);return S.json(res,200,{ok:true});}
  res.setHeader('Content-Type','text/xml');res.setHeader('Cache-Control','no-store');res.status(200).send(await V.connect(db,p));
 }catch{res.status(503).end();}
};
