const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const O=require('../lib/owner-openai.cjs'),A=require('../lib/owner-voice-openai.cjs'),M=require('../api/turnly-mcp.js'),Policy=require('../lib/integration-policy.cjs');
test('OpenAI receives only compact tools, bounded history and private authorization headers',async()=>{
 let payload;const transport=async(url,options)=>{assert.equal(url,'https://api.openai.com/v1/responses');payload=JSON.parse(options.body);return {ok:true,json:async()=>({id:'resp_test',status:'queued'})};};
 await O.start({openaiKey:'provider-secret'},'business-secret','current request',Array.from({length:7},()=>({user:'old request',assistant:'old answer'})),'voice',transport);
 assert.equal(payload.model,O.MODEL);assert.equal(payload.background,true);assert.equal(payload.parallel_tool_calls,false);assert.equal(payload.max_tool_calls,6);assert.equal(payload.max_output_tokens,1600);assert.equal(payload.input.length,9);
 assert.equal(payload.tools.length,1);assert.equal(payload.tools[0].headers.Authorization,'Bearer business-secret');assert(!payload.instructions.includes('business-secret'));assert.match(payload.instructions,/deletion/i);assert.match(payload.instructions,/earnings_report/);
 assert.equal(O.cost({input_tokens:1000,input_tokens_details:{cached_tokens:500},output_tokens:100}),0.08625);assert.equal(O.cost(null),null);
});
test('SMS completes directly through OpenAI and records usage without ElevenLabs',async()=>{
 let charged,endpoint,conversation;const transport=async(url)=>{endpoint=url;return {ok:true,json:async()=>({id:'resp_done',status:'completed',usage:{input_tokens:100,output_tokens:10},output:[{type:'message',content:[{type:'output_text',text:'There are 113 contractor accounts.'}]}]})};};
 const r=await O.answer({openaiKey:'secret'},null,'key','Count contractors',[],transport,null,{onCost:async n=>charged=n,onConversation:async id=>conversation=id});
 assert.equal(r.reply,'There are 113 contractor accounts.');assert.equal(conversation,'resp_done');assert(charged>0);assert.match(endpoint,/api.openai.com/);
});
test('file inspection stays on OpenAI and disables tools for untrusted attachment input',async()=>{
 let p;await O.start({openaiKey:'secret'},'key','Read document',[],'text',async(u,o)=>{p=JSON.parse(o.body);return {ok:true,json:async()=>({id:'resp_file'})};},{file:{bytes:Buffer.from('pdf'),content_type:'application/pdf',file_name:'report.pdf'}});
 assert.deepEqual(p.tools,[]);assert.equal(p.input[0].content[1].type,'input_file');assert.match(p.instructions,/untrusted/);
});
test('voice uses the Alice TTS voice, private audio, and direct hangup phrases',async()=>{
 let payload,url;const r=await A.speech({elevenKey:'secret'},'Hello Ryan',async(u,o)=>{url=u;payload=JSON.parse(o.body);return {ok:true,arrayBuffer:async()=>new Uint8Array([1,2,3]).buffer};});
 assert.match(url,new RegExp('/text-to-speech/'+A.VOICE));assert(!url.includes('convai'));assert.equal(payload.model_id,'eleven_flash_v2_5');assert.equal(r.ttsCents,0.05);
 assert(A.hangup("that's all for now"));assert(A.hangup('Alice, hang up.'));assert(!A.hangup('The customer said hang up in their note'));
 const xml=A.gather('11111111-1111-4111-8111-111111111111',2,'https://example.com/audio');assert.match(xml,/<Gather/);assert.match(xml,/<Play/);assert(!xml.includes('<Say'));assert(!xml.includes('<Dial'));
});
test('all non-deleting tools remain exposed through the same Turnly permission enforcement',()=>{
 const all=M.definitions(['platform:full'],{deny_record_deletion:true});assert(all.some(t=>t.name==='turnly_assignments_reassign'));assert(all.some(t=>t.name==='turnly_assignments_set_pay'));assert(all.some(t=>t.name==='turnly_contractors_earnings_report'));assert(!all.some(t=>Policy.deletesRecords(t.name)));assert.throws(()=>Policy.enforceData({status:'deleted'},{deny_record_deletion:true}));
});
test('private voice turn claim is idempotent, ordered, session-bound and budget bounded',async()=>{
 const {PGlite}=require('@electric-sql/pglite'),db=new PGlite(),sid='11111111-1111-4111-8111-111111111111';
 try{await db.exec(`create role anon;create role authenticated;create role service_role;create table owner_voice_sessions(id uuid primary key,direct_call boolean,state text,expires_at timestamptz,openai_call_id text);insert into owner_voice_sessions values('${sid}',true,'reserved',now()+interval '5 minutes','responses_${sid}');`);
 await db.exec(fs.readFileSync(require('node:path').join(__dirname,'../docs/alice-openai.sql'),'utf8'));
 const turn=async(n)=>(await db.query('select owner_openai_turn($1,$2,$3) result',[sid,n,'sealed'])).rows[0].result;
 assert.equal(await turn(1),null);await db.exec("update owner_voice_sessions set state='active'");const first=await turn(1);assert(first.id);assert.equal((await turn(1)).id,first.id);assert.equal((await turn(1)).replayed,true);assert.equal(await turn(2),null);
 await db.exec("update owner_openai_turns set state='done',ai_cents=1,tts_cents=1");assert((await turn(2)).id);await db.exec("update owner_openai_turns set state='done',ai_cents=75,tts_cents=5");assert.equal(await turn(3),null,'cannot exceed existing call reservation');
 await db.exec("update owner_voice_sessions set state='completed'");assert.equal(await turn(1),null,'ended calls cannot restart actions');
 const grants=await db.query("select has_table_privilege('anon','owner_openai_turns','select') allowed");assert.equal(grants.rows[0].allowed,false);
 }finally{await db.close();}
});
