const S=require('../lib/residential-server.cjs'),A=require('../lib/ambassadors.cjs'),course=require('../lib/ba-training-course.json'),walkthrough=require('../lib/ba-booking-walkthrough.json');
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return S.json(res,405,{error:'Method not allowed.'});
 try{
  const x=await S.body(req),db=S.database(),actor=await A.access(db,req);
  const id=actor.admin&&x.member_id?x.member_id:actor.id;
  const member=S.checked(await db.from('ba_members').select('user_id,name').eq('user_id',id).maybeSingle());
  if(x.action==='media'){
   const lesson=course.lessons.find(l=>l.id===x.lesson_id);
   if(!lesson)throw S.fail('Choose a course lesson.');
   const media=x.walkthrough===true&&lesson.id==='services'?walkthrough:lesson;
   if(!media.video_path)throw S.fail('This video is not available yet.',404);
   const signed=S.checked(await db.storage.from('turnly-academy').createSignedUrl(media.video_path,3600));
   return S.json(res,200,{url:signed.signedUrl});
  }
  if(x.action==='course'){
   const progress=member?S.checked(await db.from('ba_training_progress').select('lesson_id,completed_at,score').eq('user_id',id).eq('course_version',course.version)):[];
   return S.json(res,200,{course:{...course,walkthrough,lessons:course.lessons.map(l=>({...l,questions:l.questions.map(([question,options])=>({question,options}))}))},progress,name:member?.name||'Turnly Admin',read_only:actor.admin});
  }
  if(x.action!=='check')throw S.fail('Choose a training action.');
  if(actor.admin)throw S.fail('Ambassadors complete their own knowledge checks.',403);
  if(!member)throw S.fail('Ambassador account required.',403);
  const lesson=course.lessons.find(l=>l.id===x.lesson_id);
  if(!lesson||x.version!==course.version)throw S.fail('Reload the current course before submitting.',409);
  if(x.practiced!==true||!Array.isArray(x.answers)||x.answers.length!==lesson.questions.length||x.answers.some((a,i)=>!Number.isInteger(a)||a<0||a>=lesson.questions[i][1].length))throw S.fail('Answer every question and confirm that you completed the practice exercise.');
  const feedback=lesson.questions.map(([question,options,answer],i)=>({question,correct:x.answers[i]===answer,explanation:options[answer]})),score=feedback.filter(f=>f.correct).length,passed=score===lesson.questions.length;
  if(passed)S.checked(await db.from('ba_training_progress').upsert({user_id:actor.id,course_version:course.version,lesson_id:lesson.id,score,completed_at:new Date().toISOString()},{onConflict:'user_id,course_version,lesson_id',ignoreDuplicates:true}));
  return S.json(res,200,{passed,score,total:lesson.questions.length,feedback});
 }catch(e){return S.json(res,e.status||503,{error:e.status?e.message:'Training could not be loaded or saved. Please retry.'});}
};
