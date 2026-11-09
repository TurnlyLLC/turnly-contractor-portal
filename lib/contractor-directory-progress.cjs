const modules=require('./contractor-academy-modules.json');
function academy(rows,id){
 const selected=modules.map(m=>{const r=rows.find(r=>r.profile_id===id&&Number(r.module_number)===m.number);return r?{number:m.number,title:m.title,lessons:Math.max(0,Math.min(5,Number(r.lessons_done)||0)),score:Number(r.score)||0,waived:r.waived===true}:null;});
 if(selected.some(r=>!r))return {profile_id:id,available:false,error:'Training progress is incomplete. Refresh to retry.'};
 const lessons=selected.reduce((n,r)=>n+r.lessons,0),quizzes=selected.filter(r=>r.score>=90).length,total=modules.length*6,done=lessons+quizzes;
 return {profile_id:id,available:true,lessons,lessonsTotal:modules.length*5,quizzes,quizzesTotal:modules.length,done,total,percent:Math.floor(done/total*100),complete:done===total,waived:selected.every(r=>r.waived),requirementComplete:selected.every(r=>r.waived||(r.lessons===5&&r.score>=90)),modules:selected};
}
function combine(contractors,remote,progress){
 const ids=new Set(contractors.map(p=>p.id)),training=new Map(progress.map(p=>[p.profile_id,p]));
 return remote.filter(p=>ids.has(p.userId)).map(p=>{const t=training.get(p.userId),total=Number(p.requiredCount),done=Number(p.doneCount),available=Number.isInteger(total)&&total>0&&Number.isInteger(done)&&done>=0&&done<=total;
 return {...p,onboarding:{available,done:available?done:0,total:available?total:0,complete:available&&p.complete===true,review:Number(p.needsReview)||0},complete:!!p.complete&&!!t?.available&&t.requirementComplete,doneCount:(available?done:0)+(t?.requirementComplete?1:0),requiredCount:(available?total:0)+1};});
}
module.exports={academy,combine};
