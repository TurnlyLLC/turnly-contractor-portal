const twilio=require('twilio'),S=require('../lib/residential-server.cjs'),V=require('../lib/owner-voice.cjs'),A=require('../lib/owner-voice-openai.cjs');
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 try{
  const {kind,id,sequence,token}=req.query||{},seq=Number(sequence);if(!/^[a-f0-9-]{36}$/i.test(id||'')||!Number.isInteger(seq)||seq<1||seq>21)throw S.fail('Invalid request.',400);
  const c=V.config(),db=S.database();if(c.provider!=='openai-eleven-tts'||!V.ready(c))throw S.fail('Unavailable.',503);
  if(req.method==='GET'&&kind==='audio'){const bytes=await A.audio(db,id,seq,token);res.setHeader('Content-Type','audio/mpeg');res.statusCode=200;return res.end(bytes);}
  if(req.method!=='POST'||!['turn','poll'].includes(kind))throw S.fail('Not found.',404);
  const chunks=[];let size=0;for await(const x of req){size+=Buffer.byteLength(x);if(size>16000)throw S.fail('Too large.',413);chunks.push(Buffer.from(x));}const p=Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString('utf8')));
  if(p.AccountSid!==c.account||!twilio.validateRequest(c.auth,req.headers['x-twilio-signature']||'',A.url(kind,id,seq),p))throw S.fail('Invalid signature.',403);
  const xml=await A[kind](db,p,id,seq,c);res.setHeader('Content-Type','text/xml');res.statusCode=200;res.end(xml);
 }catch(e){return S.json(res,e.status||503,{error:e.status?e.message:'Alice could not finish; check current state before retrying a change.'});}
};
module.exports.config={api:{bodyParser:false}};
