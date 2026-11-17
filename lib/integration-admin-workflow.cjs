const S=require('./residential-server.cjs');
async function run(db,actor,action,input){
 const r=await db.rpc('integration_admin_workflow',{p_actor:actor,p_operation:action,p_input:input});
 if(r.error)throw S.fail(r.error.code==='P0001'?r.error.message:'Workflow failed. Read current state before retrying.',409);
 return {result:r.data};
}
module.exports={run};
