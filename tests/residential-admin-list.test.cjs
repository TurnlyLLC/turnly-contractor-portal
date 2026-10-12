const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('admin list excludes cancelled and removed bookings before counting and pagination',async()=>{
 const calls=[],synced=[];
 const rows=[{id:'current',status:'scheduled',assignment_deleted_at:null},{id:'cancelled',status:'cancelled',assignment_deleted_at:null},{id:'removed',status:'scheduled',assignment_deleted_at:'2026-10-12'}];
 const q={select(){return this},order(){return this},is(k,v){calls.push(['is',k,v]);return this},neq(k,v){calls.push(['neq',k,v]);return this},async range(){calls.push(['range']);const data=rows.filter(r=>calls.every(([op,k,v])=>op==='is'?r[k]===v:op==='neq'?r[k]!==v:true));return {data,count:data.length};}};
 const S={body:async()=>({action:'admin_list'}),database:()=>({from:()=>q}),admin:async()=> 'admin',checked:r=>r.data,ready:()=>true,json:(_,status,data)=>({status,data})};
 const module={exports:{}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../api/residential-booking.js'),'utf8'),{module,require:n=>n.includes('residential-server')?S:n.includes('residential-jobs')?{syncBooking:async(_,b)=>{synced.push(b.id);return {status:'pending'};}}:n.includes('agent-referrals')?{clean:v=>v||'',uuid:()=>true}:{}});
 const result=await module.exports({method:'POST'},{});
 assert.equal(result.data.total,1);assert.deepEqual(synced,['current']);
 assert.deepEqual(calls,[['is','assignment_deleted_at',null],['neq','status','cancelled'],['range']]);
});
