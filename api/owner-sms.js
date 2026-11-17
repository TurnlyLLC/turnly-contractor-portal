const S=require('../lib/residential-server.cjs'),V=require('../lib/owner-voice.cjs'),M=require('../lib/owner-sms.cjs');
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 try{
  const c=V.config();
  if(req.method==='GET'){
   if(!process.env.CRON_SECRET||!V.constant(req.headers.authorization,'Bearer '+process.env.CRON_SECRET))return S.json(res,401,{error:'Unauthorized.'});
   const db=S.database();let processed=0;
   for(let n=0;n<3;n++){const r=await M.processNext(db,c);if(!r.processed)break;processed++;}
   return S.json(res,200,{processed});
  }
  if(req.method!=='POST')return S.json(res,405,{error:'Use POST.'});
  const chunks=[];let size=0;for await(const chunk of req){size+=Buffer.byteLength(chunk);if(size>16000)throw S.fail('Too large.',413);chunks.push(Buffer.from(chunk));}
  const p=Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString('utf8')));
  if(!M.verify(req,p,c))return S.json(res,403,{error:'Invalid signature.'});
  if(req.query?.kind==='status')await M.status(S.database(),p);else await M.receive(S.database(),p,c);
  res.setHeader('Content-Type','text/xml');res.statusCode=200;res.end('<?xml version="1.0"?><Response/>');
 }catch(e){return S.json(res,e.status||503,{error:e.status?e.message:'Text service unavailable.'});}
};
module.exports.config={api:{bodyParser:false}};
