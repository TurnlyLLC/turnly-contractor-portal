const S=require('./residential-server.cjs'),D=require('./integration-documents.cjs'),crypto=require('node:crypto');
const uuid=v=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v||'');
const mime={'video/mp4':'mp4','video/quicktime':'mov','video/webm':'webm'},MAX=100*1024*1024;
async function run(db,actor,key,action,input){
 if(action==='start'){
  const allowed=['assignment_id','file_name','content_type','file_size','sha256','title','video_phase','notes'];
  if(Object.keys(input).some(k=>!allowed.includes(k))||!uuid(input.assignment_id)||!mime[input.content_type]||!Number.isInteger(input.file_size)||input.file_size<1||input.file_size>MAX||!/^[a-f0-9]{64}$/.test(input.sha256||''))throw S.fail('Provide an assignment UUID, supported video type/size up to100MB and SHA-256.');
  if(!['before','after','other'].includes(input.video_phase)||typeof input.file_name!=='string'||!input.file_name||/[\\/\x00-\x1f]/.test(input.file_name)||input.file_name.length>180)throw S.fail('Provide video_phase before/after/other and file name.');
  if(input.title!==undefined&&(typeof input.title!=='string'||input.title.length>200)||input.notes!==undefined&&(typeof input.notes!=='string'||input.notes.length>2000))throw S.fail('Invalid video title/notes.');
  S.checked(await db.from('assignment_blocks').select('id').eq('id',input.assignment_id).single());
  const id=D.documentId(input.assignment_id,input.sha256),path='integrations/'+input.assignment_id+'/'+id+'.'+mime[input.content_type],expires=Date.now()+7200000;
  const signed=S.checked(await db.storage.from('qa-videos').createSignedUploadUrl(path,{upsert:false}));
  return {upload_url:signed.signedUrl,method:'PUT',headers:{'Content-Type':input.content_type,'x-upsert':'false'},upload_ticket:D.sign({kind:'qa-video',spec:input,id,path,actor,key,expires}),expires_at:new Date(expires).toISOString(),instructions:'Upload original bytes, then qa.upload_complete. Keep signed URL/ticket private. Upload is not QA approval.'};
 }
 if(action!=='complete')throw S.fail('Unknown QA upload action.');
 const ticket=D.verify(input.upload_ticket,actor,key);if(ticket.kind!=='qa-video')throw S.fail('Not a QA upload ticket.');
 const {spec,id,path}=ticket;
 const prior=S.checked(await db.from('qa_videos').select('id,assignment_id').eq('id',id).maybeSingle());if(prior)return {...prior,duplicate:true};
 const job=S.checked(await db.from('assignment_blocks').select('id,property_id,portal_property_id,property_name,unit_name,assigned_to,claimed_by').eq('id',spec.assignment_id).single());
 const storage=db.storage.from('qa-videos'),parts=path.split('/'),name=parts.pop();const objects=S.checked(await storage.list(parts.join('/'),{search:name,limit:100}));
 if(Number(objects.find(x=>x.name===name)?.metadata?.size)!==spec.file_size)throw S.fail('Upload not found or size differs.',409);
 const blob=S.checked(await storage.download(path));if(blob.size!==spec.file_size||blob.size>MAX)throw S.fail('Size mismatch.',409);
 const bytes=Buffer.from(await blob.arrayBuffer());if(crypto.createHash('sha256').update(bytes).digest('hex')!==spec.sha256||(spec.content_type==='video/webm'?!bytes.subarray(0,4).equals(Buffer.from('1a45dfa3','hex')):bytes.subarray(4,8).toString()!=='ftyp'))throw S.fail('Video checksum or format mismatch.',409);
 const row={id,assignment_id:job.id,property_id:job.property_id,portal_property_id:job.portal_property_id,property_name:job.property_name,unit_name:job.unit_name,contractor_id:job.claimed_by||job.assigned_to,title:spec.title||spec.file_name,video_phase:spec.video_phase,notes:spec.notes||'',storage_bucket:'qa-videos',storage_path:path,file_name:spec.file_name,mime_type:spec.content_type,file_size:spec.file_size,uploaded_by:actor,source:'admin_upload',metadata:{source:'integration_upload',sha256:spec.sha256}};
 const result=await db.rpc('integration_attach_qa_video',{p_actor:actor,p_row:row});return S.checked(result);
}
module.exports={run,MAX};
