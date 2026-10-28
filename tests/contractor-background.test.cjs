const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),B=require('../lib/contractor-background.cjs');
test('tracking updates the original checklist item and never exposes report references to contractors',()=>{
 const file={complete:true,items:[{id:'native-bg',title:'Background check',kind:'background',required:true,state:'done'},{id:'w9',required:true,state:'done'}]};
 const row={status:'awaiting_review',sync_state:'synced',reference:'private-ref',contractor_note:'Awaiting review'};
 const r=B.merge(file,row);assert.equal(r.complete,false);assert.equal(r.items.length,2);assert.equal(r.items[0].id,'native-bg');assert.equal(r.items[0].state,'in_review');assert(!JSON.stringify(r).includes('private-ref'));
 assert.equal(B.merge(file,{...row,status:'approved',sync_state:'pending'}).complete,false);assert.equal(B.merge(file,{...row,status:'approved'}).complete,true);
});
test('approval requires explicit human review, a reference, native acknowledgement and final sync',async()=>{
 let item={id:'background',kind:'background',required:true,state:'todo'},calls=[];const id=randomUUID(),op=randomUUID();
 const call=async(path,body)=>{if(body){calls.push(path);item={...item,state:path.endsWith('/mark')?'done':'todo',submission:{source:'admin',reviewerNote:body.note}};return {ok:true};}return {items:[item]};};
 const db={rpc:async(name)=>{calls.push(name);return {data:{operation_id:op}};}};
 const input={item_id:'background',status:'approved',reference:'VF-123',version:0,confirm:true};
 await assert.rejects(B.save(db,id,id,{...input,confirm:false},call),/confirm/);assert.equal(calls.length,0);
 await B.save(db,id,id,input,call);assert.deepEqual(calls,['begin_contractor_background_review',`contractors/${id}/items/background/mark`,'finish_contractor_background_review']);
 calls=[];await assert.rejects(B.save(db,id,id,input,async(path,body)=>{if(body)throw Error('offline');return {items:[item]};}),/Job access remains paused/);assert.deepEqual(calls,['begin_contractor_background_review']);
});
test('database rejects stale or unconfirmed approval and blocks native/service-role claims until synced',async()=>{
 const {PGlite}=require('@electric-sql/pglite'),fs=require('node:fs'),db=new PGlite(),admin=randomUUID(),contractor=randomUUID(),job=randomUUID();
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema turnly_private;
 create table profiles(id uuid primary key,role text,status text,contractor_approved boolean,background_check_status text,background_check_completed_at timestamptz);
 create table assignment_blocks(id uuid primary key,status text,claimed_by uuid,assigned_to uuid);
 grant all on profiles,assignment_blocks to service_role;`);
 await db.exec(fs.readFileSync('supabase/migrations/20261028192235_contractor_background_tracking.sql','utf8'));
 await db.query("insert into profiles(id,role,status,contractor_approved) values($1,'admin','active',false),($2,'contractor','active',true)",[admin,contractor]);await db.query("insert into assignment_blocks values($1,'open',null,null)",[job]);
 const begin='select * from begin_contractor_background_review($1,$2,$3,$4,$5,$6,$7,$8)';
 await assert.rejects(db.query(begin,[contractor,contractor,'bg','approved','r','',0,true]),/admin/);
 await assert.rejects(db.query(begin,[admin,contractor,'bg','approved','r','',0,false]),/confirm/);
 const row=(await db.query(begin,[admin,contractor,'bg','invited','r','Check email',0,false])).rows[0];assert.equal((await db.query('select contractor_approved from profiles where id=$1',[contractor])).rows[0].contractor_approved,false);
 await db.exec('set role service_role');await assert.rejects(db.query("update assignment_blocks set status='claimed',claimed_by=$1 where id=$2",[contractor,job]),/background check/);await db.exec('reset role');
 await db.query('select finish_contractor_background_review($1,$2)',[contractor,row.operation_id]);
 await assert.rejects(db.query(begin,[admin,contractor,'bg','approved','r','',0,true]),/changed/);
 const approved=(await db.query(begin,[admin,contractor,'bg','approved','r','',1,true])).rows[0];
 await assert.rejects(db.query("update assignment_blocks set status='claimed',claimed_by=$1 where id=$2",[contractor,job]),/background check/);
 await db.query('select finish_contractor_background_review($1,$2)',[contractor,approved.operation_id]);
 await db.query("update assignment_blocks set status='claimed',claimed_by=$1 where id=$2",[contractor,job]);
 assert.equal((await db.query('select count(*)::int n from contractor_background_history')).rows[0].n,2);
 const permissions=(await db.query("select has_table_privilege('authenticated','contractor_background_checks','update') a,has_function_privilege('authenticated','begin_contractor_background_review(uuid,uuid,text,text,text,text,integer,boolean)','execute') b")).rows[0];assert.deepEqual(permissions,{a:false,b:false});
 }finally{await db.close();}
});
