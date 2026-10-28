export async function mountTraining(root,request,{introOnly=false}={}){
 if(root.dataset.mounted)return;root.dataset.mounted='true';
 const videos=[...document.querySelectorAll('video[data-training-lesson]')];
 const review=document.getElementById('crmTrainingReview');
 let data,disposed=false,queue=Promise.resolve();
 const run=fn=>{const next=queue.then(fn);queue=next.catch(()=>{});return next;};
 const message=text=>{const el=root.querySelector('[data-training-message]');if(el)el.textContent=text;};
 root.innerHTML=`<h2>${introOnly?'Step 1: Meet Turnly':'Finish your required playbook'}</h2><p>${introOnly?'Watch this introduction, then read and sign your agreement below. Your playbook opens after signing.':'Watch both videos and read every section below. Confirm each section at its end, then finish your review.'} Progress is saved. Skipping ahead does not earn completion.</p><div data-training-progress></div><p role="status" data-training-message>Loading your progress…</p><button type="button" class="sales-secondary-button" data-training-retry hidden style="display:none">Retry loading progress</button>`;
 review.innerHTML='<h2>Confirm your playbook review</h2><p>Review the sales process, product facts, communication consent, and do-not-contact rules above.</p><label style="display:flex;gap:12px;align-items:flex-start"><input type="checkbox" data-training-reviewed disabled style="width:20px;height:20px;flex:none"> I have reviewed the Team playbook and understand the sales process, gift-card terms, communication consent, and do-not-contact requirements.</label><button type="button" class="sales-primary-button" data-training-ack disabled style="margin-top:16px">Confirm playbook review</button><p role="status" data-review-message></p>';
 const check=review.querySelector('[data-training-reviewed]'),ack=review.querySelector('[data-training-ack]');
 function paint(){
  if(disposed||!root.isConnected)return;
  root.querySelector('[data-training-progress]').replaceChildren(...data.lessons.filter(l=>!introOnly||l.id==='introduction').map(l=>{const p=document.createElement('p');p.textContent=`${l.completed_at?'✓ Complete':'In progress'} — ${l.title}: ${l.completed_at?100:Math.min(99,Math.floor((l.watched_seconds||0)/l.seconds*100))}%`;return p;}));
  const watched=data.lessons.every(l=>l.completed_at);
  const read=(data.sections||[]).filter(s=>s.completed_at).length===10;
  check.disabled=!watched||!read||data.ready;check.checked=!!data.acknowledged_at||check.checked;
  ack.disabled=!watched||!read||!check.checked||data.ready;
  review.querySelector('[data-review-message]').textContent=data.ready?'Training complete. Your CRM is unlocked.':`Finish both videos and confirm every reading section. ${(data.sections||[]).filter(s=>s.completed_at).length} of 10 sections reviewed.`;
  message(introOnly?'After the introduction, sign your agreement to open the playbook.':data.ready?'All training complete — CRM unlocked.':'The rest of the CRM stays locked until every video and reading section is complete.');
  document.querySelectorAll('[data-playbook-confirm]').forEach(b=>{if(data.sections?.some(s=>s.section===b.dataset.playbookConfirm&&s.completed_at)){b.disabled=true;b.textContent='✓ Section reviewed';b.dataset.complete='true';}});
  for(const v of videos){const l=data.lessons.find(l=>l.id===v.dataset.trainingLesson);v.dataset.trainingComplete=String(!!l?.completed_at);v.dataset.trainingWatched=String(l?.watched_seconds||0);}
 }
 check.onchange=()=>{ack.disabled=!check.checked||!data?.lessons.every(l=>l.completed_at)||(data.sections||[]).filter(s=>s.completed_at).length!==10||data.ready;};
 ack.textContent='Finish playbook and open CRM';
 ack.onclick=async()=>{ack.disabled=true;try{data=await request({action:'acknowledge',reviewed:check.checked});paint();if(data.ready)location.assign('sales.html');}catch(e){review.querySelector('[data-review-message]').textContent=e.message;paint();}};
 videos.forEach(v=>{v.pause();v.controls=false;});
 try{data=await request({action:'status'});if(!root.isConnected)return;paint();}
 catch(e){message(e.message);const retry=root.querySelector('[data-training-retry]');retry.hidden=false;retry.style.display="";retry.onclick=()=>{delete root.dataset.mounted;void mountTraining(root,request,{introOnly});};return;}
 const timers=[];
 let observer;
 if(!introOnly){
  observer=new IntersectionObserver(entries=>entries.forEach(entry=>{entry.target.dataset.visible=String(entry.isIntersecting);}),{threshold:1});
  document.querySelectorAll('[data-playbook-confirm]').forEach(b=>{
   observer.observe(b);let seconds=0,started=false,starting=false;
   b.onclick=async()=>{b.disabled=true;try{const result=await run(()=>request({action:'section',section:b.dataset.playbookConfirm,complete:true}));data.sections=result.sections;paint();}catch(e){message(e.message);b.disabled=false;}};
   timers.push(setInterval(async()=>{
    if(!root.isConnected){observer.disconnect();return;}
    if(b.dataset.complete==='true'||b.dataset.visible!=='true'||document.hidden||!document.hasFocus())return;
    if(!started){if(starting)return;starting=true;try{await run(()=>request({action:'section',section:b.dataset.playbookConfirm,complete:false}));started=true;}catch(e){message(e.message);}finally{starting=false;}return;}
    seconds++;if(seconds>=9){b.disabled=false;b.textContent='I have read this section';}
   },1000));
  });
 }
 for(const v of videos){
  const lesson=data.lessons.find(l=>l.id===v.dataset.trainingLesson);if(!lesson)continue;
  let session,starting=false;
  v.controls=true;
  const resume=()=>{if(!lesson.completed_at&&lesson.watched_seconds>0)v.currentTime=Math.min(lesson.watched_seconds,v.duration||lesson.seconds);};
  if(v.readyState)resume();else v.addEventListener('loadedmetadata',resume,{once:true});
  async function save(start=false){
   if(disposed||!root.isConnected||lesson.completed_at||(!session&&!start))return;
   const values={action:'progress',lesson:lesson.id,session,position:v.currentTime,start};
   try{
    const progress=await run(()=>request(values));Object.assign(lesson,progress);paint();
    if(!lesson.completed_at&&v.currentTime>(lesson.watched_seconds||0)+1.5&&!start){v.currentTime=lesson.watched_seconds||0;message('Resuming from your saved progress. Keep this video playing at normal speed.');}
   }catch(e){session=null;v.pause();message(e.message+' Press Play to retry.');}
  }
  v.addEventListener('play',async()=>{
   if(lesson.completed_at||starting)return;
   if(document.hidden){v.pause();return;}
   videos.filter(other=>other!==v).forEach(other=>other.pause());
   starting=true;session=crypto.randomUUID();await save(true);starting=false;
  });
  v.addEventListener('seeking',()=>{if(!lesson.completed_at&&v.currentTime>(lesson.watched_seconds||0)+1){v.currentTime=lesson.watched_seconds||0;message('Watch from your saved position to complete this video. Chapter shortcuts become available after watching.');}});
  v.addEventListener('ratechange',()=>{if(!lesson.completed_at&&v.playbackRate!==1)v.playbackRate=1;});
  v.addEventListener('pause',()=>{if(!starting)void save();});
  v.addEventListener('ended',()=>void save());
  timers.push(setInterval(()=>{if(!root.isConnected){disposed=true;timers.forEach(clearInterval);document.removeEventListener('visibilitychange',visibility);return;}if(!v.paused&&!v.seeking&&!starting&&!document.hidden)void save();},4000));
 }
 function visibility(){if(document.hidden)videos.forEach(v=>v.pause());}
 document.addEventListener('visibilitychange',visibility);
}
