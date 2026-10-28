const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync('sales-portal.js','utf8');
const code=source.slice(source.indexOf('function renderSendSuccessModal(){'),source.indexOf('function bindSalesOperations(){'));
function fixture(channel,status='accepted'){
 const state={modal:{channel,requestId:'stable-request'}};let rendered=0,focused=0;
 const context={state,esc:s=>String(s).replaceAll('<','&lt;'),renderModalShell:(...v)=>v.join(''),render:()=>rendered++,document:{querySelector:()=>({focus:()=>focused++})},refreshData:async()=>{throw Error('Refresh unavailable');},crmSalesRequest:async()=>({message:{status,recipient:channel==='email'?'test@example.test':'+19195550100'}})};
 vm.createContext(context);vm.runInContext(code,context);
 return {context,state,rendered:()=>rendered,focused:()=>focused};
}
for(const channel of ['email','sms'])test(channel+' success is shown even when refresh fails',async()=>{
 const f=fixture(channel);await f.context.submitCheckout({elements:{lead_id:{value:'lead'},consent:{checked:true}}});
 assert.equal(f.state.modal.type,'sendSuccess');assert.equal(f.rendered(),1);assert.equal(f.focused(),1);
 const html=f.context.renderSendSuccessModal();assert.match(html,/sent successfully/);assert.match(html,/Final delivery depends/);assert.ok(html.includes(f.state.modal.recipient));
});
for(const status of ['failed','unknown','pending'])test(status+' never shows success',async()=>{
 const f=fixture('email',status);await assert.rejects(f.context.submitCheckout({elements:{lead_id:{value:'lead'},consent:{checked:true}}}),/still processing/);assert.equal(f.rendered(),0);assert.equal(f.state.modal.requestId,'stable-request');
});
