import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checklistRooms,customerChecklistHtml} from '../customer-checklist.mjs';
test('rooms retain task order and separate repeated room instances',()=>{
 const tasks=[{task:'Sink',section:'Bathroom',roomId:'bath',roomInstance:1,completed:true},{task:'Floor',section:'Kitchen',completed:false},{task:'Tub',section:'Bathroom',roomId:'bath',roomInstance:2},{task:'Mirror',section:'Bathroom',roomId:'bath',roomInstance:1}];
 const rooms=checklistRooms(tasks);assert.equal(rooms.length,3);assert.deepEqual(rooms[0].items.map(x=>x.task),['Sink','Mirror']);
 const html=customerChecklistHtml(tasks);assert.match(html,/Bathroom 1/);assert.match(html,/Bathroom 2/);assert.match(html,/1 of 4 complete/);assert.doesNotMatch(html,/<details[^>]*\bopen\b/);assert.equal((html.match(/<details/g)||[]).length,4);assert.match(html,/Not completed yet/);
});
test('empty and legacy checklists are safe and task text is escaped',()=>{
 assert.equal(customerChecklistHtml(null),'');assert.equal(customerChecklistHtml([]),'');
 const html=customerChecklistHtml([{task:'<script>alert(1)</script>',section:'<img onerror=x>',completed:true},{task:'Dust'}]);
 assert.doesNotMatch(html,/<script|<img/);assert.match(html,/&lt;script&gt;/);assert.match(html,/General/);assert.match(html,/Completed/);
});
