import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {PGlite} from '@electric-sql/pglite';
import {unitOccupancyBadge} from '../unit-occupancy.mjs';

test('editing occupancy preserves other assignment metadata and supports clearing',()=>{
 const source=readFileSync(new URL('../admin-suite-20260708g.js',import.meta.url),'utf8');
 const start=source.indexOf('function assignmentFormMetadata('),end=source.indexOf('function updateAssignmentContractorControls(',start);
 const control={value:'occupied'};
 const context={document:{getElementById:()=>control},assignmentMetadata:r=>r.metadata,assignmentState:{properties:[]},assignmentValue:()=>'',assignmentPropertyAccessNotes:()=>''};
 vm.createContext(context);vm.runInContext(source.slice(start,end),context);
 const row={metadata:{unit_occupancy:'vacant',property_manager_notes:'Keep notes',admin_approval_status:'approved'}};
 let result=context.assignmentFormMetadata('one_time',[],row);
 assert.equal(result.unit_occupancy,'occupied');assert.equal(result.property_manager_notes,'Keep notes');assert.equal(result.admin_approval_status,'approved');assert.equal(row.metadata.unit_occupancy,'vacant');
 control.value='vacant';assert.equal(context.assignmentFormMetadata('one_time',[],row).unit_occupancy,'vacant');
 control.value='';assert.equal(context.assignmentFormMetadata('one_time',[],row).unit_occupancy,undefined);
 context.document.getElementById=()=>null;assert.equal(context.assignmentFormMetadata('one_time',[],row).unit_occupancy,'vacant');
});

test('badges show only explicitly saved occupancy and tolerate legacy metadata',()=>{
 for(const value of ['occupied','vacant']) assert.match(unitOccupancyBadge({metadata:{unit_occupancy:value}}),new RegExp(value,'i'));
 assert.match(unitOccupancyBadge({metadata:'{"unit_occupancy":"vacant"}'}),/Vacant/);
 for(const metadata of [undefined,null,'bad',{unit_occupancy:'<script>'},{}]) assert.equal(unitOccupancyBadge({metadata}),'');
});

test('wizard requires occupancy and skips move-in questions only for occupied cleans',()=>{
 const source=readFileSync(new URL('../property-manager.js',import.meta.url),'utf8');
 const start=source.indexOf('function turnRequestSteps('),end=source.indexOf('function syncTurnRequestWizard(',start);
 const context={moveInIsWithinUrgentNotice:v=>v==='soon',scheduledMoveInDate:v=>v,selectedTurnRequestUnit:()=>({id:'unit'}),URGENT_TURN_NOTICE_HOURS:36};vm.createContext(context);vm.runInContext(source.slice(start,end),context);
 const form={elements:{unit_occupancy:{value:'occupied'},move_in_date:{value:''},service_date:{value:'later',checkValidity:()=>true}},dataset:{}};
 assert.deepEqual(Array.from(context.turnRequestSteps(form)),['unit','occupancy','date','notes']);
 assert.equal(context.validateTurnRequestStep(form,'date'),'');
 form.elements.service_date.value='soon';assert.ok(context.turnRequestSteps(form).includes('urgent'));
 form.elements.unit_occupancy.value='vacant';assert.ok(context.turnRequestSteps(form).includes('before2'));assert.match(context.validateTurnRequestStep(form,'date'),/move-in/);
 form.elements.unit_occupancy.value='';assert.match(context.validateTurnRequestStep(form,'occupancy'),/Occupied or Vacant/);
});

test('request RPC saves both occupancy types, supports legacy clients, and enforces authorization',async()=>{
 const db=new PGlite();
 await db.exec(`create schema auth;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.actor',true),'')::uuid$$;
 create table profiles(id uuid,role text,property_manager_property_id uuid,full_name text,email text);
 create table portal_properties(id uuid,property_name text,name text,address text);
 create table property_units(id uuid,property_id uuid,unit_name text,updated_at timestamptz,created_at timestamptz,checklist_template_id uuid,checklist_items jsonb,checklist_module_counts jsonb,bedroom_count numeric,bathroom_count numeric,contractor_pay numeric,customer_price numeric,square_feet numeric);
 create table checklist_templates(id uuid,sections jsonb);
 create function public.canonical_portal_property_id(uuid) returns uuid language sql as $$select $1$$;
 create function public.turnly_normalized_unit_key(text) returns text language sql as $$select lower($1)$$;
 create function public.turnly_checklist_template_for_bed_bath(numeric,numeric) returns setof checklist_templates language sql as $$select * from checklist_templates limit 1$$;
 create function public.turnly_flatten_checklist_sections(jsonb) returns jsonb language sql as $$select '[]'::jsonb$$;
 create table assignment_blocks(id uuid default gen_random_uuid(),title text,property_name text,address text,service_type text,pay_amount numeric,unit_id uuid,unit_number text,unit_name text,scope text,supplies_notes text,special_instructions text,status text,priority text,start_window timestamptz,end_window timestamptz,assignment_type text,recurrence_frequency text,recurrence_interval int,auto_renewal boolean,visibility text,created_by uuid,portal_property_id uuid,recurring_portal_property_id uuid,property_checklist_items jsonb,metadata jsonb);
 create table property_assignment_links(portal_property_id uuid,assignment_id uuid,link_type text,source text,metadata jsonb,updated_at timestamptz,unique(portal_property_id,assignment_id,link_type));
 insert into profiles values('00000000-0000-0000-0000-000000000001','property_manager','00000000-0000-0000-0000-000000000002','Test','test@example.invalid');
 insert into portal_properties values('00000000-0000-0000-0000-000000000002','Test','Test','Test');
 insert into property_units(id,property_id,unit_name,checklist_template_id,checklist_items) values('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000002','101','00000000-0000-0000-0000-000000000004','[]');`);
 await db.exec(readFileSync(new URL('../supabase/migrations/20261116000000_unit_occupancy_requests.sql',import.meta.url),'utf8'));
 const request=payload=>db.query('select create_property_manager_turn_request($1::jsonb) as id',[JSON.stringify({unit:'101',service_date:'2099-01-01',...payload})]);
 await assert.rejects(request({unit_occupancy:'occupied'}),/signed in/);
 await db.exec("set test.actor='00000000-0000-0000-0000-000000000001'");
 await request({unit_occupancy:'occupied'});
 await request({unit_occupancy:'vacant',move_in_date:'2099-01-02'});
 await request({move_in_date:'2099-01-02'});
 await assert.rejects(request({unit_occupancy:''}),/Occupied or Vacant/);
 await assert.rejects(request({unit_occupancy:'vacant'}),/move-in date/);
 await assert.rejects(request({unit_occupancy:'occupied',service_date:null}),/cleaning date/);
 await assert.rejects(request({unit_occupancy:'occupied',unit:'999'}),/existing unit/);
 const {rows}=await db.query('select metadata from assignment_blocks');
 assert.equal(rows.length,3);assert.equal(rows[0].metadata.unit_occupancy,'occupied');assert.equal(rows[0].metadata.move_in_date,undefined);assert.equal(rows[0].metadata.move_in_time,undefined);
 assert.equal(rows[1].metadata.unit_occupancy,'vacant');assert.equal(rows[1].metadata.move_in_date,'2099-01-02');assert.equal(rows[2].metadata.unit_occupancy,undefined);
 await db.exec("update profiles set role='contractor'");await assert.rejects(request({unit_occupancy:'occupied'}),/Only property manager/);
 await db.close();
});
