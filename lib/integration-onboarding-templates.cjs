const S=require('./residential-server.cjs');
async function run(db,actor,action,input,key){
 const secret=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SERVICE_KEY||process.env.SUPABASE_SERVICE_ROLE||process.env.SUPABASE_SECRET_KEY;
 if(!secret)throw S.fail('Private onboarding connection unavailable.',503);
 const origin=require('./mobile-backend.cjs').backendOrigin();
 let path='/items',method='GET',body,headers={'Content-Type':'application/json'};
 if(!['list','save','reorder','document','document_link'].includes(action))throw S.fail('Unsupported template action.');
 if(input.id!==undefined&&input.id!==null&&!/^[\w-]{1,100}$/.test(input.id))throw S.fail('Invalid onboarding item.');
 if(action==='save'){
  if(!input.data||Array.isArray(input.data)||Object.keys(input.data).some(k=>!['kind','title','description','fields','fieldsText','videoUrl','required','active','requiresExpiration','requiresReview'].includes(k)))throw S.fail('Provide supported template fields.');
  if(input.id&&!Number.isFinite(input.expected_updated_at))throw S.fail('Read templates and supply current expected_updated_at timestamp number.');
  path=input.id?'/items/'+input.id:'/items';method='POST';body=JSON.stringify({...input.data,expectedUpdatedAt:input.expected_updated_at});
 }else if(action==='reorder'){
  if(!Array.isArray(input.ids)||input.ids.length>100||input.ids.some(x=>typeof x!=='string'||!/^\w[\w-]{0,99}$/.test(x))||new Set(input.ids).size!==input.ids.length)throw S.fail('Provide distinct existing item IDs in order.');
  path='/items/reorder';method='POST';body=JSON.stringify({ids:input.ids});
 }else if(action==='document'||action==='document_link'){
  if(!input.id)throw S.fail('Choose a template item.');path='/items/'+input.id+(action==='document'?'/document':'/document-link');
  if(action==='document'){
   if(typeof input.pdf_base64!=='string'||input.pdf_base64.length>3500000)throw S.fail('Provide a PDF up to 2.5 MB as base64.');
   body=Buffer.from(input.pdf_base64,'base64');if(body.subarray(0,5).toString()!=='%PDF-')throw S.fail('Provide a PDF.');
   if(typeof input.file_name!=='string'||input.file_name.length>180||!Number.isFinite(input.expected_updated_at)||typeof input.require_resign!=='boolean')throw S.fail('Provide file name, current timestamp and explicit require_resign boolean.');
   method='POST';headers={'Content-Type':'application/pdf','X-File-Name':encodeURIComponent(input.file_name),'X-Require-Resign':input.require_resign?'1':'0','X-Expected-Updated-At':String(input.expected_updated_at)};
  }
 }
 const r=await fetch(origin+'/onboarding/admin'+path,{method,headers:{...headers,'X-Supabase-Auth':secret,'X-Turnly-Integration-Id':key},body,redirect:'error',signal:AbortSignal.timeout(45000)});
 const result=await r.json();if(!r.ok)throw S.fail(result.error||'Native template operation failed.',r.status);return result;
}
module.exports={run};
