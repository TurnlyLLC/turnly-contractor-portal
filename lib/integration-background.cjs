const S=require('./residential-server.cjs'),{uuid}=require('./agent-referrals.cjs');
async function run(db,key,action,input){
 const approve=action==='approve';
 if(!['review','approve'].includes(action)||!uuid(input.document_id))throw S.fail('Choose a background-check document.');
 const fields=approve?['document_id','expected_updated_at','background_version','expected_submission_id','reference','reviewed_and_approved']:['document_id'];
 if(Object.keys(input).some(k=>!fields.includes(k)))throw S.fail('Unsupported background-review field.');
 if(approve){
  if(!Number.isInteger(input.background_version)||input.background_version<0||!input.expected_updated_at||!Number.isFinite(Date.parse(input.expected_updated_at))||!Object.hasOwn(input,'expected_submission_id')||(input.expected_submission_id!==null&&typeof input.expected_submission_id!=='string'))throw S.fail('Read the background review and supply its current versions before approval.');
  if(typeof input.reference!=='string'||!input.reference.trim()||input.reference.length>120)throw S.fail('Provide the report reference (1–120 characters).');
 }
 const r=await db.rpc('integration_background_review',{p_key:key,p_document:input.document_id,p_approve:approve,...(approve?{p_expected_updated_at:input.expected_updated_at,p_version:input.background_version,p_expected_submission_id:input.expected_submission_id,p_reference:input.reference}:{})});
 if(r.error)throw S.fail(r.error.code==='P0001'?r.error.message:'Background approval could not be completed. Read the current review before retrying.',r.error.code==='P0001'?409:503);
 return r.data;
}
module.exports={run};
