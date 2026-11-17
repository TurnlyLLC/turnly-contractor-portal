const S=require('./residential-server.cjs');
const MAX=4000000;
async function read(req){
 if(req.body&&typeof req.body==='object'&&!Buffer.isBuffer(req.body)){if(Buffer.byteLength(JSON.stringify(req.body))>MAX)throw S.fail('Request too large.',413);return req.body;}
 let raw=req.body||'';if(!raw)for await(const chunk of req){raw+=chunk.toString();if(Buffer.byteLength(raw)>MAX)throw S.fail('Request too large.',413);}
 if(Buffer.byteLength(raw)>MAX)throw S.fail('Request too large.',413);return JSON.parse(raw||'{}');
}
module.exports={read,MAX};
