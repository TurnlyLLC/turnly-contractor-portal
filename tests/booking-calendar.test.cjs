const {test}=require('node:test'),assert=require('node:assert/strict'),C=require('../lib/booking-calendar.cjs'),P=require('../lib/residential-pricing.cjs');
const now=Date.parse('2026-10-28T12:00:00-04:00');
test('launch date, weekdays, blackouts, pause and horizon all restrict booking',()=>{
 const c=C.normalize({first_date:'2026-11-02',weekdays:[1,2,3,4,5],blocked_dates:['2026-11-02']});
 assert.equal(C.next(c,now),'2026-11-03');assert.ok(C.error(c,'2026-11-01','09:00','12:00',now));assert.ok(C.error(c,'2026-11-02','09:00','12:00',now));assert.ok(C.error(c,'2027-06-01','09:00','12:00',now));assert.equal(C.error(c,'2026-11-03','09:00','12:00',now),'');assert.equal(C.next({...c,paused:true},now),null);
});
test('custom notice supports short and long notice, respects the actual Eastern DST boundary',()=>{
 const c=C.normalize({notice_hours:2}),late=Date.parse('2026-10-28T23:00:00-04:00');assert.equal(C.error(c,'2026-10-29','01:00','02:00',late),'');assert.ok(C.error(c,'2026-10-29','00:59','02:00',late));assert.doesNotThrow(()=>P.schedule({service_date:'2026-10-29',arrival_start:'01:00',arrival_end:'02:00'},new Date(late),c));assert.ok(C.error(c,'2026-10-28','18:00','19:00',now));
 const dst=Date.parse('2026-10-31T12:00:00-04:00');assert.equal(C.instant('2026-11-01','12:00')-dst,25*3600000);assert.ok(C.error({...c,notice_hours:26},'2026-11-01','12:00','15:00',dst));
});
test('slot-only and custom-window policies are enforced server-side',()=>{
 const c=C.normalize({allow_custom:false});assert.equal(C.error(c,'2026-11-02','09:00','12:00',now),'');assert.ok(C.error(c,'2026-11-02','10:00','12:00',now));
 const custom=C.normalize({open_time:'08:00',close_time:'18:00',min_window:60,max_window:180});assert.ok(C.error(custom,'2026-11-02','07:00','09:00',now));assert.ok(C.error(custom,'2026-11-02','10:00','10:30',now));assert.equal(C.error(custom,'2026-11-02','10:00','11:00',now),'');
});
test('invalid settings rejected; no available dates reported honestly',()=>{
 for(const settings of [{weekdays:[]},{slots:[],allow_custom:false},{first_date:'2026-02-30'},{notice_hours:-1},{slots:[{start:'12:00',end:'09:00'}]}])assert.throws(()=>C.normalize(settings));
 assert.equal(C.next(C.normalize({first_date:'2027-12-01'}),now),null);
});
test('unavailable settings fail closed, stale admin saves cannot overwrite changes',async()=>{
 await assert.rejects(C.load({from:()=>({select:()=>({eq:()=>({single:async()=>({error:{message:'offline'}})})})})}),/could not be loaded/);
 const q={eq(){return this;},select(){return this;},maybeSingle:async()=>({data:null})};await assert.rejects(C.save({from:()=>({update:()=>q})},{settings:C.defaults,version:1},'admin'),/Another admin/);
});
test('admin API rejects missing auth and public availability never exposes the updater',async()=>{
 const S=require('../lib/residential-server.cjs'),old=S.database;S.database=()=>({});const handler=require('../api/residential-booking.js');
 try{for(const action of ['calendar_get','calendar_save']){const res={setHeader(){},end(s){this.body=JSON.parse(s);}};await handler({method:'POST',body:{action},headers:{}},res);assert.equal(res.statusCode,401);}}
 finally{S.database=old;}
});
test('settings table forbids anonymous and authenticated access',async()=>{
 const {PGlite}=require('@electric-sql/pglite'),fs=require('node:fs'),db=new PGlite();try{await db.exec('create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);');await db.exec(fs.readFileSync(require('node:path').join(__dirname,'../supabase/migrations/20261028184039_residential_calendar_controls.sql'),'utf8'));const r=await db.query("select has_table_privilege('anon','residential_calendar_settings','select') a,has_table_privilege('authenticated','residential_calendar_settings','update') b");assert.deepEqual(r.rows[0],{a:false,b:false});}finally{await db.close();}
});
