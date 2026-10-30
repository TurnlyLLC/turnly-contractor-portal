// No keystrokes, notes, or message content are collected: only activity timestamps.
export async function startActivityClock(client,page){
 let pending=false,busy=false,closed=false,lastActivity=Date.now(),inCall=false,timer,watchdog;
 const workPages=new Set(['leads','pipeline','tasks','scripts','messages','dashboard']);
 const note=document.createElement('div');note.setAttribute('role','status');note.style.cssText='position:fixed;bottom:12px;left:240px;z-index:9999;background:#fff4d6;color:#453511;border:1px solid #c9a24b;border-radius:10px;padding:10px 16px;max-width:70vw';note.hidden=true;document.body.append(note);
 async function request(action){const {data}=await client.auth.getSession();if(!data?.session)throw Object.assign(Error('Sign in again.'),{expired:true});const active=pending;pending=false;
  const r=await fetch('/api/crm-productivity',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+data.session.access_token},body:JSON.stringify({action,active,work:document.visibilityState==='visible'&&workPages.has(page)}),signal:AbortSignal.timeout(12000)});
  const result=await r.json();if(!r.ok){if(active)pending=true;throw Object.assign(Error(result.error||'Time tracking is unavailable.'),{expired:r.status===401});}return result;}
 async function logout(){if(closed)return;closed=true;clearInterval(timer);clearInterval(watchdog);try{await request('logout');}catch{}await client.auth.signOut({scope:'local'});location.replace('sales-login.html?reason=inactive');}
 async function tick(action='heartbeat'){
  if(closed||busy)return;busy=true;
  try{const r=await request(action);lastActivity=Date.now()-(new Date(r.server_now)-new Date(r.last_activity_at));inCall=r.in_call;
   const left=Math.ceil((300000-(Date.now()-lastActivity))/1000);note.hidden=inCall||left>60;note.textContent=`You will be signed out in ${Math.max(0,left)} seconds without activity. Continue working to stay signed in.`;
  }catch(e){if(e.expired){await logout();}else{note.hidden=false;note.textContent='Connection interrupted. Active work time may not be recorded until reconnected.';if(Date.now()-lastActivity>=300000&&!inCall)await logout();}}finally{busy=false;}
 }
 const action=e=>{if(e.isTrusted&&document.visibilityState==='visible'){pending=true;if(Date.now()-lastActivity>240000)void tick();}};
 for(const name of ['pointerdown','keydown','scroll','touchstart'])document.addEventListener(name,action,{passive:true,capture:true});
 await tick('start');if(closed)return {stop:async()=>{},closed:true};
 timer=setInterval(()=>void tick(),15000);
 watchdog=setInterval(()=>{if(!inCall&&!pending&&Date.now()-lastActivity>=300000)void logout();},1000);
 document.addEventListener('visibilitychange',()=>void tick());
 client.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'){closed=true;clearInterval(timer);clearInterval(watchdog);note.remove();location.replace('sales-login.html');}});
 return {closed:false,stop:async()=>{if(closed)return;closed=true;clearInterval(timer);clearInterval(watchdog);await request('logout');note.remove();}};
}
