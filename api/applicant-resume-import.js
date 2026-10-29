const S=require('../lib/residential-server.cjs');
const {createHash}=require('node:crypto');
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return S.json(res,405,{error:'Use POST.'});
 try{
  const db=S.database();await S.admin(db,req);
  let raw=req.body;if(!raw){raw='';for await(const c of req){raw+=c.toString();if(raw.length>4200000)throw S.fail('Resume exceeds 3 MB.',413);}}
  const input=typeof raw==='string'?JSON.parse(raw):raw;
  if(JSON.stringify(input).length>4200000)throw S.fail('Resume exceeds 3 MB.',413);
  const bytes=Buffer.from(String(input.data||''),'base64'),hash=createHash('sha256').update(bytes).digest('hex');
  if(!bytes.length||bytes.length>3*1024*1024)throw S.fail('Choose a resume up to 3 MB.');
  const rows=S.checked(await db.from('recruiting_applications').select('id,answers,resume_path').eq('role','cleaner').eq('answers->>import_resume_sha256',hash).is('deleted_at',null));
  if(rows.length!==1)throw S.fail('This file does not match exactly one imported applicant.',409);
  const a=rows[0],name=a.answers.import_resume_name,ext=String(name).split('.').pop().toLowerCase();
  const mime={pdf:'application/pdf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',txt:'text/plain'}[ext];
  if(!mime)throw S.fail('Unsupported resume format.');
  if(a.resume_path)return S.json(res,200,{ok:true,already_attached:true});
  const path='resumes/'+a.id+'/import-'+hash+'.'+ext;
  const upload=await db.storage.from('recruiting-private').upload(path,bytes,{contentType:mime,upsert:false});
  if(upload.error&&!['409','Duplicate'].includes(String(upload.error.statusCode||upload.error.error)))S.checked(upload);
  S.checked(await db.from('recruiting_applications').update({resume_path:path,resume_name:name}).eq('id',a.id).is('resume_path',null));
  return S.json(res,200,{ok:true});
 }catch(e){return S.json(res,e.status||500,{error:e.status?e.message:'Unable to attach resume. Retry or contact support.'});}
};
