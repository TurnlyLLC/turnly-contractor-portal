const S=require('../lib/residential-server.cjs');
const Z=require('../lib/contractor-job-zones.cjs');
module.exports=async(req,res)=>{
 if(!['GET','POST'].includes(req.method))return S.json(res,405,{error:'Use GET or POST.'});
 try{
  const db=S.database(),token=String(req.headers.authorization||'').match(/^Bearer (.+)$/i)?.[1];
  if(!token)throw S.fail('Sign in to manage your service areas.',401);
  const auth=await db.auth.getUser(token);if(auth.error||!auth.data?.user)throw S.fail('Sign in again to continue.',401);
  const input=req.method==='POST'?await S.body(req):{};let actor=auth.data.user.id;
  if(input.contractor_id){await S.admin(db,req);if(input.zones!==undefined)throw S.fail('Use the admin directory to change another contractor’s areas.',403);actor=input.contractor_id;}
  const result=await Z.run(db,actor,input);if(input.contractor_id)result.can_edit=false;
  return S.json(res,200,result);
 }catch(e){return S.json(res,e.status||503,{error:e.status?e.message:'Unable to load or save service areas. Please retry.'});}
};
