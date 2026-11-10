import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reconcileQueue,adjacentLead} from '../crm-focus-queue.mjs';
test('calling lead 5 of 499 preserves its position after activity refresh and Next goes to 6',()=>{
 const rows=Array.from({length:499},(_,i)=>({id:String(i+1).padStart(3,'0'),created_at:'2026-11-01'}));
 const queue=reconcileQueue([],rows);
 const refreshed=[{...rows[4],updated_at:'2026-11-10'},...rows.filter(r=>r.id!=='005').reverse()];
 const after=reconcileQueue(queue,refreshed);
 assert.deepEqual(after,queue);assert.equal(after.indexOf('005'),4);
 assert.equal(adjacentLead(after,'005',1,new Set(after)),'006');
 assert.equal(adjacentLead(after,'005',-1,new Set(after)),'004');
});
test('excluded current lead retains its place while navigation skips ineligible leads and never wraps',()=>{
 const ids=['a','b','c','d'],eligible=new Set(['a','d']);
 assert.equal(adjacentLead(ids,'b',1,eligible),'d');
 assert.equal(adjacentLead(ids,'b',-1,eligible),'a');
 assert.equal(adjacentLead(ids,'d',1,eligible),null);
 assert.equal(adjacentLead(ids,'a',-1,eligible),null);
 assert.equal(adjacentLead(ids,'deleted',1,eligible),null);
 assert.deepEqual(reconcileQueue(ids,[{id:'a'},{id:'d'},{id:'new'}]),['a','d','new']);
});
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../sales-portal.js',import.meta.url),'utf8');
test('actual CRM focus functions retain selected lead through reorder, outcome changes and next navigation',async()=>{
 const state={rows:Array.from({length:499},(_,i)=>({id:String(i+1).padStart(3,'0'),created_at:'2026-11-01',stage:'new_leads'})),selectedId:'005',leadFocusMode:true};
 const context=vm.createContext({state,reconcileQueue,adjacentLead,stageFor:r=>r.stage,baseFilteredRows:()=>state.rows,recordById:id=>state.rows.find(r=>r.id===id),autosaveFocusLead:async()=>true,writeSalesFocusPlace(){},render(){},window:{scrollTo(){}}});
 vm.runInContext(source.slice(source.indexOf('let focusQueueIds ='),source.indexOf('function statusForCurrentPage')),context);
 vm.runInContext(source.slice(source.indexOf('async function moveLeadFocus('),source.indexOf('async function deleteSelectedLeads(')),context);
 assert.equal(vm.runInContext('leadFocusRows().findIndex(r=>r.id===state.selectedId)',context),4);
 state.rows.reverse();assert.equal(vm.runInContext('leadFocusRows().findIndex(r=>r.id===state.selectedId)',context),4);
 state.rows.find(r=>r.id==='005').stage='follow_up';
 assert.equal(vm.runInContext('leadFocusRows().findIndex(r=>r.id===state.selectedId)',context),4);
 await vm.runInContext('moveLeadFocus(1)',context);assert.equal(state.selectedId,'006');
 state.rows=state.rows.filter(r=>r.id!=='007');await vm.runInContext('moveLeadFocus(1)',context);assert.equal(state.selectedId,'008');
});
