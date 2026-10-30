const SUPABASE_URL='https://nwnzdoveskthebfyndcs.supabase.co';
const SUPABASE_KEY='sb_publishable_0fESHyuQyVSySksGWO-HDA_FX4_r5fP';
let MODULES=[];
let session=null,accountReady=false,accountError='',refreshing=null;
try { session=JSON.parse(sessionStorage.getItem('turnly_academy_session')); } catch {}
const lessonKey=(m,i)=>`M${String(m.number).padStart(2,'0')}_L${String(i+1).padStart(2,'0')}`;
async function request(path,options={},authenticated=true){
  if(authenticated){if(!session)throw Error('Please sign in to your Turnly account.');if(session.expires_at*1000<Date.now()+60000)await refreshSession();}
  const response=await fetch(SUPABASE_URL+path,{...options,headers:{apikey:SUPABASE_KEY,...(authenticated?{Authorization:'Bearer '+session.access_token}:{}),'Content-Type':'application/json',...options.headers}});
  const body=await response.text();let data;try{data=JSON.parse(body)}catch{data=body}
  if(!response.ok)throw Error(data?.msg||data?.message||data?.error_description||data?.error||'The request could not be completed.');return data;
}
async function refreshSession(){if(!refreshing)refreshing=request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:session.refresh_token})},false).then(storeSession).catch(e=>{session=null;sessionStorage.removeItem('turnly_academy_session');throw e}).finally(()=>refreshing=null);await refreshing;}
function storeSession(data){session={...data,expires_at:Math.floor(Date.now()/1000)+data.expires_in};sessionStorage.setItem('turnly_academy_session',JSON.stringify(session));}
function loginView(){return `<section class="hero"><div class="eyebrow">TURNLY CONTRACTOR TRAINING</div><h1>Your standard.<br><span style="color:var(--green)">Your next chapter.</span></h1><p>Sign in with your existing Turnly contractor account to watch lessons and save your progress.</p></section><form id="login-form" class="card authform"><h2>Welcome to Turnly Academy</h2><label>Email address<input name="email" type="email" autocomplete="username" required></label><label>Password<input name="password" type="password" autocomplete="current-password" required></label><button class="btn" type="submit">Sign in →</button><p id="auth-error" role="alert">${esc(accountError)}</p><p class="muted">Use the account provided through your Turnly contractor portal. Contact your Turnly administrator if you need access or password assistance.</p></form>`;}
async function signIn(event){event.preventDefault();const form=event.currentTarget,button=form.querySelector('button');button.disabled=true;try{const data=new FormData(form);storeSession(await request('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email:data.get('email'),password:data.get('password')})},false));form.reset();await loadAccount();}catch(e){accountError=e.message;document.getElementById('auth-error').textContent=accountError;}finally{button.disabled=false;}}
async function loadAccount(){accountReady=false;try{
  const user=await request('/auth/v1/user');session.user=user;
  const allowed=await request('/rest/v1/rpc/current_user_has_role',{method:'POST',body:JSON.stringify({required_roles:['contractor','admin']})});if(!allowed)throw Error('This account needs a Turnly contractor or administrator role. Please contact your Turnly administrator.');
  MODULES=await request('/storage/v1/object/authenticated/turnly-academy/curriculum.json');
  const [lessons,attempts]=await Promise.all([request('/rest/v1/academy_learning_progress?select=lesson_key'),request('/rest/v1/academy_practice_attempts?select=module_number,score&order=created_at.asc')]);
  progress={};scores={};for(const m of MODULES){m.lessons.forEach((_,i)=>{if(lessons.some(r=>r.lesson_key===lessonKey(m,i)))progress[m.id+':'+i]=true;});for(const a of attempts.filter(a=>a.module_number===m.number)){const old=scores[m.id];scores[m.id]={best:Math.max(old?.best||0,a.score),last:a.score,attempts:(old?.attempts||0)+1};}}
  accountReady=true;accountError='';render();
}catch(e){accountError=e.message;session=null;sessionStorage.removeItem('turnly_academy_session');render();}}
async function signOut(){try{await request('/auth/v1/logout',{method:'POST'})}catch{}session=null;accountReady=false;progress={};scores={};sessionStorage.removeItem('turnly_academy_session');render();}
async function loadLessonVideo(){
 const player=document.getElementById('lesson-video');if(!player)return;
 globalThis.TurnlyTrainingVideo.mount(player,{status:document.getElementById('video-status'),retry:document.getElementById('video-retry'),source:async()=>{
  const data=await request('/storage/v1/object/sign/turnly-academy/'+player.dataset.file,{method:'POST',body:JSON.stringify({expiresIn:3600})});
  const path=data.signedURL||data.signedUrl;
  if(!path)throw Error('Video access could not be renewed.');
  return {url:path?.startsWith('https://')?path:SUPABASE_URL+'/storage/v1'+path,expiresAt:Date.now()+3600000};
 }});
}
async function saveLessonCompletion(m,i){await request('/rest/v1/academy_learning_progress',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates'},body:JSON.stringify({user_id:session.user.id,lesson_key:lessonKey(m,i)})});}
async function savePracticeAttempt(m,score){await request('/rest/v1/academy_practice_attempts',{method:'POST',body:JSON.stringify({user_id:session.user.id,module_number:m.number,score})});}

async function bootstrapPortalAccount(){
 try{
 const {createClient}=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.0/+esm');
 const client=createClient(SUPABASE_URL,SUPABASE_KEY);
 const result=await client.auth.getSession();
 session=result.data?.session||null;
 const requested=Number(new URLSearchParams(location.search).get('module'));
 if(requested>=1&&requested<=12){current=requested-1;page='course';}
 if(session)await loadAccount();
 }catch(e){accountError='Sign in to resume training.';render();}
}
