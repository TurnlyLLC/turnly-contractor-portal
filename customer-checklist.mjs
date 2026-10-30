const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function checklistRooms(items) {
  const rooms=new Map();
  for(const item of Array.isArray(items)?items:[]) {
    if(!item?.task) continue;
    const title=String(item.section||'General').trim()||'General';
    const instance=String(item.roomInstance||'1');
    const key=JSON.stringify([item.roomId||title,instance]);
    if(!rooms.has(key)) rooms.set(key,{title,instance,items:[]});
    rooms.get(key).items.push(item);
  }
  return [...rooms.values()];
}

export function customerChecklistHtml(items) {
  const rooms=checklistRooms(items);
  if(!rooms.length) return '';
  const tasks=rooms.flatMap(room=>room.items);
  const progress=rows=>`${rows.filter(item=>item.completed).length} of ${rows.length} complete`;
  return `<details class="customer-checklist"><summary><span>Cleaning checklist<small>${progress(tasks)}</small></span></summary><div class="checklist-rooms"><p class="fine">Expand a room to see the tasks your cleaner has completed.</p>${rooms.map(room=>{
    const repeated=rooms.filter(other=>other.title===room.title).length>1;
    const title=room.title+(repeated?` ${room.instance}`:'');
    return `<details class="checklist-room"><summary><span>${escapeHtml(title)}<small>${progress(room.items)}</small></span></summary><ul>${room.items.map(item=>`<li class="check-row ${item.completed?'done':''}"><span aria-hidden="true">${item.completed?'✓':'○'}</span><span>${escapeHtml(item.task)}<small>${item.completed?'Completed':'Not completed yet'}</small></span></li>`).join('')}</ul></details>`;
  }).join('')}</div></details>`;
}
