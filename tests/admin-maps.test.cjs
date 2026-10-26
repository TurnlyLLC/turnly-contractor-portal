const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const M=require('../lib/map-data.cjs'),O=require('../lib/out-of-area.cjs');
test('lead and cleaning stages stay distinct, including DNC and cancelled',()=>{
 assert.equal(M.leadStatus({pipeline_stage:'new_leads'}),'new');assert.equal(M.leadStatus({pipeline_stage:'active'}),'purchased');assert.equal(M.leadStatus({pipeline_stage:'new_leads',do_not_contact:true}),'do_not_contact');
 assert.equal(M.bookingStatus({status:'scheduled'},{status:'pending'}),'pending');assert.equal(M.bookingStatus({status:'requested'}),'requested');assert.equal(M.bookingStatus({status:'completed'}),'completed');assert.equal(M.bookingStatus({status:'cancelled'}),'cancelled');
 assert.equal(M.stateCode('North Carolina'),'NC');assert.equal(M.stateCode('va'),'VA');assert.equal(M.key(' 123 Main St '),M.key('123 MAIN ST'));
});
test('geocoding never fabricates coordinates for missing or ambiguous addresses',async()=>{
 assert.equal((await M.locate('TEST ONLY - no service address')).result,'not_found');
 const fixture=matches=>async()=>({ok:true,json:async()=>({result:{addressMatches:matches}})});
 const match={matchedAddress:'123 MAIN ST',coordinates:{x:-78.9,y:35.9}};
 assert.equal((await M.locate('123 Main St',fixture([match]))).result,'matched');
 assert.equal((await M.locate('123 Main St',fixture([match,match]))).result,'not_found');
 assert.equal((await M.locate('123 Main St',fixture([]))).latitude,null);
 await assert.rejects(M.locate('123 Main St',async()=>({ok:false})),/unavailable/);
});
test('out-of-range requests are idempotent and never create bookings, payments, or access codes',async()=>{
 const stored=new Map(),tables=[];
 const db={from(table){tables.push(table);return {async upsert(row){if(!stored.has(row.id))stored.set(row.id,row);return {data:null};},select(){return {eq(k,v){return {async single(){return {data:stored.get(v)};}};}};}};}};
 const input={id:'test',token:'x'.repeat(64),out_of_range_consent:true},data={name:'Test',email:'test@example.invalid',phone:'9195550100',property_address:'2003 Upper Lake Dr',city:'Reston',state:'VA',zip:'20191',beds:3,baths:2,sqft:1500,service:'deep',frequency:'once',service_date:'2099-01-01',notes:'',visit_details:{access_code:'SECRET'}};
 await O.save(db,input,data,{approved:false},async()=>{});await O.save(db,input,data,{approved:false},async()=>{});assert.equal(stored.size,1);assert.ok(tables.every(t=>t==='out_of_area_requests'));assert.ok(!JSON.stringify(stored.get('test')).includes('SECRET'));
 await assert.rejects(O.save(db,{...input,token:'other'},data,{approved:false},async()=>{}),/changed/);
 await assert.rejects(O.save(db,{...input,out_of_range_consent:false},data,{approved:false},async()=>{}),/Confirm/);
 await assert.rejects(O.save(db,input,data,{approved:true}),/service area/);
});
test('map API rejects non-admin sales users before reading any records',async()=>{
 const source=fs.readFileSync(require.resolve('../api/admin-map.js'),'utf8');let reads=0;
 const module={exports:{}};const S={body:async()=>({dataset:'sales',action:'list'}),database:()=>({}),fail:(message,status)=>Object.assign(Error(message),{status}),json:(_res,status,data)=>({status,data})};
 vm.runInNewContext(source,{module,require:name=>name.includes('residential-server')?S:name.includes('map-data')?{records:()=>{reads++;}}:{access:async()=>({admin:false})}});
 const response=await module.exports({method:'POST'},{});assert.equal(response.status,403);assert.equal(reads,0);
});
test('map tables are private and out-of-area rows cannot become chargeable bookings',async()=>{
 const {PGlite}=require('@electric-sql/pglite'),db=new PGlite();
 try{await db.exec('create role anon;create role authenticated;create role service_role;');await db.exec(fs.readFileSync('supabase/migrations/20261026185014_admin_demand_maps.sql','utf8'));
 await db.exec('set role authenticated');await assert.rejects(db.query('select * from out_of_area_requests'),/permission denied/);await assert.rejects(db.query('select * from map_geocodes'),/permission denied/);
 }finally{await db.close();}
});

