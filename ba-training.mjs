import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.0/+esm';
import {shell,esc} from './ba-shell.mjs';
import {bookingSlides,mountBookingSlides} from './ba-booking-slides.mjs';
const env=window.__ENV||{},client=createClient(env.SUPABASE_URL,env.SUPABASE_ANON_KEY),root=document.querySelector('#baApp'),memberId=new URL(location.href).searchParams.get('member_id');
let state,selected=location.hash.slice(1),busy=false;
async function api(action,values={}){
 const {data:{session}}=await client.auth.getSession();
 const r=await fetch('/api/ba-training',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+(session?.access_token||'')},body:JSON.stringify({action,member_id:memberId,...values}),signal:AbortSignal.timeout(30000)}),x=await r.json();
 if(r.status===401)location.replace('ba-login.html');
 if(r.status===428)location.replace('ba-onboarding.html');
 if(!r.ok)throw Error(x.error||'Please retry.');return x;
}
function notice(text){const el=document.querySelector('#baMessage');el.hidden=false;el.className='ba-note';el.textContent=text;}
function player(media,lessonId,walkthrough=false){
 if(!media.video_path)return `<iframe class="ba-training-player" src="${esc(media.video_url)}?fullscreen=1" title="${esc(media.title)} video" allow="autoplay; fullscreen" allowfullscreen loading="lazy" referrerpolicy="no-referrer"></iframe>`;
 return `<div class="ba-video"><video class="ba-training-player ba-native-player" controls playsinline preload="metadata" data-lesson="${lessonId}" data-walkthrough="${walkthrough}" aria-label="${esc(media.title)} video" ${walkthrough?'poster="assets/ba-training/01-start.png"':''}></video><p class="ba-media-status" role="status">Loading video…</p><button type="button" class="ba-secondary" data-retry-video hidden>Reload video</button></div>`;
}
async function loadPlayer(video){
 const box=video.closest('.ba-video'),status=box.querySelector('.ba-media-status'),retry=box.querySelector('button');
 status.textContent='Loading video…';retry.hidden=true;
 video.onloadedmetadata=()=>{status.textContent='Use the player controls for volume, playback speed and fullscreen.';};
 video.onerror=()=>{status.textContent='Video could not load. Reload it to refresh playback, or use the written lesson below.';retry.hidden=false;};
 retry.onclick=()=>loadPlayer(video);
 try{const r=await api('media',{lesson_id:video.dataset.lesson,walkthrough:video.dataset.walkthrough==='true'});if(video.isConnected)video.src=r.url;}catch(e){if(video.isConnected){status.textContent=e.message;retry.hidden=false;}}
}
function bookingGuide(){
 const w=state.course.walkthrough;
 return `<section class="ba-booking-guide"><p class="ba-eyebrow">ACTUAL TURNLY BOOKING SCREENS</p><h3>${esc(w.title)}</h3><p>${esc(w.disclosure)}</p>${bookingSlides(w.steps)}<details><summary>Watch the narrated walkthrough video</summary>${player(w,'services',true)}</details></section>`;
}
function portalGuide(lesson){
 const w=lesson.walkthrough;
 return `<section class="ba-booking-guide"><p class="ba-eyebrow">ACTUAL TURNLY PORTAL SCREENS</p><h3>${esc(w.title)}</h3><p>${esc(w.disclosure)}</p>${bookingSlides(w.steps,true)}</section><details><summary>Watch the portal orientation video</summary>${player(lesson,lesson.id)}</details>`;
}
function render(){
 const c=state.course,done=new Set(state.progress.map(p=>p.lesson_id)),lesson=c.lessons.find(l=>l.id===selected);
 const overview=`<section class="ba-banner"><div><p class="ba-eyebrow">TURNLY BRAND AMBASSADOR ACADEMY</p><h2>Learn the process. Practice the conversation.</h2><p>Eight narrated lessons plus a guided booking walkthrough · about ${Math.round((c.lessons.reduce((n,l)=>n+l.duration_seconds,0)+(c.walkthrough?.duration_seconds||0))/60)} minutes of video, plus practice. Watch, review the notes, complete the exercise, then answer both questions correctly.</p><div class="ba-progress"><span style="width:${done.size/c.lessons.length*100}%"></span></div><strong>${done.size} of ${c.lessons.length} lessons complete</strong><p><a class="ba-primary" href="#services">Watch the booking walkthrough →</a></p><p>Your completed knowledge checks are saved to your account, so you can return and continue anytime.</p></div></section>`;
 const cards=`<div class="ba-document-grid">${c.lessons.map(l=>`<article class="ba-document-card"><p class="ba-eyebrow">LESSON ${l.order} · ${Math.round(l.duration_seconds/60)} MIN VIDEO ${done.has(l.id)?'· ✓ COMPLETE':''}</p><h3>${esc(l.title.replace('Turnly ',''))}</h3><p>${esc(l.objective)}</p><a class="ba-primary" href="#${l.id}">${done.has(l.id)?'Review lesson':'Start lesson'} →</a></article>`).join('')}</div>`;
 const detail=lesson?`<section class="ba-panel ba-training-lesson"><a href="#">← All lessons</a><p class="ba-eyebrow">LESSON ${lesson.order} OF ${c.lessons.length}${done.has(lesson.id)?' · COMPLETE':''}</p><h2>${esc(lesson.title)}</h2><p>${esc(lesson.objective)}</p>${lesson.id==='services'?bookingGuide()+'<details><summary>Service overview video</summary>'+player(lesson,lesson.id)+'</details>':lesson.walkthrough?portalGuide(lesson):player(lesson,lesson.id)}<details><summary>Written lesson notes</summary>${lesson.sections.map(([title,summary,narration])=>`<section><h3>${esc(title)}</h3><p><strong>${esc(summary)}</strong></p><p>${esc(narration)}</p></section>`).join('')}</details><section class="ba-training-practice"><h3>Put it into practice</h3><p>${esc(lesson.activity)}</p><p>Use fictional examples for role-play. Do not create test customers, bookings or earnings.</p></section><h3>Knowledge check</h3>${state.read_only?'<p>Admin preview: completion is recorded only when the ambassador submits their own check.</p>':''}<form id="knowledgeCheck">${lesson.questions.map((q,i)=>`<fieldset><legend>${i+1}. ${esc(q.question)}</legend>${q.options.map((o,j)=>`<label class="ba-training-choice"><input type="radio" name="q${i}" value="${j}" required ${state.read_only?'disabled':''}><span>${esc(o)}</span></label>`).join('')}</fieldset>`).join('')}<label class="ba-training-choice"><input type="checkbox" name="practiced" required ${state.read_only?'disabled':''}><span>I reviewed this lesson and completed the practice exercise.</span></label><button class="ba-primary" ${state.read_only?'disabled':''}>Check answers & save completion</button></form><div id="trainingFeedback" role="status" tabindex="-1"></div><p>${lesson.order<c.lessons.length?`<a href="#${c.lessons[lesson.order].id}">Next lesson →</a>`:'<a href="#">Return to your course progress →</a>'}</p></section>`:'';
 root.innerHTML=shell(lesson?detail:overview+cards+`<section class="ba-panel"><h2>Program reference</h2><p>Reviewed ${esc(c.reviewed_at)}. Use current Turnly terms and booking information if a procedure changes. Ask <a href="mailto:admin@turnlypros.com">admin@turnlypros.com</a> about unclear situations.</p>${c.sources.map(s=>`<p><a href="${s.url}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a></p>`).join('')}</section>`,'training',state.name,state.read_only);
 mountBookingSlides(root.querySelector('.ba-slides'),lesson?.walkthrough?.steps||c.walkthrough?.steps||[]);
 root.querySelectorAll('video[data-lesson]').forEach(loadPlayer);
 if(memberId&&state.read_only)root.querySelectorAll('a[href^="ba-onboarding.html"],a[href^="ba-training.html"]').forEach(a=>{const u=new URL(a.href);u.searchParams.set('member_id',memberId);a.href=u.href;});
}
async function load(){state=await api('course');render();}
root.addEventListener('submit',async e=>{
 if(e.target.id!=='knowledgeCheck')return;e.preventDefault();if(busy)return;
 const form=e.target,lesson=state.course.lessons.find(l=>l.id===selected),answers=lesson.questions.map((_,i)=>Number(form.elements['q'+i].value)),practiced=form.elements.practiced.checked;busy=true;
 const controls=form.querySelectorAll('input,button');controls.forEach(el=>el.disabled=true);
 try{const r=await api('check',{lesson_id:lesson.id,version:state.course.version,answers,practiced});if(r.passed&&!state.progress.some(p=>p.lesson_id===lesson.id))state.progress.push({lesson_id:lesson.id});
 if(selected!==lesson.id){notice(r.passed?'Lesson complete — progress saved.':'Check submitted; return to the lesson to retry.');return;}
 const feedback=document.querySelector('#trainingFeedback');feedback.innerHTML=`<h3>${r.passed?'Lesson complete — progress saved':`${r.score} of ${r.total} correct — review and retry`}</h3>${r.feedback.map(f=>`<p>${f.correct?'✓':'Review:'} ${esc(f.question)}<br><strong>${esc(f.explanation)}</strong></p>`).join('')}`;feedback.focus();
 }catch(e){notice(e.message);}finally{busy=false;controls.forEach(el=>el.disabled=false);}
});
root.addEventListener('click',async e=>{if(e.target.closest('[data-action="logout"]')){await client.auth.signOut();location.replace('ba-login.html');}});
window.addEventListener('hashchange',()=>{selected=location.hash.slice(1);if(state){render();window.scrollTo(0,0);}});
try{await load();}catch(e){root.innerHTML=`<main class="ba-signup-card"><h1>Training unavailable</h1><p>${esc(e.message)}</p><a href="ba-training.html">Try again</a> · <a href="ba-login.html">Sign in</a></main>`;}
