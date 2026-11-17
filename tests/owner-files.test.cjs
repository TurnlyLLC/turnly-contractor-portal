const {test}=require('node:test'),assert=require('node:assert/strict'),F=require('../lib/owner-files.cjs'),M=require('../lib/owner-sms.cjs');
const actor='11111111-1111-4111-8111-111111111111',account='AC'+'a'.repeat(32),sid='MM'+'b'.repeat(32),media='ME'+'c'.repeat(32);
function fixture(){const rows=[],objects=new Map();return{rows,objects,from(){return{select(){return this;},eq(){return this;},async maybeSingle(){return{data:rows[0]||null};},async upsert(r){rows.push(r);return{};}};},storage:{from(bucket){assert.equal(bucket,'alice-inbox');return{async upload(path,bytes,options){assert.equal(options.upsert,false);objects.set(path,bytes);return{};}};}}};}
test('verified MMS uses fixed Twilio host, enforces format and deduplicates private bytes',async()=>{
 const db=fixture(),client={messages(id){assert.equal(id,sid);return{media:{list:async()=>[{sid:media,contentType:'application/pdf',uri:'https://evil.invalid'}]}};}};
 let calls=0;const transport=async(url,options)=>{calls++;assert.equal(url,`https://api.twilio.com/2010-04-01/Accounts/${account}/Messages/${sid}/Media/${media}`);assert.equal(options.redirect,'error');return new Response(Buffer.from('%PDF-1.4\nExample'),{status:200});};
 const c={account,auth:'test',ownerId:actor};const a=await F.receiveMedia(db,c,sid,client,transport),b=await F.receiveMedia(db,c,sid,client,transport);
 assert.equal(a[0].id,b[0].id);assert.equal(db.rows.length,1);assert.equal(db.objects.size,1);assert.equal(calls,2);
 await assert.rejects(F.receiveMedia(db,c,'../../other',client,transport),/Invalid/);
 await assert.rejects(F.save(fixture(),actor,Buffer.from('<script>'),'application/pdf','test.pdf','test'),/format/);
});
test('oversized media aborts without creating a file record',async()=>{
 const db=fixture(),client={messages(){return{media:{list:async()=>[{sid:media,contentType:'image/png'}]}};}};
 await assert.rejects(F.receiveMedia(db,{account,auth:'test',ownerId:actor},sid,client,async()=>new Response('x',{headers:{'content-length':String(F.MAX+1)}})),/larger than/);assert.equal(db.rows.length,0);
});
test('document transport records conversation before upload and waits for a final multimodal reply',async()=>{
 const steps=[];let socket;class Socket{constructor(){socket=this;this.handlers={};queueMicrotask(()=>this.handlers.open());}addEventListener(n,f){this.handlers[n]=f;}send(s){const e=JSON.parse(s);if(e.type==='conversation_initiation_client_data')queueMicrotask(()=>this.handlers.message({data:JSON.stringify({type:'conversation_initiation_metadata',conversation_initiation_metadata_event:{conversation_id:'conv_test'}})}));if(e.type==='multimodal_message'){assert.equal(e.file.file_id,'f_test');assert.equal(e.text.text,'Read the amount');queueMicrotask(()=>{this.handlers.message({data:JSON.stringify({type:'agent_response',agent_response_event:{agent_response:'Amount $10'}})});this.handlers.message({data:JSON.stringify({type:'agent_response_complete'})});});}}close(){this.closed=true;}}
 const transport=async(url,opts)=>{if(url.includes('get-signed-url'))return{ok:true,json:async()=>({signed_url:'wss://api.elevenlabs.io/test'})};steps.push('upload');assert.match(url,/conversations\/conv_test\/files$/);assert.ok(opts.body instanceof FormData);return{ok:true,json:async()=>({file_id:'f_test'})};};
 const r=await M.answer({elevenKey:'test'},'agent_test','scoped','Read the amount',[],transport,Socket,{file:{bytes:Buffer.from('%PDF-1.4'),content_type:'application/pdf',file_name:'test.pdf'},onConversation:async()=>steps.push('persist')});
 assert.deepEqual(steps,['persist','upload']);assert.equal(r.reply,'Amount $10');assert.ok(socket.closed);
});
