export function startOnboardingUnlock({blocked,refresh,visible=()=>!document.hidden,events=window,timers=window}){
 let busy=false,stopped=false;
 const check=async()=>{if(stopped||busy||!visible()||!blocked())return;busy=true;try{await refresh();}catch{/* Keep the gate closed and retry after a transient connection error. */}finally{busy=false;}};
 const interval=timers.setInterval(check,5000);
 events.addEventListener('focus',check);
 return ()=>{stopped=true;timers.clearInterval(interval);events.removeEventListener('focus',check);};
}
