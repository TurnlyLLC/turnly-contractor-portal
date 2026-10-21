let unread=0,refresh=()=>{};
export function paintMessageBadge(){
 for(const badge of document.querySelectorAll('[data-message-unread]')){
  badge.hidden=unread===0;
  badge.textContent=unread>99?'99+':String(unread);
  badge.setAttribute('aria-label',`${unread} unread conversation${unread===1?'':'s'}`);
 }
}
export function refreshMessageBadge(){return refresh();}
export function startMessageBadge(request){
 let pending=false;
 refresh=async()=>{
  if(pending||document.hidden)return;
  pending=true;
  try{const result=await request({action:'unread'});unread=Math.max(0,Number(result.unread)||0);paintMessageBadge();}
  catch{/* Keep the last confirmed count during a temporary connection failure. */}
  finally{pending=false;}
 };
 void refresh();
 setInterval(refresh,20000);
 window.addEventListener('focus',refresh);
 document.addEventListener('visibilitychange',refresh);
}
