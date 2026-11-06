const {test}=require('node:test'),assert=require('node:assert/strict');
const S=require('../lib/residential-server.cjs'),A=require('../lib/ambassadors.cjs'),sharing=require('../lib/ba-sharing.cjs'),handler=require('../api/ambassadors.js');
test('admin defaults to whole team, filters selected ambassador, and members stay scoped',async()=>{
 const saved={database:S.database,access:A.access,readiness:A.referralReadiness,assets:sharing.sharingAssets};
 const members=[{user_id:'a',name:'Alex'},{user_id:'b',name:'Blair'}],leads=[{id:'l1',member_id:'a',name:'First Customer'},{id:'l2',member_id:'b',name:'Second Customer'}];
 let admin=true,filters=[];
 const db={from(table){let selected;const q={select(){return q},order(){return q},eq(k,v){selected=v;filters.push([table,k,v]);return q},in(k,ids){return Promise.resolve({data:ids.map(id=>({id:'reward-'+id,lead_id:id,amount_cents:2500}))})},range(from,to){const data=table==='ba_members'?members:selected?leads.filter(l=>l.member_id===selected):leads;return Promise.resolve({data:data.slice(from,to+1)})}};return q;}};
 S.database=()=>db;A.access=async()=>({admin,id:'a',member:{...members[0],onboarding_completed_at:'done'}});A.referralReadiness=async(db,rows)=>rows;sharing.sharingAssets=async()=>null;
 const run=async member_id=>{let payload;const res={setHeader(){},status(n){this.code=n;return this},json(x){payload=x},end(x){payload=JSON.parse(x)}};await handler({method:'POST',body:{action:'dashboard',member_id}},res);return {code:res.code||res.statusCode,data:payload};};
 try{
  let r=await run();assert.equal(r.data.scope,'team');assert.equal(r.data.member,null);assert.equal(r.data.leads.length,2);assert.equal(r.data.earnings.length,2);
  r=await run('b');assert.equal(r.data.member.user_id,'b');assert.deepEqual(r.data.leads.map(l=>l.id),['l2']);
  r=await run('missing');assert.equal(r.code,404);
  admin=false;r=await run('b');assert.equal(r.data.scope,'ambassador');assert.equal(r.data.member.user_id,'a');assert.deepEqual(r.data.leads.map(l=>l.id),['l1']);assert.equal(r.data.leads[0].name,'First C.');
 }finally{S.database=saved.database;A.access=saved.access;A.referralReadiness=saved.readiness;sharing.sharingAssets=saved.assets;}
});
