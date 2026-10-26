const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const V=require('../lib/residential-video-consent.cjs');
const actor='10000000-0000-0000-0000-000000000001',job='20000000-0000-0000-0000-000000000001';
const signed={customer_name:'Test Customer',agreed:true,signature:[Array.from({length:12},(_,i)=>[i/15,(i%3)/4])]};
test('signature requires affirmative consent, a name, bounded real strokes and server consent text',()=>{
 assert.equal(V.signature(signed).consent_text,V.CONSENT);
 for(const input of [{...signed,agreed:false},{...signed,customer_name:''},{...signed,signature:[]},{...signed,signature:[[[0,0],[0,0]]]},{...signed,signature:[[[0,0],[Infinity,0]]]},{...signed,signature:[Array(501).fill([0,0])]}])assert.throws(()=>V.signature(input));
});
test('all 182 templates gain videos; completion requires stored media or immutable consent',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;create schema turnly_private;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('app.uid',true),'')::uuid$$;
 create table profiles(id uuid primary key,role text,status text);
 create table assignment_blocks(id uuid primary key,property_id uuid,portal_property_id uuid,unit_id uuid,status text,metadata jsonb,property_checklist_items jsonb,checklist_responses jsonb,claimed_by uuid,assigned_to uuid,title text,service_type text,start_window timestamptz,started_at timestamptz,completed_at timestamptz,checklist_completed_at timestamptz,property_name text,scope text);
 create table checklist_templates(id uuid primary key default gen_random_uuid(),name text,department text,subdepartment text,description text,sections jsonb);
 create table properties(id uuid,checklist_template_id uuid,checklist_items jsonb);create table portal_properties(id uuid,checklist_template_id uuid,checklist_items jsonb);create table property_units(id uuid,checklist_template_id uuid,checklist_items jsonb);
 create table qa_videos(id uuid primary key,assignment_id uuid,storage_bucket text,storage_path text,metadata jsonb);create table storage.objects(bucket_id text,name text);
 insert into profiles values('${actor}','contractor','active');`);
 await db.exec(fs.readFileSync('supabase/migrations/20261026142825_residential_scope_checklists.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261026151740_residential_video_consent.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261026191608_checklist_sync_video_consent.sql','utf8'));
 const {rows}=await db.query('select * from checklist_templates');assert.equal(rows.length,182);
 const {residentialChecklistItems}=await import('../residential-assignment.mjs');
 for(const t of rows){assert.equal(t.sections[0].id,'residential-video-before');assert.equal(t.sections.at(-1).id,'residential-video-after');assert.equal(residentialChecklistItems(t).filter(i=>i.type==='video'&&i.required).length,2);}
 const items=residentialChecklistItems(rows[0]);
 await db.query(`insert into assignment_blocks(id,status,metadata,property_checklist_items,claimed_by) values($1,'pending','{"source":"admin_test_assignment","scope_type":"residential"}',$2,$3)`,[job,JSON.stringify(items),actor]);
 await db.exec(`update assignment_blocks set status='in_progress' where id='${job}'`);
 await assert.rejects(db.exec(`update assignment_blocks set status='qa_pending' where id='${job}'`),/Upload both/);
 const videos=items.filter(i=>i.type==='video'),responses=[];
 for(let i=0;i<2;i++){
  const vid=`30000000-0000-0000-0000-00000000000${i+1}`,path=`${actor}/${i}.mp4`;
  await db.query(`insert into qa_videos values($1,$2,'qa-videos',$3,$4)`,[vid,job,path,JSON.stringify({checklist_item_id:videos[i].id})]);
  responses.push({source_item_id:videos[i].source_item_id,completed:true,media:{id:vid,path}});
 }
 await db.query('update assignment_blocks set checklist_responses=$1 where id=$2',[JSON.stringify(responses),job]);
 await assert.rejects(db.exec(`update assignment_blocks set status='qa_pending' where id='${job}'`),/Upload both/);
 await db.exec(`insert into storage.objects values('qa-videos','${actor}/0.mp4'),('qa-videos','${actor}/1.mp4');update assignment_blocks set status='qa_pending' where id='${job}';update assignment_blocks set status='in_progress',checklist_responses='[]' where id='${job}'`);
 await assert.rejects(db.query('select record_residential_video_consent($1,$2,$3)',[job,job,JSON.stringify(V.signature(signed))]),/assigned contractor/);
 const record=(await db.query('select record_residential_video_consent($1,$2,$3) as record',[actor,job,JSON.stringify(V.signature(signed))])).rows[0].record;
 const again=(await db.query('select record_residential_video_consent($1,$2,$3) as record',[actor,job,JSON.stringify(V.signature({...signed,customer_name:'Other Name'}))])).rows[0].record;
 assert.equal(record.id,again.id);assert.equal(again.customer_name,'Test Customer');
 await assert.rejects(db.exec('update assignment_video_consents set customer_name=\'Changed\''),/permanent/);
 await assert.rejects(db.exec('delete from assignment_video_consents'),/permanent/);
 await db.exec(`select set_config('app.uid','${actor}',false)`);
 await assert.rejects(db.exec(`update assignment_blocks set property_checklist_items='[]' where id='${job}'`),/Only an admin/);
 await db.exec(`update assignment_blocks set status='qa_pending' where id='${job}'`);
 // Template edits update active jobs but leave submitted records intact.
 const nextJob='20000000-0000-0000-0000-000000000002';
 await db.exec("select set_config('app.uid','',false)");
 const oldResponses=items.map(i=>({source_item_id:i.source_item_id,module_instance:i.module_instance,task:i.task,completed:true,note:'saved note'}));
 await db.query(`insert into assignment_blocks(id,status,metadata,property_checklist_items,checklist_responses,claimed_by) values($1,'in_progress',$2,$3,$4,$5)`,[nextJob,JSON.stringify({scope_type:'residential',checklist_template_id:rows[0].id}),JSON.stringify(items),JSON.stringify(oldResponses),actor]);
 await db.query(`update assignment_blocks set metadata=metadata||$1 where id=$2`,[JSON.stringify({checklist_template_id:rows[0].id}),job]);
 const revised=JSON.parse(JSON.stringify(rows[0].sections));revised[1].items[0].label='Updated scope verification';revised.push({id:'new-module',title:'New requirement',items:[{id:'new-task',type:'check',label:'New task',required:true}]});
 await db.query('update checklist_templates set sections=$1 where id=$2',[JSON.stringify(revised),rows[0].id]);
 const synced=(await db.query('select * from assignment_blocks where id=$1',[nextJob])).rows[0];
 assert.equal(synced.property_checklist_items.length,items.length+1);
 assert.equal(synced.checklist_responses[0].completed,true);assert.equal(synced.checklist_responses[0].note,'saved note');
 assert.equal(synced.checklist_responses[1].completed,false);assert.equal(synced.checklist_responses.at(-1).completed,false);
 assert.ok(synced.metadata.checklist_revision);assert.equal(synced.metadata.checklist_history.length,1);
 assert.deepEqual((await db.query('select property_checklist_items from assignment_blocks where id=$1',[job])).rows[0].property_checklist_items,items);
 await db.exec(`select set_config('app.uid','${actor}',false)`);
 assert.equal((await db.query(`select has_table_privilege('authenticated','assignment_video_consents','INSERT') as allowed`)).rows[0].allowed,false);
 assert.equal((await db.query(`select has_function_privilege('authenticated','record_residential_video_consent(uuid,uuid,jsonb)','EXECUTE') as allowed`)).rows[0].allowed,false);
 await db.exec('grant usage on schema auth to authenticated;grant select on profiles,assignment_blocks to authenticated;set role authenticated');
 assert.equal((await db.query('select * from assignment_video_consents')).rows.length,1);
 await db.exec(`select set_config('app.uid','40000000-0000-0000-0000-000000000001',false)`);
 assert.equal((await db.query('select * from assignment_video_consents')).rows.length,0);
 await db.exec('reset role');
 }finally{await db.close();}
});
test('consent API refuses anonymous and unrelated contractors',async()=>{
 await assert.rejects(V.run({}, {headers:{}},{id:job,action:'get'}),/Sign in/);
 const db={auth:{getUser:async()=>({data:{user:{id:actor}}})},from(table){return {select(){return this},eq(){return this},maybeSingle:async()=>({data:table==='profiles'?{role:'contractor',status:'active'}:{id:job,claimed_by:'other-worker',assigned_to:actor}})};}};
 await assert.rejects(V.run(db,{headers:{authorization:'Bearer test'}},{id:job,action:'get'}),/unavailable/);
});
test('signature renderer escapes customer text and discards malformed coordinates',async()=>{
 const M=await import('../video-consent.mjs');const html=M.consentRecordHtml({customer_name:'<img onerror=alert(1)>',signature:[[['bad',0]]],signed_at:new Date().toISOString()});
 assert.ok(!html.includes('<img'));assert.ok(!html.includes('<polyline'));assert.ok(M.videoConsentItem({source_item_id:'residential-video-before'}));assert.ok(!M.videoConsentItem({id:'commercial-video'}));
});
