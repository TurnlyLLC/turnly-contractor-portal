const crypto = require('node:crypto');
const S = require('./residential-server.cjs');
const {uuid} = require('./agent-referrals.cjs');
const BUCKET = 'contractor-documents', MAX = 20 * 1024 * 1024;
const TYPES = ['background_check','contractor_agreement','w9','insurance','policy_acknowledgement','license','agreement','tax_document','bank_verification','other'];
const MIME = {'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function signingKey() {
  if (!process.env.CRON_SECRET) throw S.fail('Document uploads are not configured.',503);
  return crypto.hkdfSync('sha256',process.env.CRON_SECRET,'turnly-document-upload','v1',32);
}
function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return body+'.'+crypto.createHmac('sha256',signingKey()).update(body).digest('base64url');
}
function verify(ticket, actor, key) {
  if(typeof ticket!=='string'||ticket.length>10000)throw S.fail('Invalid upload ticket.');
  const [body,mac,...extra]=ticket.split('.');
  const expected=crypto.createHmac('sha256',signingKey()).update(body||'').digest();
  const supplied=Buffer.from(mac||'','base64url');
  if(extra.length||supplied.length!==expected.length||!crypto.timingSafeEqual(supplied,expected))throw S.fail('Invalid upload ticket.',403);
  let value;try{value=JSON.parse(Buffer.from(body,'base64url').toString());}catch{throw S.fail('Invalid upload ticket.');}
  if(value.actor!==actor||value.key!==key)throw S.fail('This upload belongs to a different connection.',403);
  if(!Number.isFinite(value.expires)||value.expires<Date.now())throw S.fail('Upload ticket expired. Start again with the same file.',409);
  return value;
}
function validate(input) {
  const allowed=['profile_id','file_name','content_type','file_size','sha256','document_type','title','notes','expiration_date'];
  if(Object.keys(input).some(k=>!allowed.includes(k)))throw S.fail('Unsupported upload field. Uploads cannot approve reports or change checklist status.');
  if(!uuid(input.profile_id))throw S.fail('Choose a contractor profile ID.');
  if(typeof input.file_name!=='string'||!input.file_name.trim()||input.file_name.length>180||/[\\/\x00-\x1f]/.test(input.file_name))throw S.fail('Provide a file name without a path.');
  if(!Object.hasOwn(MIME,input.content_type))throw S.fail('Upload a PDF, JPEG, PNG, or WebP file.');
  if(!Number.isInteger(input.file_size)||input.file_size<1||input.file_size>MAX)throw S.fail('Files must be between 1 byte and 20 MB.');
  if(!/^[a-f0-9]{64}$/.test(input.sha256||''))throw S.fail('Provide the file SHA-256 checksum in lowercase hexadecimal.');
  if(!TYPES.includes(input.document_type))throw S.fail('Choose a supported document type.');
  for(const [field,max] of [['title',200],['notes',2000]])if(input[field]!==undefined&&(typeof input[field]!=='string'||input[field].length>max))throw S.fail('Invalid '+field+'.');
  if(input.expiration_date&&(!/^\d{4}-\d{2}-\d{2}$/.test(input.expiration_date)||!Number.isFinite(Date.parse(input.expiration_date))||new Date(input.expiration_date).toISOString().slice(0,10)!==input.expiration_date))throw S.fail('Use a valid YYYY-MM-DD expiration date.');
  return {...input,profile_id:input.profile_id.toLowerCase()};
}
function documentId(profile,hash) {
  const b=Buffer.from(sha('turnly-document-v1:'+profile+':'+hash).slice(0,32),'hex');
  b[6]=(b[6]&15)|80;b[8]=(b[8]&63)|128;
  const h=b.toString('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
async function profile(db,id) {
  const p=S.checked(await db.from('profiles').select('id,role,contractor_approved,full_name,email,status').eq('id',id).maybeSingle());
  if(!p||(p.role!=='contractor'&&!p.contractor_approved))throw S.fail('Contractor profile not found.',404);
  if(['deleted','deletion_pending'].includes(p.status))throw S.fail('This contractor account is being deleted.',409);
  return p;
}
async function existing(db,id) {
  return S.checked(await db.from('contractor_documents').select('id,profile_id,document_type,title,status,file_name,updated_at,metadata').eq('id',id).maybeSingle());
}
const summary=(doc,duplicate=false)=>({document:{id:doc.id,profile_id:doc.profile_id,document_type:doc.document_type,title:doc.title,status:doc.status,file_name:doc.file_name,updated_at:doc.updated_at},duplicate,uploaded:true,approval_changed:false,checklist_changed:false});
function signatureMatches(bytes,type) {
  if(type==='application/pdf')return bytes.subarray(0,5).toString()==='%PDF-';
  if(type==='image/jpeg')return bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  if(type==='image/png')return bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'));
  return type==='image/webp'&&bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';
}
async function run(db,actor,key,action,input) {
  if(action==='upload_start') {
    const spec=validate(input);await profile(db,spec.profile_id);
    const id=documentId(spec.profile_id,spec.sha256),doc=await existing(db,id);
    if(doc)return summary(doc,true);
    const path=`integrations/${spec.profile_id}/${id}.${MIME[spec.content_type]}`;
    const expires=Date.now()+2*60*60*1000;
    const ticket=sign({spec,id,path,actor,key,expires});
    const signed=S.checked(await db.storage.from(BUCKET).createSignedUploadUrl(path,{upsert:false}));
    return {upload_ticket:ticket,upload_url:signed.signedUrl,method:'PUT',headers:{'Content-Type':spec.content_type,'x-upsert':'false'},expires_at:new Date(expires).toISOString(),max_file_size:MAX,instructions:'PUT the raw local file bytes to upload_url. Keep the URL and ticket private. Then call documents.upload_complete with upload_ticket. A storage Already Exists response can be followed by completion, which verifies the checksum. Do not report success until completion returns the document. No portal login or API key is needed for this one-file URL.'};
  }
  if(action!=='upload_complete')throw S.fail('Unknown document operation.');
  if(Object.keys(input).some(k=>k!=='upload_ticket'))throw S.fail('Only upload_ticket is accepted.');
  const {spec,id,path}=verify(input.upload_ticket,actor,key),p=await profile(db,spec.profile_id);
  const prior=await existing(db,id);if(prior)return summary(prior,true);
  const storage=db.storage.from(BUCKET),parts=path.split('/'),name=parts.pop();
  const objects=S.checked(await storage.list(parts.join('/'),{search:name,limit:100}));
  const object=objects.find(o=>o.name===name);
  if(!object)throw S.fail('File not uploaded yet. Transfer the bytes before completing.',409);
  if(Number(object.metadata?.size)!==spec.file_size)throw S.fail('Uploaded size does not match the declared file.',409);
  const blob=S.checked(await storage.download(path));
  if(blob.size!==spec.file_size||blob.size>MAX)throw S.fail('Uploaded size does not match the declared file.',409);
  const bytes=Buffer.from(await blob.arrayBuffer());
  if(sha(bytes)!==spec.sha256||!signatureMatches(bytes,spec.content_type))throw S.fail('File checksum or format verification failed. No document was attached.',409);
  const row={id,profile_id:p.id,contractor_key:p.id,contractor_name:p.full_name||'',contractor_email:p.email||'',document_type:spec.document_type,title:spec.title?.trim()||spec.file_name,status:'uploaded',expiration_date:spec.expiration_date||null,storage_bucket:BUCKET,storage_path:path,file_name:spec.file_name,mime_type:spec.content_type,file_size:spec.file_size,notes:spec.notes||'',created_by:actor,uploaded_by:actor,uploaded_at:new Date().toISOString(),metadata:{source:'integration_upload',sha256:spec.sha256,integration_key_id:key}};
  const saved=await db.from('contractor_documents').insert(row).select('id,profile_id,document_type,title,status,file_name,updated_at').single();
  if(saved.error?.code==='23505'){const duplicate=await existing(db,id);if(duplicate)return summary(duplicate,true);}
  return summary(S.checked(saved));
}
module.exports={run,validate,verify,sign,documentId,signatureMatches,MAX};
