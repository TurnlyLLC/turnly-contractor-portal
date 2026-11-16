const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),{PGlite}=require('@electric-sql/pglite'),C=require('../lib/integration-catalog.cjs'),P=require('../lib/integration-platform.cjs'),M=require('../api/turnly-mcp.js');
test('HTTP and JSON cannot forge internal integration identity',async()=>{const S=require('../lib/residential-server.cjs'),identity=require('../lib/integration-principal.cjs'),actor='11111111-1111-4111-8111-111111111111';let status='active';const db={auth:{getUser:async()=>({error:true})},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{role:'admin',status}})})})})};const forged={headers:{authorization:'Bearer fake','x-integration-actor':actor},body:{principal:actor}};await assert.rejects(()=>S.admin(db,forged));const trusted={headers:{}};identity.bind(trusted,actor);assert.equal(await S.admin(db,trusted),actor);status='disabled';await assert.rejects(()=>S.admin(db,trusted));await assert.rejects(()=>S.admin(db,{...trusted}));});
test('MCP tool visibility follows permissions and excludes credential internals',()=>{const read=M.definitions(['leads:read']);assert.deepEqual(read.map(t=>t.name),['turnly_api_catalog','turnly_read_leads']);const all=M.definitions(['platform:full']);assert.ok(all.some(t=>t.name==='turnly_sales_overview'));assert.ok(all.some(t=>t.name==='turnly_ambassadors_dashboard'));assert.ok(all.some(t=>t.name==='turnly_payouts_transfer'&&t.annotations.destructiveHint));assert.ok(!JSON.stringify(C.catalog()).includes('session_id'));assert.throws(()=>M.toolRequest('turnly_update_clients',{data:{}},{}));assert.throws(()=>P.validate('contractors',{role:'admin'},false));assert.throws(()=>P.validate('clients',{name:'a'},true));});
test('platform SQL authorizes full keys, preserves restricted keys, prevents stale writes and duplicate writes',async()=>{
 const db=new PGlite();try{
 await db.exec("create role anon;create role authenticated;create role service_role;create type user_role as enum ('admin','contractor');");
 const tables={};for(const r of Object.values(C.resources)){tables[r.table]=new Set([...r.fields,...r.write,'created_by']);}
 ['property_name','lead_source','business_segment','prospect_type','sales_owner_id'].forEach(x=>tables.sales_leads.add(x));
 for(const [table,fields] of Object.entries(tables)){
  const pk=table==='ba_members'?'user_id':'id';fields.add(pk);
  if(table==='profiles')fields.add('role');
  const type=f=>f==='role'&&table==='profiles'?'user_role':f==='id'||f.endsWith('_id')||['created_by','assigned_to','claimed_by','profile_id'].includes(f)?'uuid':f.endsWith('_at')||['start_window','end_window'].includes(f)?'timestamptz':['do_not_contact','is_active','enabled','contractor_approved'].includes(f)?'boolean':f==='tags'?'text[]':f==='visit_details'?'jsonb':/amount|price|pay$|cents|square_feet|bedroom_count|bathroom_count/.test(f)?'numeric':'text';
  await db.exec('create table '+table+'('+[...fields].map(f=>f+' '+type(f)+(f===pk?' primary key default gen_random_uuid()':f==='created_at'||f==='updated_at'?' default now()':'')).join(',')+')');
 }
 for(const file of ['supabase/migrations/20261116130025_turnly_integration_keys_and_webhooks.sql','supabase/migrations/20261116131442_integration_role_enum_compatibility.sql','supabase/migrations/20261116141241_integration_platform_mcp.sql'])await db.exec(fs.readFileSync(file,'utf8'));
 const actor='11111111-1111-4111-8111-111111111111',key='22222222-2222-4222-8222-222222222222',limited='33333333-3333-4333-8333-333333333333';
 await db.query("insert into profiles(id,role,status) values($1,'admin','active')",[actor]);
 await db.query("insert into integration_keys(id,name,secret_hash,prefix,scopes,created_by,expires_at) values($1,'full','full','prefix',array['platform:full'],$3,null),($2,'limited','limited','prefix',array['leads:read'],$3,now()+interval '1 day')",[key,limited,actor]);
 assert.equal((await db.query("select integration_use_key('full','payments:write') k")).rows[0].k,key);await assert.rejects(()=>db.query("select integration_use_key('limited','clients:write')"));
 const mutate=(id,data,expected,request='request-one')=>db.query("select integration_mutate($1,$2,'clients',$3,$4,$5) r",[key,request,id,JSON.stringify(data),expected]);
 const first=(await mutate(null,{company_name:'Test company'})).rows[0].r;assert.ok(first.created);assert.ok((await mutate(null,{company_name:'Test company'})).rows[0].r.replayed);
 assert.equal((await db.query('select count(*) n from clients')).rows[0].n,1);await assert.rejects(()=>mutate(null,{company_name:'Different'}));
 const row=(await db.query('select id,updated_at from clients')).rows[0];await assert.rejects(()=>mutate(row.id,{company_name:'Changed'},null,'request-two'));
 await mutate(row.id,{company_name:'Changed'},row.updated_at,'request-two');await assert.rejects(()=>mutate(row.id,{company_name:'Stale'},row.updated_at,'request-three'));
 await assert.rejects(()=>db.query("select integration_mutate($1,'bad-admin','contractors',$2,'{\"full_name\":\"Bad\"}',now())",[key,actor]));
 const claim=()=>db.query("select integration_action_claim($1,'action-one','body','bookings.cancel') r",[key]);assert.equal((await claim()).rows[0].r.replayed,false);await assert.rejects(claim);
 await db.query("update integration_operations set state='completed',response='{\"ok\":true}' where key_id=$1 and request_key='action-one'",[key]);assert.equal((await claim()).rows[0].r.response.ok,true);
 await db.query("update integration_keys set revoked_at=now() where id=$1",[key]);assert.equal((await db.query("select integration_use_key('full','catalog:read') k")).rows[0].k,null);
 await db.exec('set role anon');await assert.rejects(()=>db.query('select * from integration_audit'));await assert.rejects(()=>db.query("select integration_action_claim(null,'abc','abc','abc')"));
 }finally{await db.close();}
});
