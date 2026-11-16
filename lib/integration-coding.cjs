const S=require('./residential-server.cjs');
async function run(db,actor,action,input){
 if(action==='status'){
  let query=db.from('portal_coding_jobs').select('id,state,created_at,updated_at,summary,commit_sha').eq('owner_id',actor).order('created_at',{ascending:false}).limit(5);
  if(input.id)query=query.eq('id',input.id);
  const jobs=S.checked(await query),workers=S.checked(await db.from('portal_coding_workers').select('last_seen_at').is('revoked_at',null).gt('expires_at',new Date().toISOString()).order('last_seen_at',{ascending:false}).limit(1));
  return {jobs,worker_online:!!workers[0]?.last_seen_at&&Date.now()-Date.parse(workers[0].last_seen_at)<90000};
 }
 if(action!=='submit'||typeof input.instructions!=='string'||input.instructions.trim().length<10||input.instructions.length>8000)throw S.fail('Describe the requested portal code change in 10–8000 characters.');
 if(input.publish!==true)throw S.fail('This connection requires publish=true for an explicitly requested automatic publication.');
 const status=await run(db,actor,'status',{});if(!status.worker_online)throw S.fail('The Codex worker is offline. Start it on the owner computer before submitting a code change.',503);
 const job=S.checked(await db.from('portal_coding_jobs').insert({owner_id:actor,instructions:input.instructions.trim()}).select('id,state,created_at').single());
 return {job,message:'Queued for Codex. This is not confirmation of publication; use coding.status for the result.'};
}
module.exports={run};
