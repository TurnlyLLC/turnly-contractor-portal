const crypto=require('node:crypto'),https=require('node:https'),dns=require('node:dns').promises,net=require('node:net');
const S=require('./residential-server.cjs');
const SCOPES=require('./integration-catalog.cjs').scopes;
const EVENTS=require('./integration-catalog.cjs').events;
const fail=S.fail,checked=S.checked;
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
function choices(value,allowed){if(!Array.isArray(value)||!value.length||value.some(x=>!allowed.includes(x)))throw fail('Choose at least one supported permission or event.');return [...new Set(value)];}
function label(v){if(typeof v!=='string'||!v.trim()||v.length>80)throw fail('Enter a name of 1–80 characters.');return v.trim();}
async function activeAdmin(db,id){const p=checked(await db.from('profiles').select('role,status').eq('id',id).maybeSingle());return !!p&&['admin','owner','super_admin'].includes(p.role)&&p.status==='active';}
async function admin(db,req){const id=await S.admin(db,req);if(!await activeAdmin(db,id))throw fail('Active admin access is required.',403);return id;}
function issueKey(){const secret='tl_live_'+crypto.randomBytes(32).toString('base64url');return {secret,secret_hash:hash(secret),prefix:secret.slice(0,16)};}
function seal(secret,id,master=process.env.CRON_SECRET){if(!master)throw fail('Webhook signing is not configured.',503);const key=crypto.hkdfSync('sha256',master,'turnly-webhooks','v1',32),iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(id));const bytes=Buffer.concat([cipher.update(secret),cipher.final()]);return [iv,cipher.getAuthTag(),bytes].map(x=>x.toString('base64')).join('.');}
function unseal(value,id,master=process.env.CRON_SECRET){if(!master)throw fail('Webhook signing is not configured.',503);const [iv,tag,bytes]=value.split('.').map(x=>Buffer.from(x,'base64')),key=crypto.hkdfSync('sha256',master,'turnly-webhooks','v1',32),cipher=crypto.createDecipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(id));cipher.setAuthTag(tag);return Buffer.concat([cipher.update(bytes),cipher.final()]).toString();}
function urlValue(value){let u;try{u=new URL(value);}catch{throw fail('Enter a valid HTTPS webhook URL.');}if(u.protocol!=='https:'||u.username||u.password||u.hash||(u.port&&u.port!=='443')||u.hostname.length>253||u.href.length>2000)throw fail('Use a public HTTPS URL on port 443 without credentials or fragments.');return u;}
const blocked=new net.BlockList();
for(const [ip,bits] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',3]])blocked.addSubnet(ip,bits,'ipv4');
const publicIp=ip=>net.isIP(ip)===4&&!blocked.check(ip,'ipv4');
async function resolveTarget(value,resolve=dns.resolve4){const u=urlValue(value);let addresses;try{addresses=net.isIP(u.hostname)?[u.hostname]:await resolve(u.hostname);}catch{throw fail('Webhook hostname could not be resolved.');}if(!addresses.length||addresses.some(ip=>!publicIp(ip)))throw fail('Webhooks must resolve to a public IPv4 address.');return {u,address:addresses[0]};}
function signature(secret,timestamp,body){return crypto.createHmac('sha256',secret).update(timestamp+'.'+body).digest('hex');}
async function send(value,secret,event){
 const {u,address}=await resolveTarget(value),body=JSON.stringify(event),timestamp=String(Math.floor(Date.now()/1000));
 return new Promise((resolve,reject)=>{
  // Pin the validated address to prevent DNS rebinding. TLS still verifies the original hostname.
  const req=https.request(u,{method:'POST',agent:false,lookup:(_host,options,cb)=>options.all?cb(null,[{address,family:4}]):cb(null,address,4),headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body),'User-Agent':'Turnly-Webhooks/1','X-Turnly-Event-Id':event.id,'X-Turnly-Timestamp':timestamp,'X-Turnly-Signature':'v1='+signature(secret,timestamp,body)}},res=>{resolve(res.statusCode);res.destroy();});
  const timer=setTimeout(()=>req.destroy(new Error('Delivery timed out.')),10000);
  req.on('close',()=>clearTimeout(timer));req.on('error',reject);req.end(body);
 });
}
async function manage(db,user,input){
 const action=input.action;
 if(action==='list')return {catalog:require('./integration-catalog.cjs').catalog(),audit:checked(await db.from('integration_audit').select('id,key_id,operation,status,http_status,duration_ms,created_at').order('created_at',{ascending:false}).limit(50)),scopes:SCOPES,events:EVENTS,keys:checked(await db.from('integration_keys').select('id,name,prefix,scopes,created_at,expires_at,revoked_at,last_used_at').order('created_at',{ascending:false}).limit(200)),hooks:checked(await db.from('integration_hooks').select('id,name,url,events,enabled,created_at').order('created_at',{ascending:false}).limit(100)),deliveries:checked(await db.from('integration_deliveries').select('id,hook_id,event_type,status,attempts,last_status,last_error,created_at,delivered_at').order('created_at',{ascending:false}).limit(50))};
 if(action==='create_key'){
  const name=label(input.name),scopes=choices(input.scopes,SCOPES),days=Number(input.days);
  if(scopes.includes('platform:full')&&input.confirm_full!==true)throw fail('Confirm full access to all supported business API operations.');
  if(![0,30,90,365].includes(days))throw fail('Choose 30, 90, or 365 days.');
  const key=issueKey();checked(await db.from('integration_keys').insert({name,scopes,created_by:user,secret_hash:key.secret_hash,prefix:key.prefix,expires_at:days?new Date(Date.now()+days*86400000).toISOString():null}));
  return {secret:key.secret};
 }
 if(!/^[0-9a-f-]{36}$/i.test(String(input.id||''))&&!['create_hook'].includes(action))throw fail('Choose a valid integration.');
 if(action==='revoke_key'){checked(await db.from('integration_keys').update({revoked_at:new Date().toISOString()}).eq('id',input.id).is('revoked_at',null));return {ok:true};}
 if(action==='create_hook'){
  const name=label(input.name),events=choices(input.events,EVENTS),{u}=await resolveTarget(input.url),id=crypto.randomUUID(),secret='whsec_'+crypto.randomBytes(32).toString('base64url');
  checked(await db.from('integration_hooks').insert({id,name,url:u.href,events,created_by:user,secret_encrypted:seal(secret,id)}));return {secret};
 }
 if(action==='toggle_hook'){if(typeof input.enabled!=='boolean')throw fail('Choose enabled or paused.');checked(await db.from('integration_hooks').update({enabled:input.enabled}).eq('id',input.id));return {ok:true};}
 if(action==='test_hook'){
  const hook=checked(await db.from('integration_hooks').select('id,enabled').eq('id',input.id).maybeSingle());if(!hook?.enabled)throw fail('Enable this webhook before testing.');
  checked(await db.from('integration_deliveries').insert({hook_id:hook.id,event_type:'integration.test',payload:{message:'Turnly connection test. No customer data.'}}));return {ok:true};
 }
 if(action==='retry_delivery'){
  const d=checked(await db.from('integration_deliveries').select('id,hook_id,status').eq('id',input.id).maybeSingle());if(!d||!['failed','cancelled'].includes(d.status))throw fail('Only failed or cancelled deliveries can be retried.');
  const h=checked(await db.from('integration_hooks').select('enabled').eq('id',d.hook_id).maybeSingle());if(!h?.enabled)throw fail('Enable the webhook first.');
  checked(await db.from('integration_deliveries').update({status:'pending',attempts:0,next_attempt_at:new Date().toISOString(),last_error:null}).eq('id',d.id).in('status',['failed','cancelled']));return {ok:true};
 }
 throw fail('Unknown action.');
}
async function apiKey(db,req,scope){
 const token=String(req.headers.authorization||'').replace(/^Bearer /i,'');
 if(!/^tl_live_[A-Za-z0-9_-]{43}$/.test(token))throw fail('A valid API key is required.',401);
 const r=await db.rpc('integration_use_key',{p_hash:hash(token),p_scope:scope});
 if(r.error){if(r.error.message.includes('scope_denied'))throw fail('This key does not have the required permission.',403);throw fail('API authentication is unavailable.',503);}
 if(!r.data)throw fail('API key is invalid, expired, or revoked.',401);
 if(r.data==='00000000-0000-0000-0000-000000000000')throw fail('Rate limit exceeded. Retry after one minute.',429);
 return r.data;
}
function leadInput(input){
 const allowed=['name','contact_email','contact_phone','sales_city','sales_state'];
 if(Object.keys(input).some(k=>!allowed.includes(k)))throw fail('Unsupported field. Only name, contact_email, contact_phone, sales_city, and sales_state are accepted.');
 const data=Object.fromEntries(allowed.map(k=>[k,String(input[k]||'').trim()]));
 if(!data.name||data.name.length>160||(!data.contact_email&&!data.contact_phone))throw fail('Provide a name and email or phone.');
 if(data.contact_email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.contact_email))throw fail('Enter a valid email.');
 if(data.contact_phone&&data.contact_phone.replace(/\D/g,'').length<10)throw fail('Enter a complete phone number.');
 if(Object.values(data).some(v=>v.length>254))throw fail('Field is too long.');
 return data;
}
async function publicApi(db,req){
 const resource=req.query?.resource||'leads',method=req.method;
 if(!['leads','bookings'].includes(resource))throw fail('Unknown resource.',404);
 if(method!=='GET'&&!(method==='POST'&&resource==='leads'))throw fail('Method not allowed.',405);
 const key=await apiKey(db,req,resource+':'+(method==='GET'?'read':'create'));
 if(method==='POST'){
  const request=String(req.headers['idempotency-key']||'');if(!/^[A-Za-z0-9_-]{8,100}$/.test(request))throw fail('Supply an Idempotency-Key header of 8–100 letters, digits, hyphens, or underscores.');
  const data=leadInput(await S.body(req)),r=await db.rpc('integration_create_lead',{p_key:key,p_request:request,p_hash:hash(JSON.stringify(data)),p_data:data});
  if(r.error){if(r.error.message.includes('idempotency_conflict'))throw fail('This Idempotency-Key was already used with different data.',409);throw fail('Unable to create lead. Retry with the same Idempotency-Key.',503);}return r.data;
 }
 const limit=Math.floor(Math.min(100,Math.max(1,Number(req.query?.limit)||50))),after=req.query?.after,id=req.query?.id;
 if((after&&!/^[0-9a-f-]{36}$/i.test(after))||(id&&!/^[0-9a-f-]{36}$/i.test(id)))throw fail('Invalid record ID.');
 let q=db.from(resource==='leads'?'sales_leads':'referral_bookings').select(resource==='leads'?'id,name,contact_name,contact_email,contact_phone,sales_city,sales_state,pipeline_stage,created_at,updated_at':'id,status,payment_status,service_date,amount_cents,created_at').order('id').limit(limit+1);
 if(resource==='leads')q=q.eq('business_segment','residential');
 if(after)q=q.gt('id',after);if(id)q=q.eq('id',id);
 const rows=checked(await q);return {data:rows.slice(0,limit),next_cursor:rows.length>limit?rows[limit-1].id:null};
}
async function deliver(db){
 const rows=checked(await db.rpc('integration_claim_deliveries')),results=[];
 for(const d of rows){
  const h=checked(await db.from('integration_hooks').select('*').eq('id',d.hook_id).maybeSingle());
  if(!h?.enabled||!await activeAdmin(db,h.created_by)){checked(await db.from('integration_deliveries').update({status:'cancelled',last_error:'Webhook paused or owner no longer active.'}).eq('id',d.id));continue;}
  let status,error;
  try{status=await send(h.url,unseal(h.secret_encrypted,h.id),{id:d.id,type:d.event_type,created_at:d.created_at,data:d.payload});if(status<200||status>=300)error='Receiver returned HTTP '+status;}
  catch{error='Delivery failed: check the receiver URL, TLS, DNS, and availability.';}
  const ok=!error;
  checked(await db.from('integration_deliveries').update({status:ok?'delivered':d.attempts>=8?'failed':'pending',last_status:status||null,last_error:error||null,delivered_at:ok?new Date().toISOString():null,next_attempt_at:new Date(Date.now()+Math.min(86400,60*2**d.attempts)*1000).toISOString()}).eq('id',d.id).eq('attempts',d.attempts));
  results.push({id:d.id,delivered:ok});
 }
 return {processed:results.length};
}
module.exports={SCOPES,EVENTS,admin,manage,publicApi,apiKey,deliver,issueKey,choices,hash,seal,unseal,publicIp,resolveTarget,signature,leadInput};
