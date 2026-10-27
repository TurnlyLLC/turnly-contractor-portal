import {test} from 'node:test';
import assert from 'node:assert/strict';
import {visibleScheduleAssignment as visible} from '../schedule-visibility.mjs';
test('each calendar isolates booking, test and manual residential assignments before filters and totals',()=>{
 const rows=[{id:'commercial',metadata:{source:'property_manager_turn_request'}},{id:'booking',metadata:{source:'residential_booking'}},{id:'test',metadata:{source:'admin_test_assignment',residential_booking_id:'test'}},{id:'manual',metadata:{scope_type:'residential'}},{id:'json',metadata:JSON.stringify({scope_type:'residential'})},{id:'cancelled',status:'cancelled',metadata:{scope_type:'residential'}}];
 assert.deepEqual(rows.filter(r=>visible(r,'commercial')).map(r=>r.id),['commercial']);
 assert.deepEqual(rows.filter(r=>visible(r,'residential')).map(r=>r.id),['booking','test','manual','json']);
});

test('visibility remains safe as an Array.filter callback',()=>{const rows=[{metadata:{scope_type:'residential'}},{metadata:{}}];assert.equal(rows.filter(visible).length,2);});
