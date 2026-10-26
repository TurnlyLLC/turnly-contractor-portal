export const isResidentialAssignment = row => row?.metadata?.source === 'residential_booking';
export function residentialCounts(row) {
  const m=row?.metadata||{};
  const match=String(row?.scope||'').match(/(\d+(?:\.\d+)?) bedrooms?,\s*(\d+(?:\.\d+)?) bathrooms?/i);
  return {beds:m.beds ?? match?.[1],baths:m.baths ?? match?.[2]};
}
export function residentialChecklistService(value) {
 return ({standard:'standard','standard clean':'standard',deep:'deep','deep clean':'deep'})[String(value||'').toLowerCase().trim()]||null;
}
export function residentialChecklistReviewReason(beds,baths,service) {
 if(!Number.isInteger(Number(beds))||Number(beds)<1||Number(beds)>7||!Number.isFinite(Number(baths))||Number(baths)<1||Number(baths)>7||!Number.isInteger(Number(baths)*2))return 'Room counts outside the supported 1–7 bedrooms / 1–7 bathrooms (half-bath increments). Review scope and manually attach an appropriate checklist before approval.';
 if(!residentialChecklistService(service))return 'This service has a separate scope. Review and manually attach its checklist before approval.';
 return '';
}
export function matchingResidentialChecklist(templates,beds,baths,service) {
 if(residentialChecklistReviewReason(beds,baths,service))return null;
 const kind=residentialChecklistService(service);
 const candidates=templates.filter(t=>t.scope_type==='residential'&&t.residential_service===kind&&Number(t.residential_beds)===Number(beds)&&Number(t.residential_baths)===Number(baths));
 return candidates.length===1?candidates[0]:null;
}
export function residentialRecurrence(value) {
  return {frequency:value==='biweekly'?'weekly':value,interval:value==='biweekly'?2:1};
}
export function configureResidentialForm(row) {
  const form=document.getElementById('assignmentForm');if(!form)return;
  const residential=isResidentialAssignment(row);form.classList.toggle('residential-assignment-form',residential);
  for(const id of ['propertySelect','qr_tracker_id','priority','preferred_until']){
    const el=document.getElementById(id);if(el)el.closest('label').hidden=residential;
  }
  const name=document.getElementById('property_name');
  if(name){name.closest('label').querySelector('span').textContent=residential?'Customer Name':'Property Name';if(residential)name.value=row.metadata?.customer_name||String(row.property_name||'').replace(/^Residential\s*-\s*/i,'');}
  const field=document.getElementById('service_type');
  if(field){
    const value=row?.service_type||field.value;const next=document.createElement(residential?'select':'input');next.id='service_type';next.name=field.name;
    if(residential){for(const label of ['Standard clean','Deep clean','Move-in clean','Move-out clean','Listing / staging clean'])next.add(new Option(label,label));if(value&&![...next.options].some(o=>o.value===value))next.add(new Option(value,value));}
    next.value=value;field.replaceWith(next);
  }
  const frequency=document.getElementById('assignment_frequency');
  if(frequency){if(!frequency.dataset.originalOptions)frequency.dataset.originalOptions=frequency.innerHTML;
    if(residential){frequency.innerHTML='';for(const [value,label] of [['one_time','One time'],['weekly','Weekly'],['biweekly','Bi-weekly'],['monthly','Monthly']])frequency.add(new Option(label,value));frequency.value=row.recurrence_frequency==='weekly'&&Number(row.recurrence_interval)===2?'biweekly':row.recurrence_frequency||row.assignment_type||'one_time';}
    else {frequency.innerHTML=frequency.dataset.originalOptions;frequency.value=row?.recurrence_frequency||row?.assignment_type||'one_time';}
  }
}
export function residentialChecklistItems(template) {
  const items=[];
  for(const section of template?.sections||[]){
    const add=(item,category)=>{
      const task=item.label||item.task;if(!task)return;
      const type=item.type||item.media_required||'check';
      items.push({id:`${item.id||`item-${items.length}`}-1`,category,task,label:task,type,module_id:section.id||'',module_name:section.title||'General',module_instance:1,source_item_id:item.id||'',required:item.required!==false,media_required:['photo','video'].includes(type)?type:'none',notes:type==='note'?'Contractor should leave a completion note.':''});
    };
    for(const item of section.items||[])add(item,section.title||'General');
    for(const room of section.rooms||[])for(const item of room.items||[])add(item,`${section.title||'General'} / ${room.title}`);
  }
  return items;
}
