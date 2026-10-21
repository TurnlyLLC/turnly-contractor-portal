// Separate scope: no fetch handler or changes to portal caching.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 const id=String(event.notification.data?.thread||'');
 const path='/crm-messages.html'+(/^[0-9a-f-]{36}$/i.test(id)?'#'+id:'');
 const url=new URL(path,self.location.origin).href;
 event.waitUntil((async()=>{
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  // Do not navigate away from a rep's unsaved lead form.
  const inbox=windows.find(c=>new URL(c.url).origin===self.location.origin&&new URL(c.url).pathname==='/crm-messages.html');
  if(inbox){await inbox.navigate(url);return inbox.focus();}
  return self.clients.openWindow(url);
 })());
});
