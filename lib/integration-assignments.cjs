const S=require('./residential-server.cjs');
const uuid=v=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v||'');
async function run(db,actor,action,input){
 if(!uuid(input.id)||!input.expected_updated_at||!Number.isFinite(Date.parse(input.expected_updated_at)))throw S.fail('Read the assignment first and provide its id and expected_updated_at.');
 const patch={};
 if(action==='reassign'){
  if(!uuid(input.contractor_id))throw S.fail('Choose the contractor by their record ID.');
  patch.contractor_id=input.contractor_id;
 }else if(action==='set_pay'){
  if(typeof input.pay_amount!=='number'||!Number.isFinite(input.pay_amount)||input.pay_amount<0||!Number.isSafeInteger(Math.round(input.pay_amount*100))||Math.abs(input.pay_amount*100-Math.round(input.pay_amount*100))>0.00001)throw S.fail('Enter a nonnegative dollar amount with at most two decimal places.');
  patch.pay_amount=input.pay_amount;
 }else throw S.fail('Unknown assignment operation.');
 if(typeof input.reason!=='string'||!input.reason.trim()||input.reason.length>1000)throw S.fail('Provide a short reason for the change.');
 const result=await db.rpc('integration_assignment_change',{p_actor:actor,p_id:input.id,p_expected:input.expected_updated_at,p_patch:patch,p_reason:input.reason.trim()});
 if(result.error){const message=result.error.message||'';throw S.fail(/conflict/i.test(message)?'Assignment changed. Read it again before retrying.':/paid|payout/i.test(message)?'This assignment has a recorded or pending payout; reconcile that payment before changing its contractor or pay.':/contractor/i.test(message)?'Choose an active contractor.':'The assignment change could not be applied.',/conflict/i.test(message)?409:400);}
 return {assignment:result.data};
}
module.exports={run};
