const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{randomUUID}=require('node:crypto'),course=require('../lib/ba-training-course.json'),S=require('../lib/residential-server.cjs');
function fixture(admin=false){
 const writes=[],filters=[],db={from(table){return{select(){return this},eq(k,v){filters.push([table,k,v]);return this},maybeSingle:async()=>({data:{user_id:'own',name:'Example'}}),upsert:async value=>{writes.push(value);return{data:null}},then(resolve){resolve({data:[]})}}}};
 const ctx={module:{exports:{}},require:p=>p==='../lib/residential-server.cjs'?{...S,database:()=>db}:p==='../lib/ambassadors.cjs'?{access:async()=>({id:'own',admin})}:require(path.resolve(__dirname,'..','api',p)),Date,console};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../api/ba-training.js'),'utf8'),ctx);
 return{writes,filters,async request(body){let data;const res={setHeader(){},end(s){data=JSON.parse(s)}};await ctx.module.exports({method:'POST',body,headers:{}},res);return{status:res.statusCode,data}}};
}
test('curriculum has eight unique video lessons, practical exercises and valid questions',()=>{
 assert.equal(course.lessons.length,8);assert.equal(new Set(course.lessons.map(l=>l.video_url)).size,8);
 for(const l of course.lessons){assert.match(l.video_url,/^https:\/\/scrimba.com\/explain\/guide[a-z0-9]+$/);assert.ok(l.activity);assert.ok(l.sections.length>=7);assert.equal(l.questions.length,2);for(const [,options,answer]of l.questions)assert.ok(Number.isInteger(answer)&&answer>=0&&answer<options.length);}
});
test('course access forces member ownership and does not expose answer keys',async()=>{
 const f=fixture(),r=await f.request({action:'course',member_id:'someone-else'});
 assert.equal(r.status,200);assert.ok(f.filters.every(([,k,v])=>k!=='user_id'||v==='own'));
 assert.deepEqual(Object.keys(r.data.course.lessons[0].questions[0]).sort(),['options','question']);
});
test('only a passed, acknowledged current check saves completion for the authenticated member',async()=>{
 const f=fixture(),lesson=course.lessons[0],payload={action:'check',member_id:'someone-else',lesson_id:lesson.id,version:course.version,practiced:true,answers:lesson.questions.map(q=>q[2])};
 assert.equal((await f.request({...payload,version:'old'})).status,409);
 assert.equal((await f.request({...payload,practiced:false})).status,400);
 const fail=await f.request({...payload,answers:[0,0]});assert.equal(fail.data.passed,false);assert.equal(f.writes.length,0);
 const pass=await f.request(payload);assert.equal(pass.data.passed,true);assert.equal(f.writes.length,1);assert.equal(f.writes[0].user_id,'own');assert.equal(f.writes[0].score,2);
 assert.equal((await fixture(true).request(payload)).status,403);
});
test('training records are private and duplicate completion does not overwrite the first timestamp',async()=>{
 const {PGlite}=require('@electric-sql/pglite'),db=new PGlite();try{
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create table ba_members(user_id uuid primary key);grant usage on schema public to service_role;');
 await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261020112349_ba_training_progress.sql'),'utf8'));
 const id=randomUUID();await db.query('insert into ba_members values($1)',[id]);await db.exec('set role service_role');
 const sql="insert into ba_training_progress(user_id,course_version,lesson_id,score,completed_at)values($1,'v1','role',2,$2)on conflict(user_id,course_version,lesson_id)do nothing";
 await db.query(sql,[id,'2026-10-20T12:00:00Z']);await db.query(sql,[id,'2026-10-21T12:00:00Z']);
 assert.equal((await db.query('select count(*)::int n from ba_training_progress')).rows[0].n,1);
 await assert.rejects(db.exec('delete from ba_training_progress'),/permission denied/);
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(db.exec('select * from ba_training_progress'),/permission denied/);}
 }finally{await db.close();}
});
