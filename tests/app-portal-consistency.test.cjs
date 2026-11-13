const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const A=require('../lib/ambassadors.cjs');
function functions(file,names,context){
 const source=fs.readFileSync(require('node:path').join(__dirname,'..',file),'utf8');
 const code=names.map(name=>{const start=source.indexOf(`function ${name}(`);assert.ok(start>=0);return source.slice(start,source.indexOf('\n}',start)+2);}).join('\n');
 return vm.runInNewContext(code+';({'+names.join(',')+'})',context);
}
test('portal payouts preserve zero and adjusted net amounts like the native app',()=>{
 for(const file of ['contractor-file-source.js','contractor-file-source-20260709b.js']){
 const {paymentPaidAmount}=functions(file,['paymentPaidAmount'],{assignmentPayment:r=>r.metadata?.payment||{},isPaid:r=>r.paid,paymentNetAmount:r=>r.pay_amount});
 assert.equal(paymentPaidAmount({paid:true,pay_amount:100,paid_amount:0}),0);
 assert.equal(paymentPaidAmount({paid:true,pay_amount:100,paid_amount:90,net_paid_amount:80}),80);
 assert.equal(paymentPaidAmount({paid:true,pay_amount:100,metadata:{payment:{paid_amount:'85.50'}}}),85.5);
 assert.equal(paymentPaidAmount({paid:true,pay_amount:100}),100);
 }
});
test('portal access notes preserve special instructions and deduplicate entry notes',()=>{
 const {resolvedAccessNotes}=functions('contractor-job-flow-mobile.js',['resolvedAccessNotes'],{activeDirectoryDetails:null,directoryAccessNotes:r=>r?.access_notes,metadataValue:(r,keys)=>r[keys[0]]||r.metadata?.[keys[0]]});
 assert.equal(resolvedAccessNotes({scope:'Clean',access_notes:'Side door',metadata:{entry_notes:'Side door',gate_code:'1234',special_instructions:'Dog in yard'}}),'Side door\n1234\nDog in yard');
});
test('bridge authorizes stored roles, preserves portal session and enforces password reset',async()=>{
 const token='x.'+Buffer.from(JSON.stringify({session_id:'app-session'})).toString('base64url')+'.x';
 let valid=true,roles=['brand_ambassador'],reset=false,calls=[];
 const member={enabled:true,session_id:'portal-session'};
 const db={auth:{getUser:async()=>({data:{user:{id:'member'}}})},from(table){return{select(){return this},eq(){return this},maybeSingle:async()=>({data:table==='profiles'?{status:'active',role:'contractor'}:table==='app_user_access'?{roles}:{...member,must_change_password:reset}})}},rpc:async(name,args)=>{calls.push({name,args});return{data:valid}}};
 const req={headers:{authorization:'Bearer '+token}};
 const actor=await A.access(db,req,{bridge:true});assert.equal(calls[0].args.p_register,true);assert.equal(member.session_id,'portal-session');assert.equal(actor.sessionId,'app-session');
 await A.access(db,req);assert.equal(calls[1].args.p_register,false);
 reset=true;await assert.rejects(A.access(db,req),e=>e.status===428);
 valid=false;await assert.rejects(A.access(db,req),e=>e.status===401);
 roles=['contractor'];const before=calls.length;await assert.rejects(A.access(db,req,{bridge:true}),e=>e.status===403);assert.equal(calls.length,before);
});
