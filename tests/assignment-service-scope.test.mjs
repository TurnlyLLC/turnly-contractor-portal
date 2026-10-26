import test from 'node:test';
import assert from 'node:assert/strict';
import { assignmentServiceScope } from '../assignment-service-scope.mjs';
import { readFileSync } from 'node:fs';
test('residential bookings and explicit test/manual homes are separated from commercial work', () => {
  assert.equal(assignmentServiceScope({metadata:{source:'residential_booking'}}),'residential');
  assert.equal(assignmentServiceScope({metadata:{source:'admin_test_assignment',residential_booking_id:'test'}}),'residential');
  assert.equal(assignmentServiceScope({metadata:{scope_type:'residential'}}),'residential');
  assert.equal(assignmentServiceScope({title:'Residential apartments',metadata:{}}),'commercial');
  assert.equal(assignmentServiceScope({}),'commercial');
});
test('tab-scoped rows protect counts and bulk selection without changing other admin pages', () => {
  const source=readFileSync(new URL('../admin-suite-20260708g.js',import.meta.url),'utf8');
  const body=source.match(/function scopedAssignmentRows\(\) \{([\s\S]*?)\n\}/)[1];
  const rows=[{id:'r',metadata:{scope_type:'residential'}},{id:'c',metadata:{}}];
  const run=new Function('activeKey','assignmentState','assignmentServiceScope',body);
  assert.deepEqual(run('assignments',{rows,scopeFilter:'residential'},assignmentServiceScope).map(r=>r.id),['r']);
  assert.deepEqual(run('assignments',{rows,scopeFilter:'commercial'},assignmentServiceScope).map(r=>r.id),['c']);
  assert.equal(run('claimed-assignments',{rows,scopeFilter:'residential'},assignmentServiceScope),rows);
});
