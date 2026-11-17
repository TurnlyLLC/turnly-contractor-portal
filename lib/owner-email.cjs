const crypto=require('node:crypto'),S=require('./residential-server.cjs'),I=require('./integrations.cjs'),{uuid}=require('./agent-referrals.cjs');
const MAILBOXES={admin:'admin@turnlypros.com',ops:'ops@turnlypros.com'};
function validate(action,x){
 if(!Object.hasOwn(MAILBOXES,x.mailbox))throw S.fail('Choose admin or ops mailbox. Personal Gmail is disconnected.');
 if(!['search','read','profile'].includes(action))throw S.fail('Email supports read and search only.',403);
 if(action==='search'&&(typeof x.query!=='string'||x.query.length<1||x.query.length>1000))throw S.fail('Provide a Gmail search query up to 1,000 characters.');
 if(action==='read'&&!/^[a-f0-9]{10,32}$/i.test(x.id||''))throw S.fail('Use a message ID returned by search.');
 if(x.page_token!==undefined&&(typeof x.page_token!=='string'||x.page_token.length>1000))throw S.fail('Invalid next page token.');
}
function gmailURL(action,x){validate(action,x);const base='https://gmail.googleapis.com/gmail/v1/users/'+encodeURIComponent(MAILBOXES[x.mailbox]);
 if(action==='profile')return base+'/profile';
 if(action==='read')return base+'/messages/'+x.id+'?format=full';
 const q=new URLSearchParams({q:x.query,maxResults:'10',includeSpamTrash:'false'});if(x.page_token)q.set('pageToken',x.page_token);return base+'/messages?'+q;
}
async function verify(db,x){
 if(!uuid(x.id)||typeof x.ticket!=='string'||x.ticket.length>15000||!Object.hasOwn(MAILBOXES,x.mailbox))throw S.fail('Invalid email request.',403);
 let payload;try{payload=JSON.parse(I.unseal(x.ticket,x.id));}catch{throw S.fail('Invalid email request.',403);}
 if(payload.mailbox!==x.mailbox||payload.expires<Date.now()||payload.actor!==process.env.TURNLY_OWNER_VOICE_ADMIN_ID)throw S.fail('Expired or mismatched email request.',403);
 const claimed=S.checked(await db.rpc('owner_email_claim',{p_id:x.id,p_actor:payload.actor,p_hash:I.hash(x.ticket)}));if(claimed!==true)throw S.fail('Email request already used or expired.',403);
 return{url:gmailURL(payload.action,payload),mailbox:payload.mailbox};
}
function message(m){
 const headers=Object.fromEntries((m.payload?.headers||[]).filter(h=>['from','to','subject','date','reply-to'].includes(String(h.name).toLowerCase())).map(h=>[h.name.toLowerCase(),String(h.value).slice(0,1500)]));
 const plain=[],html=[],attachments=[];let visited=0;
 function walk(p,depth=0){if(!p||depth>12||++visited>200)return;if(p.filename)attachments.push({name:String(p.filename).slice(0,180),mime_type:p.mimeType,size:p.body?.size,attachment_id:p.body?.attachmentId||null});
  if(p.body?.data&&['text/plain','text/html'].includes(p.mimeType)){const text=Buffer.from(String(p.body.data).slice(0,100000),'base64url').toString('utf8');(p.mimeType==='text/plain'?plain:html).push(text);}
  for(const child of p.parts||[])walk(child,depth+1);
 }walk(m.payload);
 const full=plain.length?plain.join('\n'):html.join('\n').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
 return{id:m.id,thread_id:m.threadId,...headers,snippet:m.snippet,body:full.slice(0,18000),truncated:full.length>18000,attachments};
}
async function bridge(db,actor,action,x,transport=fetch){
 validate(action,x);const base=process.env.TURNLY_ALICE_EMAIL_BRIDGE;
 if(!base||!/^https:\/\/turnlypros\.app\.n8n\.cloud\/webhook\/[a-zA-Z0-9_-]+$/.test(base))throw S.fail('Email connection is not configured yet.',503);
 const id=crypto.randomUUID(),payload={action,mailbox:x.mailbox,...(action==='search'?{query:x.query,page_token:x.page_token}:action==='read'?{id:x.id}:{}),actor,expires:Date.now()+45000};
 const ticket=I.seal(JSON.stringify(payload),id);S.checked(await db.from('owner_email_requests').insert({id,actor,request_hash:I.hash(ticket),expires_at:new Date(payload.expires).toISOString()}));
 const r=await transport(base+'-'+x.mailbox,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,ticket}),redirect:'error',signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw S.fail('This mailbox is unavailable or needs Google authorization. No email was changed.',503);
 let length=0;const parts=[];for await(const chunk of r.body){length+=chunk.length;if(length>3*1024*1024)throw S.fail('Email exceeds the read limit. Open it in Gmail.',413);parts.push(Buffer.from(chunk));}
 let data;try{data=JSON.parse(Buffer.concat(parts));}catch{throw S.fail('Email bridge returned an invalid response.',503);}
 if(data.error)throw S.fail('Google could not read this mailbox. Reconnect it in n8n.',503);return data;
}
async function run(db,actor,action,x){
 if(actor!==process.env.TURNLY_OWNER_VOICE_ADMIN_ID)throw S.fail('Private owner mailbox access required.',403);
 if(action==='accounts'){const results=await Promise.all(Object.keys(MAILBOXES).map(async mailbox=>{try{const p=await bridge(db,actor,'profile',{mailbox});return{mailbox,email:MAILBOXES[mailbox],connected:p.emailAddress?.toLowerCase()===MAILBOXES[mailbox]};}catch{return{mailbox,email:MAILBOXES[mailbox],connected:false};}}));return{accounts:results,read_only:true};}
 const r=await bridge(db,actor,action,x);if(action==='read')return{mailbox:x.mailbox,email:MAILBOXES[x.mailbox],message:message(r),untrusted_content:true};
 if(action==='search')return{mailbox:x.mailbox,email:MAILBOXES[x.mailbox],messages:(r.messages||[]).slice(0,10),next_page_token:r.nextPageToken||null,estimated_results:r.resultSizeEstimate,notice:'Read the returned message IDs for sender, subject and body. An estimate is not an exact count.'};
 throw S.fail('Unsupported mailbox operation.');
}
module.exports={run,verify,bridge,validate,gmailURL,message,MAILBOXES};
