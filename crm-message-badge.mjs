let unread=0,refresh=()=>{},audio,toastTimer;
const muteKey='turnly-message-sound-muted';
const muted=()=>{try{return localStorage.getItem(muteKey)==='true';}catch{return false;}};
// Compare activity per conversation: another reply must alert even if unread count stays the same.
export function incomingMessages(previous,conversations){
 if(previous===null)return [];
 return conversations.filter(c=>c.unread&&c.at&&(!previous[c.id]||Date.parse(c.at)>Date.parse(previous[c.id])));
}
function unlockAudio(){
 try{const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;audio ||= new Audio();if(audio.state==='suspended')void audio.resume().catch(()=>{});}catch{}
}
function chime(){
 if(muted()||!audio||audio.state!=='running')return;
 try{const now=audio.currentTime;for(const [offset,hz] of [[0,740],[.13,988]]){const tone=audio.createOscillator(),gain=audio.createGain();tone.type='sine';tone.frequency.value=hz;gain.gain.setValueAtTime(0,now+offset);gain.gain.linearRampToValueAtTime(.08,now+offset+.015);gain.gain.exponentialRampToValueAtTime(.001,now+offset+.23);tone.connect(gain);gain.connect(audio.destination);tone.start(now+offset);tone.stop(now+offset+.25);tone.onended=()=>{tone.disconnect();gain.disconnect();};}}catch{}
}
function showAlert(messages){
 let toast=document.getElementById('crmMessageToast');if(toast)toast.remove();
 toast=document.createElement('aside');toast.id='crmMessageToast';toast.className='crm-message-toast';toast.setAttribute('role','status');
 const title=document.createElement('strong');title.textContent=messages.length>1?'New team messages':'New team message';
 const text=document.createElement('p');text.textContent=messages.length>1?`${messages.length} conversations have new replies.`:messages[0].subject||'A teammate sent you a message.';
 const link=document.createElement('a');link.href='crm-messages.html#'+encodeURIComponent(messages[0].id);link.textContent='Open message';
 const close=document.createElement('button');close.type='button';close.textContent='Dismiss';close.onclick=()=>toast.remove();
 toast.append(title,text,link,close);document.body.append(toast);clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.remove(),12000);chime();
}
export function paintMessageBadge(){
 for(const badge of document.querySelectorAll('[data-message-unread]')){
  badge.hidden=unread===0;
  badge.textContent=unread>99?'99+':String(unread);
  badge.setAttribute('aria-label',`${unread} unread conversation${unread===1?'':'s'}`);
 }
 for(const button of document.querySelectorAll('[data-message-sound]')){button.textContent=muted()?'Message sound: off':'Message sound: on';button.setAttribute('aria-pressed',String(!muted()));}
}
export function refreshMessageBadge(){return refresh();}
export function startMessageBadge(request){
 let pending=false,previous=null,account=null;
 refresh=async()=>{
  if(pending||document.hidden)return;
  pending=true;
  try{const result=await request({action:'unread'});unread=Math.max(0,Number(result.unread)||0);paintMessageBadge();
   const conversations=result.conversations||[];
   if(account!==result.user_id){account=result.user_id;previous=null;try{previous=JSON.parse(sessionStorage.getItem('turnly-message-seen:'+account)||'null');}catch{}}
   const fresh=incomingMessages(previous,conversations);
   previous=Object.fromEntries(conversations.map(c=>[c.id,c.at]));
   try{sessionStorage.setItem('turnly-message-seen:'+account,JSON.stringify(previous));}catch{}
   if(fresh.length)showAlert(fresh);
  }
  catch{/* Keep the last confirmed count during a temporary connection failure. */}
  finally{pending=false;}
 };
 void refresh();
 setInterval(refresh,20000);
 window.addEventListener('focus',refresh);
 document.addEventListener('visibilitychange',refresh);
 document.addEventListener('pointerdown',unlockAudio);
 document.addEventListener('keydown',unlockAudio);
 document.addEventListener('click',e=>{if(!e.target.closest?.('[data-message-sound]'))return;try{localStorage.setItem(muteKey,String(!muted()));}catch{}paintMessageBadge();});
}
