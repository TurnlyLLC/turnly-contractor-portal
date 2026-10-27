// Request notes are separate from access instructions and internal admin notes.
export function propertyManagerNotes(row) {
 let m=row?.metadata || {};
 if(typeof m==='string'){try{m=JSON.parse(m)||{};}catch{m={};}}
 const value=m.property_manager_notes ?? row?.property_manager_notes;
 if(typeof value==='string') return value.trim();
 return m.source==='property_manager_turn_request' && typeof row?.special_instructions==='string' ? row.special_instructions.trim() : '';
}
const escape = v => String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function propertyManagerNotesHtml(row, preview=false) {
 const notes=propertyManagerNotes(row);if(!notes)return '';
 const short=preview&&notes.length>240;
 return `<section class="property-manager-notes" style="grid-column:1/-1;min-width:0;padding:12px;border:1px solid #bddbd7;border-radius:10px;background:#edf7f5;color:#17384a;text-align:left"><strong style="display:block;font-size:13px;color:#076e65">Property manager notes</strong><p style="margin:6px 0 0;white-space:pre-wrap;overflow-wrap:anywhere;color:#17384a;font-size:14px">${escape(short?notes.slice(0,240)+'…':notes)}</p>${short?'<small style="display:block;margin-top:6px">Open assignment for full notes</small>':''}</section>`;
}
