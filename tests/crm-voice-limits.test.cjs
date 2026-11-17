const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(){
 let quotaCalls=0,budgetCalls=0,prepareCalls=0;
 const env=Object.fromEntries(['TWILIO_ACCOUNT_SID','TWILIO_AUTH_TOKEN','TWILIO_API_KEY_SID','TWILIO_API_KEY_SECRET','TWILIO_TWIML_APP_SID','TWILIO_VOICE_NUMBER'].map(k=>[k,'test']));env.TWILIO_VOICE_ENABLED='true';
 class Token{addGrant(){}toJwt(){return 'test-token'}}Token.VoiceGrant=class{};
 const dependencies={
 './crm-training.cjs':{requireComplete:async()=>{}},'./crm-call-hours.cjs':{status:()=>({allowed:true})},
 './communication-budget.cjs':{reserve:async()=>{budgetCalls++}},'libphonenumber-js':{parsePhoneNumberFromString:()=>({country:'US'})},
 twilio:{jwt:{AccessToken:Token}},'./crm-sales.cjs':{leadFor:async(_db,_u,id)=>({id,contact_phone:'+19195550100'})},
 './agent-referrals.cjs':{phone:v=>v,uuid:()=>true},
 './residential-server.cjs':{rate:async()=>{quotaCalls++;throw Error('Public quota exceeded')},fail:(message,status)=>Object.assign(Error(message),{status}),checked:r=>{if(r.error)throw Error(r.error.message);return r.data}}
 };
 const module={exports:{}};vm.runInNewContext(fs.readFileSync('lib/crm-voice.cjs','utf8'),{module,require:n=>dependencies[n],process:{env},Buffer});
 const db={rpc:async()=>{prepareCalls++;return {data:'intent'}}};
 const req={headers:{authorization:'Bearer a.'+Buffer.from(JSON.stringify({session_id:'session'})).toString('base64url')+'.c','x-forwarded-for':'shared-va-network'}};
 return {V:module.exports,db,req,counts:()=>({quotaCalls,budgetCalls,prepareCalls})};
}
test('ordinary authenticated calls exceed 20/hour without consuming shared public IP quota',async()=>{
 const s=setup();for(let i=0;i<25;i++)await s.V.prepare(s.db,{id:'rep'},s.req,{lead_id:'lead'});
 assert.deepEqual(s.counts(),{quotaCalls:0,budgetCalls:25,prepareCalls:25});
});
test('per-user burst and simultaneous-call guards remain enforced before spending',async()=>{
 for(const [message,status] of [['Please wait before placing another call.',429],['Finish the current call first.',409]]){
  const s=setup();s.db.rpc=async()=>({error:{message}});
  await assert.rejects(()=>s.V.prepare(s.db,{id:'rep'},s.req,{lead_id:'lead'}),e=>e.status===status&&(status!==429||e.retryAfter===60));
  assert.equal(s.counts().budgetCalls,0);
 }
});
test('changing prospects closes idle dialer and ignores a late history response',async()=>{
 const events={},nodes=new Map();let dock,resolve;
 const element=()=>({hidden:false,disabled:false,textContent:'',setAttribute(){},append(){},replaceChildren(){},addEventListener(){},querySelector(s){if(!nodes.has(s))nodes.set(s,element());return nodes.get(s)}});
 const original=global.document,originalWindow=global.window;
 global.document={head:{append(){}},body:{append(el){dock=el}},createElement:element,addEventListener(k,f){events[k]=f}};
 global.window={addEventListener(){}};
 try{
  const {installCalling}=await import('../crm-calling.mjs');installCalling({request:()=>new Promise(r=>resolve=r)});
  events.click({target:{closest:()=>({dataset:{callLead:'first',callLabel:'First lead'}})},preventDefault(){}});
  assert.equal(dock.hidden,false);
  events['crm-lead-focus']({detail:{id:'second'}});assert.equal(dock.hidden,true);
  resolve({calls:[],training_ready:true,ready:true,calling_hours:{allowed:true}});await Promise.resolve();
  assert.equal(nodes.get('[data-dial]').disabled,true);assert.equal(dock.hidden,true);
 }finally{global.document=original;global.window=originalWindow;}
});
