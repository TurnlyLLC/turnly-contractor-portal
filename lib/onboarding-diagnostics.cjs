const {createHash}=require('node:crypto');
function caller(headers){
 const agent=String(headers['user-agent']||'');
 const kind=/^(node|bun|undici)(\/|$)/i.test(agent)?'server':/okhttp|CFNetwork|Darwin/i.test(agent)?'native':/Mozilla/i.test(agent)?'browser':'other';
 let page='none';
 try{const u=new URL(headers.referer);page=u.hostname==='portal.turnlypros.com'?(u.pathname.startsWith('/contractor-academy/')?'academy':u.pathname==='/contractor-onboarding.html'?'onboarding':'portal'):'external';}catch{}
 return {kind,page};
}
// Sample at most one completed status request per token/minute/instance. Store
// only one-way identifiers; never log headers, request bodies or form contents.
function createReporter({now=Date.now,write=entry=>console.info(JSON.stringify(entry)),maxEntries=2048}={}){
 const seen=new Map();
 return function start(headers){
  const token=String(headers.authorization||'').match(/^Bearer (.+)$/i)?.[1];
  if(!token)return ()=>{};
  const key=createHash('sha256').update(token).digest('hex').slice(0,16),at=now();
  if(seen.has(key)&&at-seen.get(key)<60000)return ()=>{};
  if(seen.size>=maxEntries){for(const [id,time] of seen)if(at-time>=60000)seen.delete(id);if(seen.size>=maxEntries)return ()=>{};}
  seen.set(key,at);const source=caller(headers);
  return status=>{try{write({event:'onboarding_status',session_fingerprint:key,caller:source.kind,page:source.page,started_at:new Date(at).toISOString(),duration_ms:Math.max(0,now()-at),status});}catch{}};
 };
}
module.exports={caller,createReporter};
