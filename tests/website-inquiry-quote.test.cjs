const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const token='a'.repeat(64);
const base={client_type:'residential',name:'Test Resident',email:'resident@example.com',phone:'9195550100',city:'Raleigh',street_address:'123 Test Street',unit_number:'2B',state:'NC',postal_code:'27601',service_interest:'Deep cleaning',bedrooms:0,bathrooms:1.5,square_feet:850,frequency:'Monthly',message:'Occasional deep clean',feedback_token:token,source_url:`https://turnlypros.com/residential/Contact.html?source=resident-feedback#card=${token}`};
async function run(body){
  let saved;const calls=[];
  const client={rpc:async(name,args)=>{calls.push({name,args});return {data:{property_name:'Verified Community',property_code:'VFH',card_number:103}}},from:()=>({insert:payload=>{saved=payload;return {select:()=>({single:async()=>({data:{id:'test'}})})}}})};
  const sandbox={module:{exports:{}},Buffer,URL,console,process:{env:{SUPABASE_SERVICE_ROLE_KEY:'test'}},require:name=>name==='@supabase/supabase-js'?{createClient:()=>client}:require(name)};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../api/website-inquiries.js'),'utf8'),sandbox);
  let result;const res={setHeader(){},end(data){result=JSON.parse(data)}};
  const req={method:'POST',headers:{origin:'https://turnlypros.com'},async *[Symbol.asyncIterator](){yield Buffer.from(JSON.stringify(body))}};
  await sandbox.module.exports(req,res);return {status:res.statusCode,result,saved,calls};
}
test('quote inquiry preserves address, editable home details and verified card attribution without token leaks',async()=>{
  const result=await run({...base,property_name:'Untrusted community',verified_feedback_card:'forged'});
  assert.equal(result.status,200);
  assert.match(result.saved.lead_notes,/Street address: 123 Test Street/);
  assert.match(result.saved.lead_notes,/Apartment \/ unit: 2B/);
  assert.match(result.saved.lead_notes,/Property \/ community: Verified Community/);
  assert.match(result.saved.lead_notes,/Referred from feedback card: VFH-103/);
  assert.match(result.saved.lead_notes,/Bedrooms: 0/);
  assert.match(result.saved.lead_notes,/Bathrooms: 1.5/);
  assert.match(result.saved.lead_notes,/Square feet: 850/);
  assert.match(result.saved.lead_notes,/Frequency: Monthly/);
  assert.equal(JSON.stringify(result.saved).includes(token),false);
  assert.equal(result.saved.lead_source,'residential_website_contact_form');
});
test('quote address validation and direct requests without a flyer',async()=>{
  for(const change of [{street_address:''},{postal_code:'bad'},{state:'North Carolina'}])assert.equal((await run({...base,...change})).status,400);
  const result=await run({...base,feedback_token:undefined,verified_feedback_card:'forged'});
  assert.equal(result.status,200);assert.equal(result.calls.length,0);assert.equal(result.saved.lead_notes.includes('forged'),false);
});
