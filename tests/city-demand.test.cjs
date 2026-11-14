const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{PGlite}=require('@electric-sql/pglite');
const D=require('../lib/city-demand.cjs');
const input={city:'  atLANTA ',state:'ga',zip:'30301-1111',email:' Test@Example.com ',name:'Test',frequency:'biweekly',service:'standard',accepted:true,notify_launch:false};
test('normalize and deduplicate by email/ZIP without treating launch permission as required',()=>{
 const row=D.validate(input);assert.equal(row.city,'Atlanta');assert.equal(row.state,'GA');assert.equal(row.zip,'30301');assert.equal(row.email,'test@example.com');assert.equal(row.notify_launch,false);assert.equal(row.dedupe_key,D.validate({...input,city:'ATLANTA',zip:'30301'}).dedupe_key);assert.notEqual(row.dedupe_key,D.validate({...input,zip:'30302'}).dedupe_key);
 for(const patch of [{accepted:false},{city:''},{state:'ZZ'},{zip:'30301wrong'},{frequency:'daily'},{email:'bad'},{website:'bot'}])assert.throws(()=>D.validate({...input,...patch}));
});
test('save ignores duplicates without leaking existence and reports database failures',async()=>{
 let call;const db={from:table=>({upsert:async(row,opts)=>{call={table,row,opts};return {error:null};}})};assert.equal((await D.save(db,input)).ok,true);assert.equal(call.table,'city_demand_requests');assert.equal(call.opts.ignoreDuplicates,true);assert.equal(call.opts.onConflict,'dedupe_key');await assert.rejects(()=>D.save({from:()=>({upsert:async()=>({error:{message:'secret'}})})},input),/could not save/);
});
test('schema summary is accurate, duplicate writes are atomic, and client roles cannot access PII or summary',async()=>{
 const db=new PGlite();try{await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');await db.exec(fs.readFileSync('supabase/migrations/20261114182304_city_demand_requests.sql','utf8'));
 const row=D.validate(input),keys=Object.keys(row),sql=`insert into city_demand_requests (${keys.join(',')}) values (${keys.map((_,i)=>'$'+(i+1)).join(',')}) on conflict(dedupe_key) do nothing`;
 await db.query(sql,Object.values(row));await db.query(sql,Object.values(D.validate({...input,notify_launch:true})));await db.query(sql,Object.values(D.validate({...input,email:'another@example.com',frequency:'once',notify_launch:true})));
 const result=(await db.query('select * from city_demand_summary()')).rows[0];assert.equal(Number(result.requests),2);assert.equal(Number(result.recurring),1);assert.equal(Number(result.notify_launch),1);
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(()=>db.query('select * from city_demand_requests'),/permission denied/);await assert.rejects(()=>db.query('select * from city_demand_summary()'),/permission denied/);await db.exec('reset role');}
 }finally{await db.close();}
});
test('API denies unsigned admin actions and rate-limits public requests',async()=>{
 const handler=fs.readFileSync('api/city-demand.js','utf8');let submitted=false,rate=0,checkedAdmin=0;
 const S={body:async r=>r.body,database:()=>({}),rate:async()=>{rate++;},admin:async()=>{checkedAdmin++;throw Object.assign(Error('Sign in'),{status:401});},json:(res,status,body)=>{res.status=status;res.body=body;}};
 const context={module:{exports:{}},require:n=>n.includes('residential-server')?S:{save:async()=>{submitted=true;return {ok:true};}}};vm.runInNewContext(handler,context);const res={};await context.module.exports({method:'POST',body:{action:'summary'}},res);assert.equal(res.status,401);assert.equal(checkedAdmin,1);assert.equal(submitted,false);await context.module.exports({method:'POST',body:{action:'request'}},res);assert.equal(rate,1);assert.equal(submitted,true);assert.equal(res.status,200);
});
test('ZIP mapping uses aggregate requests, keeps contact details private, and tolerates provider failures',async()=>{
 const M=require('../lib/city-demand-map.cjs');const lookup=async()=>({ok:true,json:async()=>({places:[{'place name':'Durham','state abbreviation':'NC',latitude:'35.99',longitude:'-78.90'}]})});
 const point=await M.locateZip('27701','NC',lookup);assert.equal(point.result,'matched');assert.equal(point.latitude,35.99);assert.equal((await M.locateZip('27701','GA',lookup)).result,'not_found');
 const records=M.records([{city:'Durham',city_key:'durham',state:'NC',zip:'27701',requests:12,recurring:8,last_30_days:6}]);assert.equal(records[0].kind,'city_interest');assert.equal(records[0].demand_count,12);assert.match(records[0].url,/zip=27701/);assert.equal(records[0].email,undefined);
 let stored;await M.remember({from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:null})})}),upsert:async row=>{stored=row;}})}, {zip:'27701',state:'NC'},async()=>point);assert.equal(stored.latitude,35.99);
 await M.remember({}, {zip:'27701',state:'NC'},async()=>{throw Error('offline');});
});
