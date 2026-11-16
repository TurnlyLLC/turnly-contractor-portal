const crypto=require('node:crypto'),S=require('../lib/residential-server.cjs');
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');if(req.method!=='POST')return S.json(res,405,{error:'Use POST.'});
 try{
 const secret=String(req.headers.authorization||'').replace(/^Bearer /,'');if(!/^tcw_[A-Za-z0-9_-]{43}$/.test(secret))throw S.fail('Unauthorized.',401);
 const db=S.database(),hash=crypto.createHash('sha256').update(secret).digest('hex');
 const w=S.checked(await db.from('portal_coding_workers').select('id').eq('secret_hash',hash).is('revoked_at',null).gt('expires_at',new Date().toISOString()).maybeSingle());if(!w)throw S.fail('Unauthorized.',401);
 const input=req.body||{};
 if(input.action==='claim')return S.json(res,200,{job:S.checked(await db.rpc('portal_coding_claim',{p_worker:w.id}))});
 if(input.action!=='update'||!['running','published','failed','needs_attention'].includes(input.state)||! /^[0-9a-f-]{36}$/i.test(input.id||''))throw S.fail('Invalid update.');
 const patch={state:input.state,updated_at:new Date().toISOString()};
 if(input.summary!==undefined)patch.summary=String(input.summary).slice(0,3000);
 if(input.commit_sha!==undefined){if(!/^[a-f0-9]{40}$/.test(input.commit_sha))throw S.fail('Invalid commit.');patch.commit_sha=input.commit_sha;}
 const rows=S.checked(await db.from('portal_coding_jobs').update(patch).eq('id',input.id).eq('worker_id',w.id).eq('state','running').select('id'));
 if(!rows.length)throw S.fail('Job lease is no longer active.',409);
 S.checked(await db.from('portal_coding_workers').update({last_seen_at:new Date().toISOString()}).eq('id',w.id));
 return S.json(res,200,{ok:true});
 }catch(e){return S.json(res,e.status||503,{error:e.status?e.message:'Coding worker unavailable.'});}
};
