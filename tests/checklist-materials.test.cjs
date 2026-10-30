const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const root=path.resolve(__dirname,'..'),uid=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
test('materials follow assigned templates, preserve job snapshots, and skip historical backfill',async()=>{
 const db=new PGlite();
 try {
 await db.exec(`create schema turnly_private;create role anon;create role authenticated;create role service_role;
 create table checklist_templates(id uuid primary key,scope_type text,residential_service text,subdepartment text);
 create table assignment_blocks(id uuid primary key,metadata jsonb default '{}',property_id uuid,portal_property_id uuid,unit_id uuid,status text,started_at timestamptz,completed_at timestamptz);
 create table properties(id uuid primary key,checklist_template_id uuid);
 create table portal_properties(id uuid primary key,checklist_template_id uuid);
 create table property_units(id uuid primary key,checklist_template_id uuid);
 insert into checklist_templates values('${uid(1)}','residential','standard','Standard clean'),('${uid(2)}','residential','deep','Deep clean'),('${uid(3)}','commercial',null,'');
 insert into assignment_blocks(id,metadata,status) values('${uid(10)}','{"checklist_template_id":"${uid(1)}"}','open'),('${uid(11)}','{"checklist_template_id":"${uid(2)}"}','completed');`);
 await db.exec(fs.readFileSync(path.join(root,'supabase/migrations/20261030184039_checklist_materials.sql'),'utf8'));
 const get=async n=>(await db.query('select * from assignment_blocks where id=$1',[uid(n)])).rows[0];
 assert.equal((await get(10)).materials_list.service,'standard');assert.equal((await get(11)).materials_list,null);
 const deep=(await db.query('select materials_list from checklist_templates where id=$1',[uid(2)])).rows[0].materials_list;
 assert.ok(deep.groups.some(g=>g.items.some(i=>i.name.includes('sanitizer'))));
 await db.query('update assignment_blocks set metadata=$1 where id=$2',[{checklist_template_id:uid(2)},uid(10)]);
 assert.equal((await get(10)).materials_list.service,'deep');
 await db.query('update checklist_templates set materials_list=$1 where id=$2',[{...deep,title:'Updated deep list'},uid(2)]);
 await db.query("update assignment_blocks set status='in_progress',metadata=metadata||'{\"autosaved\":true}' where id=$1",[uid(10)]);
 assert.equal((await get(10)).materials_list.title,deep.title);
 await db.query('insert into assignment_blocks(id,metadata) values($1,$2)',[uid(12),{checklist_template_id:uid(2)}]);
 assert.equal((await get(12)).materials_list.title,'Updated deep list');
 await db.query('update assignment_blocks set metadata=$1 where id=$2',[{checklist_template_id:uid(3)},uid(10)]);
 assert.equal((await get(10)).materials_list,null);
 await db.query('insert into property_units values($1,$2)',[uid(20),uid(1)]);
 await db.query('insert into assignment_blocks(id,unit_id) values($1,$2)',[uid(13),uid(20)]);
 assert.equal((await get(13)).materials_list.service,'standard');
 await db.query('insert into portal_properties values($1,$2)',[uid(21),uid(2)]);
 await db.query('insert into assignment_blocks(id,portal_property_id) values($1,$2)',[uid(14),uid(21)]);
 assert.equal((await get(14)).materials_list.service,'deep');
 await db.query('insert into assignment_blocks(id,metadata,unit_id) values($1,$2,$3)',[uid(15),{checklist_template_id:uid(2)},uid(20)]);
 assert.equal((await get(15)).materials_list.service,'deep');
 await db.query('insert into checklist_templates(id,subdepartment) values($1,$2)',[uid(4),'Deep clean']);
 assert.equal((await db.query('select materials_list from checklist_templates where id=$1',[uid(4)])).rows[0].materials_list.service,'deep');
 // Contractor status updates must work without permission to read the template library.
 await db.exec('grant usage on schema public to authenticated;grant select,update on assignment_blocks to authenticated;set role authenticated');
 await db.query("update assignment_blocks set status='in_progress' where id=$1",[uid(12)]);
 assert.equal((await get(12)).materials_list.title,'Updated deep list');
 } finally {await db.close();}
});

test('materials renderer escapes saved content and handles missing lists',async()=>{
 const {materialsHtml}=await import('../checklist-materials.mjs');
 const html=materialsHtml({title:'<script>bad</script>',groups:[{title:'Chemicals',items:[{name:'<img onerror=bad>',note:'A & B'}]}]},'<svg onload=bad>');
 assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img'));assert.ok(!html.includes('<svg'));
 assert.match(html,/A &amp; B/);assert.match(materialsHtml(null),/No materials list is attached/);
});
