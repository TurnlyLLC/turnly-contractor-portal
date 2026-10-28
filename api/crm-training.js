const S=require('../lib/residential-server.cjs'),C=require('../lib/crm-sales.cjs'),T=require('../lib/crm-training.cjs');
const {uuid}=require('../lib/agent-referrals.cjs');
module.exports=async(req,res)=>{
 if(req.method!=='POST')return S.json(res,405,{error:'Method not allowed.'});
 res.setHeader('Cache-Control','no-store');
 try{
  const db=S.database(),user=await C.access(db,req),i=await S.body(req);
  if(i.action==='status')return S.json(res,200,await T.status(db,user));
  if(i.action==='progress'){
   if(!T.LESSONS.some(l=>l.id===i.lesson)||!uuid(i.session)||typeof i.position!=='number'||!Number.isFinite(i.position)||i.position<0||i.position>1000)throw S.fail('Invalid training progress.');
   const p=S.checked(await db.rpc('crm_seller_training_record_v3',{p_user:user.id,p_lesson:i.lesson,p_session:i.session,p_position:i.position,p_start:i.start===true}));
   return S.json(res,200,{lesson:p.lesson,watched_seconds:p.watched_seconds,completed_at:p.completed_at});
  }
  if(i.action==='section'){
   S.checked(await db.rpc('crm_playbook_section_review',{p_user:user.id,p_section:i.section,p_complete:i.complete===true}));
   return S.json(res,200,await T.status(db,user));
  }
  if(i.action==='acknowledge'){
   if(i.reviewed!==true)throw S.fail('Confirm you reviewed the playbook.');
   S.checked(await db.rpc('crm_seller_training_acknowledge_v3',{p_user:user.id}));
   return S.json(res,200,await T.status(db,user));
  }
  throw S.fail('Unknown training action.');
 }catch(e){return S.json(res,e.status||503,{error:e.status?e.message:'Training progress could not be saved. Please pause and try again.'});}
};
