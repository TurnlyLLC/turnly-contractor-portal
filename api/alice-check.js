// Owner-authorized, fixed read-only smoke test. No arbitrary prompts or business writes.
const crypto=require('node:crypto'),S=require('../lib/residential-server.cjs'),I=require('../lib/integrations.cjs'),O=require('../lib/owner-openai.cjs'),V=require('../lib/owner-voice.cjs');
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');if(req.method!=='POST')return S.json(res,405,{error:'Use POST.'});
 const db=S.database();let id,keyId,used=0,started=false;
 try{
  const caller=await I.apiKey(db,req,'platform:full');const k=S.checked(await db.from('integration_keys').select('created_by').eq('id',caller).single()),c=V.config();if(k.created_by!==c.ownerId)throw S.fail('Owner required.',403);
  if(req.query?.diagnostic){
   if(!/^[a-f0-9-]{36}$/i.test(req.query.diagnostic))throw S.fail('Invalid diagnostic.');
   const check=S.checked(await db.from('owner_assistant_diagnostics').select('conversation_id,agent_id').eq('id',req.query.diagnostic).single());
   if(!check.conversation_id?.startsWith('resp_'))throw S.fail('No OpenAI response for this diagnostic.');
   const r=await O.read(c,check.conversation_id);return S.json(res,200,{status:r.status,error:r.error,usage:r.usage,output_types:r.output?.map(x=>x.type),output_errors:r.output?.map(x=>x.error).filter(Boolean)});
  }
  id=crypto.randomUUID();S.checked(await db.rpc('owner_assistant_diagnostic_reserve',{p_id:id,p_agent:'openai-migration-check',p_cents:100}));
  const key=I.issueKey();keyId=crypto.randomUUID();S.checked(await db.from('integration_keys').insert({id:keyId,name:'Alice OpenAI read-only verification',secret_hash:key.secret_hash,prefix:key.prefix,scopes:['contractors:read'],created_by:c.ownerId,expires_at:new Date(Date.now()+180000).toISOString(),deny_record_deletion:true}));
  const results=[];
  for(const mode of ['voice','text']){
   started=true;const r=await O.answer(c,null,key.secret,'Use the live contractor earnings report with limit 1. State the contractor count, YTD earnings, total paid and unpaid completed work. Do not change any records.',[],fetch,null,{mode,onConversation:async response_id=>{S.checked(await db.from('owner_assistant_diagnostics').update({conversation_id:response_id}).eq('id',id));},onCost:async n=>{used+=n;started=false;}});
   results.push({mode,reply:r.reply,cost_cents:r.aiCents,response_id:r.conversationId});started=false;
  }
  started=true;const audio=await require('../lib/owner-voice-openai.cjs').speech(c,"Thanks. What's up Ryan?");used+=audio.ttsCents;started=false;
  S.checked(await db.from('owner_assistant_diagnostics').update({state:'done',actual_cents:used,finished_at:new Date().toISOString(),billing_checked_at:new Date().toISOString()}).eq('id',id));
  return S.json(res,200,{ok:true,results,voice_bytes:audio.bytes.length,tts_cents:audio.ttsCents,total_cents:used});
 }catch(e){if(id)await db.from('owner_assistant_diagnostics').update({state:'unknown',...(!started?{actual_cents:used}:{}),finished_at:new Date().toISOString()}).eq('id',id);return S.json(res,e.status||503,{error:e.message,diagnostic_id:id});}
 finally{if(keyId)await db.from('integration_keys').update({revoked_at:new Date().toISOString()}).eq('id',keyId);}
};
