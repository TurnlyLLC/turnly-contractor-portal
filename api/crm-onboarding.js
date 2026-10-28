const S=require('../lib/residential-server.cjs'),C=require('../lib/crm-sales.cjs'),T=require('../lib/crm-training.cjs'),A=require('../lib/seller-agreement.cjs');
module.exports=async(req,res)=>{
 if(req.method!=='POST')return S.json(res,405,{error:'Method not allowed.'});
 res.setHeader('Cache-Control','no-store');
 try{
  const db=S.database(),user=await C.access(db,req),i=await S.body(req);
  if(i.action==='sign'){
   const name=String(i.name||'').trim();
   if(i.consent!==true||name.length<3||name.length>160||i.version!==A.VERSION||i.hash!==A.HASH)throw S.fail('Read the current agreement, enter your full legal name, and confirm electronic signature consent.');
   const training=await T.status(db,user);
   if(!training.lessons.find(l=>l.id==='introduction')?.completed_at)throw S.fail('Finish the introduction before signing.',403);
   S.checked(await db.from('crm_seller_agreements').upsert({user_id:user.id,version:A.VERSION,agreement_hash:A.HASH,agreement_text:A.TEXT,signer_name:name,consent_text:'I have read and agree to this agreement and intend my typed full legal name as my electronic signature.'},{onConflict:'user_id,version',ignoreDuplicates:true}));
  }else if(i.action!=='status')throw S.fail('Unknown onboarding action.');
  const signature=S.checked(await db.from('crm_seller_agreements').select('*').eq('user_id',user.id).eq('version',A.VERSION).maybeSingle());
  return S.json(res,200,{agreement:{version:A.VERSION,hash:A.HASH,text:A.TEXT},signature,ready:await T.ready(db,user),name:user.full_name||''});
 }catch(e){return S.json(res,e.status||503,{error:e.status?e.message:'Unable to save or load onboarding. Please try again.'});}
};