test('mapping failure cannot fail a saved request, while verified coverage is cached without another lookup',async()=>{
 let row,lookups=0;
 const data={property_address:'123 Test St',city:'Durham',state:'NC',zip:'27701'};
 await M.rememberAddress({from:()=>({upsert:async r=>{row=r;return {data:null};}})},data,{latitude:35.9,longitude:-78.9,matched_address:'123 TEST ST'},async()=>{lookups++;throw Error();});
 assert.equal(lookups,0);assert.equal(row.provider,'NC OneMap');assert.equal(row.latitude,35.9);
 await M.rememberAddress({},data,{},async()=>{throw Error('Provider unavailable');});
});
test('out-of-range checkout returns a request before any booking RPC, gift reservation, or Stripe operation',async()=>{
 const source=fs.readFileSync(require.resolve('../api/residential-booking.js'),'utf8'),module={exports:{}};let saved=0;
 const input={action:'checkout',id:'fixture',token:'x'.repeat(64),state:'VA',out_of_range_consent:true};
 const S={body:async()=>input,database:()=>({rpc:()=>{throw Error('Must not create booking');}}),rate:async()=>{},validate:v=>v,json:(_r,status,data)=>({status,data})};
 vm.runInNewContext(source,{module,require:name=>{
 if(name.includes('residential-server'))return S;if(name.includes('agent-referrals'))return {uuid:()=>true,clean:v=>v};
 if(name.includes('service-coverage'))return {verify:async()=>({approved:false})};
 if(name.includes('out-of-area'))return {save:async()=>{saved++;return {out_of_range:true};}};
 return {};
 }});
 const response=await module.exports({method:'POST'},{});assert.equal(response.status,200);assert.equal(response.data.out_of_range,true);assert.equal(saved,1);
});
test('cleaning map merges assignments without duplicating linked residential bookings',async()=>{
 const data={referral_bookings:[{id:'r1',name:'Home',property_address:'123 Test St',city:'Durham',state:'NC',status:'scheduled'}],out_of_area_requests:[{id:'o1',name:'Outside',property_address:'456 Example St',city:'Reston',state:'VA',status:'out_of_range'}],assignment_blocks:[{id:'r1',status:'pending'},{id:'c1',property_name:'Office',address:'789 Sample St, Raleigh, NC 27601',status:'completed',site_latitude:35.78,site_longitude:-78.64}]};
 const db={from:t=>({select:()=>({order:()=>({range:async()=>({data:data[t]})})})})};
 const rows=await M.records(db,'cleans');assert.equal(rows.length,3);assert.equal(rows.find(r=>r.id==='r1').status,'pending');assert.equal(rows.find(r=>r.id==='c1').category,'commercial');assert.equal(rows.find(r=>r.id==='c1').state,'NC');assert.equal(rows.find(r=>r.id==='o1').status,'out_of_range');
});

test('identical assignment addresses share known site coordinates without external geocoding',async()=>{
 const db={from:()=>({select:()=>({in:async()=>({data:[]})})})};
 const rows=await M.attach(db,[{address:'123 Site St',latitude:35.9,longitude:-78.9},{address:'123 SITE ST'}]);
 assert.equal(rows[1].latitude,35.9);assert.equal(rows[1].location_status,'matched');
 const conflict=await M.attach(db,[{address:'123 Site St',latitude:35.9,longitude:-78.9},{address:'123 Site St',latitude:36,longitude:-79},{address:'123 Site St'}]);
 assert.equal(conflict[2].latitude,null);
});
