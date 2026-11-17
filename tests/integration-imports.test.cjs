const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const P=require('../lib/integration-platform.cjs'),S=require('../lib/residential-server.cjs'),Q=require('../api/_quickbooks');
const actor='11111111-1111-4111-8111-111111111111';
test('expense API adapter preserves monthly/yearly normalization and never updates saved rows',async()=>{
 const get=Q.getSupabaseAdmin,admin=Q.requireAdmin;let written;
 Q.getSupabaseAdmin=()=>({client:{from(table){assert.equal(table,'finance_expenses');return {insert(rows){written=rows;return {select:async()=>({data:rows})}}}}}});
 Q.requireAdmin=async()=>({user:{id:actor}});delete require.cache[require.resolve('../api/finance-import-expenses.js')];
 try{const r=await P.invoke({},actor,{endpoint:'finance-import-expenses',action:'import'},{rows:[{vendor:'Test software',monthlyAmount:10,yearlyAmount:150,nextPaymentYearly:'2027-01-15'}]},'test');assert.equal(r.imported,2);assert.deepEqual(written.map(x=>[x.amount,x.recurrence,x.created_by]),[[10,'monthly',actor],[30,'yearly',actor]]);await assert.rejects(()=>P.invoke({},actor,{endpoint:'finance-import-expenses',action:'import'},{rows:[]},'test'));}
 finally{Q.getSupabaseAdmin=get;Q.requireAdmin=admin;delete require.cache[require.resolve('../api/finance-import-expenses.js')];}
});
test('resume API adapter matches original checksum and preserves an attached resume',async()=>{
 const database=S.database,admin=S.admin;let existing=null,uploaded=0,updated=0;const bytes=Buffer.from('Original resume fixture'),hash=crypto.createHash('sha256').update(bytes).digest('hex');
 S.admin=async()=>actor;S.database=()=>({from(table){assert.equal(table,'recruiting_applications');let update=false;const q={select(){return q},eq(k,v){if(k==='answers->>import_resume_sha256')assert.equal(v,hash);return q},is(){return q},update(){update=true;return q},then(resolve){if(update)updated++;return Promise.resolve({data:update?[]:[{id:actor,answers:{import_resume_name:'fixture.txt'},resume_path:existing}]}).then(resolve)}};return q},storage:{from(){return {async upload(path,data){uploaded++;assert.deepEqual(data,bytes);return {data:{path}}}}}}});
 try{const call=()=>P.invoke({},actor,{endpoint:'applicant-resume-import',action:'attach'},{data:bytes.toString('base64')},'test');assert.equal((await call()).ok,true);assert.equal(uploaded,1);assert.equal(updated,1);existing='preserved-original.txt';assert.equal((await call()).already_attached,true);assert.equal(uploaded,1);assert.equal(updated,1);}
 finally{S.database=database;S.admin=admin;}
});
