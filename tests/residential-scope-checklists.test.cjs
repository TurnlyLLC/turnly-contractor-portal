const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const J=require('../lib/residential-jobs.cjs');
test('182 exact residential scopes, separate commercial library, half baths and approval gate',async()=>{
 const db=new PGlite();try{
 await db.exec(`create schema turnly_private;create table profiles(id uuid primary key,role text,status text);create table assignment_blocks(id uuid primary key,status text,metadata jsonb,property_checklist_items jsonb);
 create table checklist_templates(id uuid primary key default gen_random_uuid(),name text,department text,subdepartment text,description text,sections jsonb);
 insert into checklist_templates(name,sections) values('1 bed 1 bath','[]');`);
 await db.exec(fs.readFileSync('supabase/migrations/20261026142825_residential_scope_checklists.sql','utf8'));
 const {rows}=await db.query('select * from checklist_templates');const generated=rows.filter(r=>r.scope_type==='residential');assert.equal(generated.length,182);assert.equal(rows.find(r=>r.name==='1 bed 1 bath').scope_type,'commercial');
 const {matchingResidentialChecklist,residentialChecklistItems}=await import('../residential-assignment.mjs');
 for(const service of ['standard','deep'])for(let beds=1;beds<=7;beds++)for(let baths=1;baths<=7;baths+=.5){
 const template=matchingResidentialChecklist(rows,beds,baths,service);assert.ok(template,`${service} ${beds}/${baths}`);
 assert.equal(template.sections.filter(s=>/^Bedroom \d/.test(s.title)).length,beds);
 assert.equal(template.sections.filter(s=>/^Full bathroom/.test(s.title)).length,Math.floor(baths));
 const half=template.sections.find(s=>s.title.startsWith('Half bathroom'));assert.equal(!!half,baths%1===.5);
 if(half)assert.ok(half.items.every(i=>!/shower|bathtub/i.test(i.label)));
 const flat=residentialChecklistItems(template);assert.ok(flat.length>50);assert.equal(new Set(flat.map(i=>i.id)).size,flat.length);
 assert.ok(flat.some(i=>/microwave/i.test(i.task)));assert.ok(template.description.includes('Exclusions:'));
 if(service==='standard')assert.ok(!flat.some(i=>/ceiling fan|grout/i.test(i.task)));else assert.ok(flat.some(i=>/grout/i.test(i.task)));
 }
 for(const [beds,baths,service] of [[8,2,'deep'],[2,7.5,'standard'],[1.5,1,'standard'],[2,2.25,'deep'],[0,1,'deep'],[1,1,'move']])assert.equal(matchingResidentialChecklist(rows,beds,baths,service),null);
 assert.equal(matchingResidentialChecklist(rows.filter(t=>t.scope_type==='commercial'),1,1,'standard'),null);
 const id='00000000-0000-0000-0000-000000000001',admin='00000000-0000-0000-0000-000000000002';
 await db.query("insert into profiles values($1,'admin','active')",[admin]);
 await db.query("insert into assignment_blocks values($1,'pending',$2,'[]')",[id,JSON.stringify({source:'residential_booking',checklist_review_required:true})]);
 await assert.rejects(db.query("update assignment_blocks set status='open' where id=$1",[id]),/Attach/);
 await db.query("update assignment_blocks set property_checklist_items='[{\"task\":\"Custom scope\"}]' where id=$1",[id]);
 await assert.rejects(db.query("update assignment_blocks set status='open' where id=$1",[id]),/admin must review/);
 await db.query("update assignment_blocks set status='open',metadata=metadata||$2::jsonb where id=$1",[id,JSON.stringify({checklist_reviewed_at:new Date().toISOString(),checklist_reviewed_by:admin})]);
 assert.equal((await db.query('select status from assignment_blocks')).rows[0].status,'open');
 }finally{await db.close();}
});
test('approval requires a checklist and explicit acknowledgement for flagged scope',()=>{
 assert.throws(()=>J.approvalChecklistReview({metadata:{}},{},'admin'),/Attach/);
 const job={property_checklist_items:[{task:'Custom'}],metadata:{checklist_review_required:true}};
 assert.throws(()=>J.approvalChecklistReview(job,{},'admin'),/confirm/);
 assert.equal(J.approvalChecklistReview(job,{checklist_reviewed:true},'admin').checklist_reviewed_by,'admin');
});
