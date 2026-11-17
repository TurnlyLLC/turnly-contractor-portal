const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{PGlite}=require('@electric-sql/pglite');
const C=require('../lib/integration-catalog.cjs'),P=require('../lib/integration-platform.cjs'),Policy=require('../lib/integration-policy.cjs'),E=require('../lib/integration-admin-extended.cjs'),schema=require('./fixtures/admin-schema.json');
const actor='11111111-1111-4111-8111-111111111111',key='22222222-2222-4222-8222-222222222222';
test('every published read/write field exists and structured values require explicit fields',()=>{
 for(const r of Object.values(C.resources))for(const f of [...r.fields,...r.write])assert.ok(schema[r.table]?.[f],r.table+'.'+f);
 assert.throws(()=>P.validate('clients',{notes:{secret:'no'}},false));
 assert.throws(()=>P.validate('contractors',{allowed_property_ids:['invalid']},false));
 assert.doesNotThrow(()=>P.validate('checklist_templates',{name:'Move out',sections:[]},true));
 for(const data of [{status:'deleted'},{data:{status:'removed'}},{deleted_at:null},{items:[{is_deleted:true}]}])assert.throws(()=>Policy.enforceData(data,{deny_record_deletion:true}));
 assert.doesNotThrow(()=>Policy.enforceData({status:'archived'},{deny_record_deletion:true}));
 assert.throws(()=>E.validate('assignment_configure',{id:actor,expected_updated_at:'today',reason:'Test config',data:{payment_status:'paid'}}));
});
test('new SQL uses real column types; atomic sales workflow preserves other lead data and prevents stale updates',async()=>{
 const db=new PGlite();try{
 await db.exec('create role anon;create role authenticated;create role service_role;');
 const tables=new Set([...Object.values(C.resources).map(r=>r.table),'integration_keys','integration_operations','contractor_payouts','global_payout_requests']);
 for(const table of tables){
  const columns=Object.entries(schema[table]).map(([f,t])=>{const type=t.startsWith('_')?t.slice(1)+'[]':['user_role','qa_status','contract_status','quote_status','lead_status'].includes(t)?'text':t;return '"'+f+'" '+type+(f==='id'?' primary key default gen_random_uuid()':['created_at','updated_at'].includes(f)?' default now()':'');});
  await db.exec('create table '+table+'('+columns.join(',')+')');
 }
 await db.exec(fs.readFileSync('docs/integration-admin-resources-expanded.sql','utf8'));
 await db.exec(fs.readFileSync('docs/integration-admin-extended.sql','utf8'));
 await db.exec(fs.readFileSync('docs/integration-booking-admin.sql','utf8'));
 await db.exec(fs.readFileSync('docs/integration-admin-batch.sql','utf8'));
 await db.query("insert into profiles(id,role,status) values($1,'admin','active')",[actor]);
 await db.query("insert into integration_keys(id,created_by,scopes,deny_record_deletion)values($1,$2,array['platform:full'],true)",[key,actor]);
 const mutate=(resource,data,id=null,expected=null,request=crypto.randomUUID())=>db.query('select integration_mutate($1,$2,$3,$4,$5,$6) r',[key,request,resource,id,JSON.stringify(data),expected]);
 const region=(await mutate('regions',{name:'Test area',status:'active'})).rows[0].r;assert.ok(region.created); // no created_by column
 const r=(await db.query('select updated_at::text revision from property_regions where id=$1',[region.id])).rows[0];
 await assert.rejects(()=>mutate('regions',{status:'deleted'},region.id,r.revision));
 await mutate('regions',{notes:'Preserve history'},region.id,r.revision);await assert.rejects(()=>mutate('regions',{notes:'stale'},region.id,r.revision));
 const lead=(await db.query("insert into sales_leads(name,pipeline_stage,lead_notes,sales_owner_id) values('Test','new_leads','Keep note',$1) returning id,updated_at::text revision",[actor])).rows[0];
 const input={kind:'quotes',id:null,expected_updated_at:null,lead_id:lead.id,expected_lead_updated_at:lead.revision,data:{quote_status:'accepted',quote_amount:125}};
 const run=i=>db.query("select integration_admin_extended($1,'sales_workflow',$2) r",[actor,JSON.stringify(i)]);
 const saved=(await run(input)).rows[0].r;assert.ok(saved.id);
 const reread=(await db.query('select * from sales_leads where id=$1',[lead.id])).rows[0];assert.equal(reread.pipeline_stage,'contract_out');assert.equal(reread.lead_notes,'Keep note');assert.equal(reread.sales_owner_id,actor);assert.equal(reread.lead_value,'125');
 await assert.rejects(()=>run(input));assert.equal((await db.query('select count(*) n from sales_quotes')).rows[0].n,1);
 const regionRev=(await db.query('select updated_at::text revision from property_regions where id=$1',[region.id])).rows[0].revision;
 const region2=(await mutate('regions',{name:'Second region',status:'active'})).rows[0].r;
 await assert.rejects(()=>db.query('select integration_admin_batch($1,$2,$3,$4)',[key,'regions',crypto.randomUUID(),JSON.stringify([{id:region.id,expected_updated_at:regionRev,data:{notes:'must rollback'}},{id:region2.id,expected_updated_at:'2000-01-01',data:{notes:'stale'}}])]));
 assert.equal((await db.query('select notes from property_regions where id=$1',[region.id])).rows[0].notes,'Preserve history');
 const prop=(await mutate('portal_properties',{property_name:'Test property'})).rows[0].r;
 const series=(await db.query('select integration_assignment_series($1,$2) r',[actor,JSON.stringify({title:'Test series',property_id:prop.id,address:'Test address',scope:'Test scope',pay_amount:50,reason:'Test transaction',windows:[{start_window:'2026-12-01T10:00:00-05:00',end_window:'2026-12-01T11:00:00-05:00'},{start_window:'2026-12-08T10:00:00-05:00',end_window:'2026-12-08T11:00:00-05:00'}]})])).rows[0].r;
 assert.equal(series.assignments.length,2);assert.equal(series.status,'pending');
 const job=(await db.query('select id,updated_at::text revision from assignment_blocks limit 1')).rows[0];
 await db.query("select integration_admin_extended($1,'assignment_configure',$2)",[actor,JSON.stringify({id:job.id,expected_updated_at:job.revision,reason:'Configure test',data:{priority:'high',materials_list:[]}})]);
 assert.equal((await db.query('select priority from assignment_blocks where id=$1',[job.id])).rows[0].priority,'high');
 await db.exec('set role anon');await assert.rejects(()=>db.query("select integration_admin_extended($1,'sales_workflow',$2)",[actor,JSON.stringify(input)]));
 }finally{await db.close();}
});
test('internal API adapters parse structured request bodies without a browser stream',async()=>{
 const Q=require('../api/_quickbooks.js');assert.deepEqual(await Q.readJsonBody({body:{week_start:'2026-11-16'}}),{week_start:'2026-11-16'});
 const M=require('../api/turnly-mcp.js');const names=M.definitions(['platform:full'],{deny_record_deletion:true}).map(t=>t.name);
 for(const name of ['turnly_quickbooks_sync_invoices','turnly_agents_send','turnly_sales_save_workflow','turnly_onboarding_save_template','turnly_qa_upload_start'])assert.ok(names.includes(name),name);
 assert.ok(!names.some(n=>/_(delete|remove|purge|destroy)(_|$)/.test(n)));
});
