const T=require('../lib/crm-training.cjs');
const S=require('../lib/residential-server.cjs'),C=require('../lib/crm-sales.cjs'),V=require('../lib/crm-voice.cjs');
module.exports=async(req,res)=>{
 if(req.method!=='POST')return S.json(res,405,{error:'Method not allowed.'});
 try{
  const db=S.database(),user=await C.access(db,req),input=await S.body(req);
  if(input.action==='prepare')return S.json(res,200,await V.prepare(db,user,req,input));
  if(input.action==='history'){
   await C.leadFor(db,user,input.lead_id);
   let q=db.from('crm_voice_calls').select('id,created_at,status,duration_seconds,phone,user_id').eq('lead_id',input.lead_id).order('created_at',{ascending:false}).limit(20);
   if(!user.admin)q=q.eq('user_id',user.id);
   return S.json(res,200,{calls:S.checked(await q),ready:V.ready(),training_ready:await T.ready(db,user)});
  }
  throw S.fail('Unknown calling action.');
 }catch(e){return S.json(res,e.status||503,{error:e.status?e.message:'Calling is temporarily unavailable. Please try again.'});}
};
