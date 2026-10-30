const S=require('../lib/residential-server.cjs'),C=require('../lib/crm-sales.cjs'),T=require('../lib/crm-training.cjs'),A=require('../lib/seller-agreement.cjs');
module.exports=async(req,res)=>{
 if(req.method!=='POST')return S.json(res,405,{error:'Method not allowed.'});
 res.setHeader('Cache-Control','no-store');
 try{
  const db=S.database(),user=await C.access(db,req),i=await S.body(req);
  const agreement=await A.current(db,user);
  if(i.action==='sign'){
   const name=String(i.name||'').trim();
   if(i.consent!==true||name.length<3||name.length>160||i.version!==agreement.version||i.hash!==agreement.hash)throw S.fail('Read the current agreement, enter your full legal name, and confirm electronic signature consent.');
   const training=await T.status(db,user);
   if(!training.lessons.find(l=>l.id==='introduction')?.completed_at)throw S.fail('Finish the introduction before signing.',403);
   S.checked(await db.rpc('crm_sign_pay_agreement',{p_user:user.id,p_version:agreement.version,p_hash:agreement.hash,p_text:agreement.text,p_name:name}));
  }else if(i.action!=='status')throw S.fail('Unknown onboarding action.');
  const signature=S.checked(await db.from('crm_seller_agreements').select('*').eq('user_id',user.id).eq('version',agreement.version).maybeSingle());
  return S.json(res,200,{pay_mode:agreement.mode,agreement:{version:agreement.version,hash:agreement.hash,text:agreement.text},signature,ready:await T.ready(db,user),name:user.full_name||''});
 }catch(e){return S.json(res,e.status||503,{error:e.status?e.message:'Unable to save or load onboarding. Please try again.'});}
};
