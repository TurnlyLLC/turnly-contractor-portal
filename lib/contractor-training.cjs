const modules=require('./contractor-academy-modules.json');
const fail=(message,status=503)=>Object.assign(new Error(message),{status});
async function rows(db,id=null){
 if(id===null){
  const all=[];
  for(let offset=0;;offset+=500){
   const result=await db.rpc('contractor_training_status',{p_profile:null}).order('profile_id').order('module_number').range(offset,offset+499);
   if(result.error||!Array.isArray(result.data))throw fail('Training progress is unavailable. Please retry.');
   all.push(...result.data);if(result.data.length<500)return all;
  }
 }
 const result=await db.rpc('contractor_training_status',{p_profile:id});
 if(result.error||!Array.isArray(result.data))throw fail('Training progress is unavailable. Please retry.');
 return result.data;
}
function items(rows,id){
 const progress=modules.map(m=>{
  const r=rows.find(r=>r.profile_id===id&&r.module_number===m.number);
  if(!r)throw fail('Training progress is incomplete. Please retry.');
  return r;
 });
 const waived=progress.every(r=>r.waived===true),completed=progress.filter(r=>r.lessons_done===5&&r.score>=90).length;
 const lessons=progress.reduce((sum,r)=>sum+r.lessons_done,0),quizzes=progress.filter(r=>r.score>=90).length;
 return [{id:'academy-training',title:'Contractor training',kind:'academy',required:true,waived,state:waived||completed===modules.length?'done':lessons||quizzes?'in_progress':'todo',
  description:`${lessons} of 60 lessons complete · ${quizzes} of 12 quizzes passed. Progress syncs from Turnly Academy.`,
  trainingUrl:'/contractor-academy/index.html',revision:Object.fromEntries(progress.map(r=>[r.module_number,r.revision||null])),
  lessonsDone:lessons,quizzesPassed:quizzes,submission:null}];
}
function merge(file,training){
 const all=[...(file.items||[]),...training],required=all.filter(i=>i.required);
 return {...file,items:all,requiredCount:required.length,doneCount:required.filter(i=>i.state==='done').length,complete:file.complete!==false&&required.every(i=>i.state==='done')};
}
async function withTraining(db,id,file){return merge(file,items(await rows(db,id),id));}
async function requirement(db,actor,id,input){
 if(input.item_id!=='academy-training'||typeof input.required!=='boolean')throw fail('Choose a training requirement.',400);
 const result=await db.rpc('set_contractor_training_required',{p_actor:actor,p_profile:id,p_required:input.required,p_expected_revisions:input.expected_revision||{}});
 if(result.error)throw fail(result.error.code==='P0001'?result.error.message:'Training requirement could not be saved.',409);
 return {ok:true};
}
module.exports={rows,items,merge,withTraining,requirement};
