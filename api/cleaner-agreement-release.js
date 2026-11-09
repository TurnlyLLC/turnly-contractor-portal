const {createHash}=require('node:crypto');
const S=require('../lib/residential-server.cjs');
const {access}=require('./contractor-review.js');
const origin='https://turnly-contractor-app-backend.rork.app';
const original='e196be03e968109e2e021e5825c44870950994048eedfa055e5a9a7f03b010e3';
const previous='69b8018059f0ccc5fd718e908891e2ba37f0275f330a890e0c2cc8dd7ebfbed1';
const revised='69eeb083f73219860d3bfb34130e51a61fef0f75e5d9cb55b036c338ed8f4b0e';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
async function native(path,token,body){
 const headers={'X-Supabase-Auth':token};
 if(body)Object.assign(headers,{'Content-Type':'application/pdf','X-File-Name':'Turnly_Master_Contractor_Agreement_Updated.pdf'});
 const response=await fetch(origin+'/onboarding/admin/'+path,{method:body?'POST':'GET',headers,body,redirect:'error',signal:AbortSignal.timeout(30000)});
 const data=await response.json();
 if(!response.ok||data.ok===false)throw S.fail(data.error||'Onboarding could not update the template.',response.status>=400?response.status:502);
 return data;
}
async function inspect(token){
 const {items}=await native('items',token);
 const matching=items.filter(i=>i.active&&i.kind==='sign'&&/master.*(contract|agreement)/i.test(i.title));
 if(matching.length!==1)throw S.fail('The shared checklist does not have one matching active master agreement.',409);
 const item=matching[0];
 const path='items/'+encodeURIComponent(item.id)+'/';
 const link=new URL((await native(path+'document-link',token)).url);
 if(link.origin!==origin||!link.pathname.startsWith('/onboarding/f/'))throw S.fail('Unexpected template location.',502);
 const response=await fetch(link,{redirect:'error',signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw S.fail('Unable to verify the current agreement.',502);
 const hash=digest(Buffer.from(await response.arrayBuffer()));
 return {title:item.title,version:item.version,pages:item.pageCount,path,hash,
  state:hash===revised?'published':[original,previous].includes(hash)?'ready':'different'};
}
module.exports=async(req,res)=>{
 try{
  if(req.method!=='POST')return S.json(res,405,{error:'Use POST.'});
  await access(S.database(),req);
  const token=req.headers.authorization.slice(7);
  const current=await inspect(token);
  const input=typeof req.body==='string'?JSON.parse(req.body):req.body;
  if(input?.action==='inspect'||current.state==='published')return S.json(res,200,current);
  if(input?.action!=='publish'||current.state!=='ready')throw S.fail('The active template differs from the reviewed original. Review it before publishing.',409);
  const file=Buffer.from(String(input.pdf||''),'base64');
  if(digest(file)!==revised)throw S.fail('Select the verified 46-page updated master agreement PDF.');
  await native(current.path+'document',token,file);
  const saved=await inspect(token);
  if(saved.state!=='published')throw S.fail('Template upload has not been verified. Check current version before retrying.',502);
  return S.json(res,200,saved);
 }catch(error){return S.json(res,error.status||503,{error:error.status?error.message:'Unable to verify the cleaner agreement release.'});}
};
module.exports.inspect=inspect;
