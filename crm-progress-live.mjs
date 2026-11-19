const eventName='crm-outreach-updated',storageKey='crm-outreach-updated';
export function notifyOutreach(){
 document.dispatchEvent(new Event(eventName));
 try{localStorage.setItem(storageKey,String(Date.now())+Math.random());}catch{}
}
export function watchProgress(root,refresh,enabled=()=>true,env=globalThis){
 if(!env.document||!env.window)return ()=>{};
 const doc=env.document,win=env.window;
 let busy=false,stopped=false,pending=false;
 async function update(){
  if(!root.isConnected){stop();return;}
  if(stopped||doc.hidden||!enabled())return;
  if(busy){pending=true;return;}
  // Keep a member's search input stable while they are typing.
  if(root.contains(doc.activeElement)&&doc.activeElement?.matches('input,select,textarea'))return;
  busy=true;try{await refresh();}catch{}finally{busy=false;if(pending){pending=false;void update();}}
 }
 const storage=e=>{if(e.key===storageKey)void update();};
 const timer=env.setInterval(update,30000);
 doc.addEventListener(eventName,update);doc.addEventListener('visibilitychange',update);
 win.addEventListener('focus',update);win.addEventListener('storage',storage);win.addEventListener('pagehide',stop);
 const observer=env.MutationObserver?new env.MutationObserver(()=>{if(!root.isConnected)stop();}):null;
 observer?.observe(doc.documentElement,{childList:true,subtree:true});
 function stop(){if(stopped)return;stopped=true;env.clearInterval(timer);observer?.disconnect();doc.removeEventListener(eventName,update);doc.removeEventListener('visibilitychange',update);win.removeEventListener('focus',update);win.removeEventListener('storage',storage);win.removeEventListener('pagehide',stop);}
 return stop;
}
export function preserveProgressView(root,paint){
 const batches=[...root.querySelectorAll('[data-flat-batch]')].map(b=>({open:b.querySelector('details')?.open,search:b.querySelector('[data-flat-search]')?.value,filter:b.querySelector('[data-flat-filter]')?.value,scroll:b.querySelector('.sales-table-wrap')?.scrollTop}));
 paint();
 root.querySelectorAll('[data-flat-batch]').forEach((b,i)=>{const state=batches[i];if(!state)return;const details=b.querySelector('details'),search=b.querySelector('[data-flat-search]'),filter=b.querySelector('[data-flat-filter]'),table=b.querySelector('.sales-table-wrap');if(details)details.open=state.open;if(search)search.value=state.search||'';if(filter){filter.value=state.filter||'all';filter.onchange?.();}if(table)table.scrollTop=state.scroll||0;});
}
