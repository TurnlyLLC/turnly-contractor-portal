const key='turnly-desktop-messages';
let registration;
const optedIn=()=>{try{return localStorage.getItem(key)==='true';}catch{return false;}};
export function desktopState(){
 if(!('Notification' in window)||!('serviceWorker' in navigator))return 'unsupported';
 if(Notification.permission==='denied')return 'blocked';
 return Notification.permission==='granted'&&optedIn()?'on':'off';
}
async function worker(){
 if(!registration)registration=navigator.serviceWorker.register('/crm-notifications-worker.js',{scope:'/crm-notifications/'}).catch(e=>{registration=null;throw e;});
 const reg=await registration;
 if(!reg.active)await new Promise((resolve,reject)=>{const sw=reg.installing||reg.waiting;if(!sw)return reject(Error('Notification setup is not ready. Try again.'));const timeout=setTimeout(()=>reject(Error('Notification setup timed out. Try again.')),15000);sw.addEventListener('statechange',()=>{if(sw.state==='activated'){clearTimeout(timeout);resolve();}else if(sw.state==='redundant'){clearTimeout(timeout);reject(Error('Notification setup failed. Try again.'));}});});
 return reg;
}
export function paintDesktopControl(){
 const state=desktopState();
 for(const b of document.querySelectorAll('[data-message-desktop]')){
  b.textContent=state==='on'?'Desktop alerts: on':state==='blocked'?'Desktop alerts blocked':state==='unsupported'?'Desktop alerts unavailable':'Enable desktop alerts';
  b.setAttribute('aria-pressed',String(state==='on'));b.disabled=state==='unsupported';
  b.title='Receive notifications while this portal tab is open in the background. Browser sleep and Do Not Disturb may delay or silence alerts.';
 }
}
export async function toggleDesktop(){
 if(desktopState()==='on'){localStorage.setItem(key,'false');paintDesktopControl();return;}
 if(desktopState()==='blocked')throw Error('Notifications are blocked. Allow notifications for sales.turnlypros.com in your browser site settings, then try again.');
 if(desktopState()==='unsupported')throw Error('Use a desktop browser that supports notifications.');
 const permission=await Notification.requestPermission();
 if(permission!=='granted'){paintDesktopControl();return;}
 await worker();localStorage.setItem(key,'true');paintDesktopControl();
}
export async function notifyDesktop(messages,silent=false){
 if(desktopState()!=='on'||!messages.length)return;
 const reg=await worker(),message=messages[0];
 await reg.showNotification('New Turnly team message',{
  body:messages.length>1?`${messages.length} conversations have new messages. Open your Turnly inbox.`:'You have a new internal message. Click to open your Turnly inbox.',
  icon:'/favicon-32x32.png',tag:'turnly-message-'+message.id+'-'+message.at,
  silent,data:{thread:message.id},
 });
}
