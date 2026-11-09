const S=require('../lib/residential-server.cjs');
const {access}=require('./contractor-review.js');
module.exports=async(req,res)=>{
 try{
  if(req.method!=='POST')return S.json(res,405,{error:'Use POST.'});
  const db=S.database(),actor=await access(db,req),token=req.headers.authorization.slice(7);
  const input=typeof req.body==='string'?JSON.parse(req.body):req.body;
  if((await require('./cleaner-agreement-release.js').inspect(token)).state!=='published')throw S.fail('Publish and verify the revised agreement before sending corrected notices.',409);
  return S.json(res,200,await require('../lib/insurance-clarification.cjs').apply(db,actor,input?.id,token));
 }catch(e){return S.json(res,e.status||503,{error:e.status?e.message:'Unable to finish the insurance clarification. Check the current review before retrying.'});}
};
