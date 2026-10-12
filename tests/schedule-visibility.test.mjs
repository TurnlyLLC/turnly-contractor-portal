import {test} from 'node:test';
import assert from 'node:assert/strict';
import {visibleScheduleAssignment as visible} from '../schedule-visibility.mjs';
const residential = {metadata:{source:'residential_booking'}};
test('canceled residential jobs never enter the schedule',()=>{
 for(const status of ['cancelled','canceled','declined',' Cancelled '])assert.equal(visible({...residential,status}),false);
 assert.equal(visible({status:'cancelled',metadata:JSON.stringify(residential.metadata)}),false);
 assert.equal(visible({status:'canceled',metadata:{residential_booking_id:'booking'}}),false);
});
test('removed residential jobs stay hidden and active jobs stay visible',()=>{
 assert.equal(visible({...residential,status:'open',assignment_deleted_at:'2026-10-12'}),false);
 for(const status of ['pending','open','claimed','in_progress','completed'])assert.equal(visible({...residential,status}),true);
});
test('other assignment types retain existing behavior',()=>{
 assert.equal(visible({status:'cancelled',metadata:{source:'property_manager_turn_request'}}),true);
 assert.equal(visible({status:'open',metadata:'invalid JSON'}),true);
});
