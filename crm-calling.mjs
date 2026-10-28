export function installCalling({request,onStatus=()=>{}}) {
 let device,call,busy=false,timer,started=0,generation=0;
 const style=document.createElement('style');style.textContent=`.crm-phone-dock{position:fixed;bottom:24px;right:24px;width:min(360px,calc(100vw - 32px));z-index:10000;background:#fff;color:#13374b;border:1px solid #cbdde3;border-radius:18px;padding:24px;box-shadow:0 12px 40px #15344630;font:15px/1.5 system-ui}.crm-phone-dock h2{margin:0 0 8px;font-size:22px}.crm-phone-dock button{cursor:pointer;border-radius:8px;border:1px solid #b6cdd5;background:#eef6f7;color:#173c4b;padding:10px 14px;font:inherit}.crm-phone-dock .dial{background:#008578;color:white;border:0}.crm-phone-dock .hangup{background:#b42332;color:white;border:0}.crm-phone-dock button:disabled{opacity:.5;cursor:default}.crm-phone-buttons{display:flex;gap:10px;flex-wrap:wrap}.crm-phone-keypad{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:12px 0}.crm-phone-dock ol{max-height:180px;overflow:auto;padding-left:20px}.crm-phone-dock [hidden]{display:none!important}.crm-phone-dock small{color:#536d7c}`;document.head.append(style);
 const dock=document.createElement('aside');dock.className='crm-phone-dock';dock.hidden=true;dock.setAttribute('aria-label','Call lead');
 dock.innerHTML=`<h2>Call lead</h2><p data-name></p><p role="status" aria-live="polite" data-status></p><p data-time></p><div class="crm-phone-buttons"><button class="dial" data-dial>Start call</button><button data-mute hidden aria-pressed="false">Mute</button><button class="hangup" data-end hidden>Hang up</button><button data-close>Close</button></div><div class="crm-phone-keypad" hidden>${'123456789*0#'.split('').map(n=>`<button data-digit="${n}" aria-label="Dial ${n}">${n}</button>`).join('')}</div><p data-training-gate hidden><a href="crm-onboarding.html">Complete onboarding to unlock calling →</a></p><p><small>Calls use your Turnly number and this device’s microphone. Calls are not recorded.</small></p><details><summary>Recent calls to this lead</summary><ol data-history></ol></details>`;
 document.body.append(dock);
 const el=s=>dock.querySelector(s),say=t=>el('[data-status]').textContent=t;
 let leadId,trainingReady=false;
 function controls(active){el('[data-dial]').hidden=active;el('[data-mute]').hidden=!active;el('[data-end]').hidden=!active;el('.crm-phone-keypad').hidden=!active;el('[data-close]').disabled=active;if(!active){el('[data-mute]').textContent='Mute';el('[data-mute]').setAttribute('aria-pressed','false');}}
 function finish(message){if(busy){setTimeout(()=>{void history();onStatus();},2000);setTimeout(()=>onStatus(),6000);}generation++;clearInterval(timer);call=null;busy=false;controls(false);el('[data-dial]').disabled=false;say(message);const old=device;device=null;if(old)old.destroy();}
 async function history(){
  const id=leadId;try{const data=await request({action:'history',lead_id:id});if(id!==leadId)return;
   el('[data-history]').replaceChildren();for(const c of data.calls){const li=document.createElement('li');li.textContent=`${new Date(c.created_at).toLocaleString()} · ${c.status} · ${c.duration_seconds}s`;el('[data-history]').append(li);}
   if(!data.calls.length)el('[data-history]').textContent='No calls yet.';
   trainingReady=data.training_ready===true;el('[data-dial]').disabled=!trainingReady||!data.ready;el('[data-training-gate]').hidden=trainingReady;if(!trainingReady)say('Complete the short introduction, playbook review, and seller agreement in Onboarding before making calls.');else if(!data.ready)say('Calling is awaiting Twilio activation.');
  }catch(e){say(e.message);}
 }
 document.addEventListener('click',e=>{const button=e.target.closest('[data-call-lead]');if(!button)return;e.preventDefault();dock.hidden=false;if(busy){say('Finish your current call before starting another.');return;}trainingReady=false;el('[data-dial]').disabled=true;leadId=button.dataset.callLead;el('[data-name]').textContent=button.dataset.callLabel||'Selected lead';el('[data-time]').textContent='';say('Ready to call');void history();});
 el('[data-close]').onclick=()=>{if(!busy)dock.hidden=true;};
 el('[data-dial]').onclick=async()=>{
  if(busy)return;if(!trainingReady){say('Complete your sales onboarding first.');return;}busy=true;const attempt=++generation;controls(true);el('[data-dial]').disabled=true;say('Connecting your microphone…');
  try{
   if(!window.Twilio?.Device)await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/assets/vendor/twilio-voice-2.18.5.min.js';script.onload=resolve;script.onerror=()=>{script.remove();reject(Error('Unable to load calling. Please refresh and try again.'));};document.head.append(script);});
   if(attempt!==generation)return;
   const data=await request({action:'prepare',lead_id:leadId});
   if(attempt!==generation)return;
   device=new window.Twilio.Device(data.token,{logLevel:1,closeProtection:true});
   device.on('error',()=>finish('Calling could not connect. Check your microphone permission and network, then try again.'));
   const connected=await device.connect({params:{Intent:data.intent}});if(attempt!==generation){connected.disconnect();return;}call=connected;controls(true);say('Dialing '+data.number+'…');
   call.on('ringing',()=>{say('Ringing…');setTimeout(()=>onStatus(),2000);});
   call.on('accept',()=>{say('Connected');setTimeout(()=>onStatus(),2000);started=Date.now();timer=setInterval(()=>{const s=Math.floor((Date.now()-started)/1000);el('[data-time]').textContent=`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;},1000);});
   call.on('disconnect',()=>finish('Call ended. The result will appear in recent calls.'));
   call.on('cancel',()=>finish('Call canceled.'));call.on('reject',()=>finish('Call declined.'));
   call.on('error',()=>finish('Call failed. Check microphone access and try again.'));
  }catch(e){if(attempt===generation)finish(e.message||'Unable to connect. Please try again.');}
 };
 el('[data-end]').onclick=()=>{call?.disconnect();finish('Call ended.');};
 el('[data-mute]').onclick=()=>{if(!call)return;const muted=!call.isMuted();call.mute(muted);el('[data-mute]').textContent=muted?'Unmute':'Mute';el('[data-mute]').setAttribute('aria-pressed',String(muted));};
 dock.addEventListener('click',e=>{const key=e.target.closest('[data-digit]');if(key&&call)call.sendDigits(key.dataset.digit);});
 el('details').ontoggle=()=>{if(el('details').open&&!busy)void history();};
 window.addEventListener('beforeunload',e=>{if(busy){e.preventDefault();e.returnValue='';}});
}
