export function organizeFeedback(data){
 const properties=new Map(data.properties.map(p=>[p.id,p])),customers=new Map(data.customers.map(c=>[c.id,c]));
 return data.responses.map(row=>{
  const propertyId=row.portal_property_id||(!row.customer_id?row.resident_feedback_cards?.portal_property_id:null);
  const customer=row.customer_id?customers.get(row.customer_id):null,property=propertyId?properties.get(propertyId):null;
  const segment=customer?'residential':property?'commercial':'unlinked';
  return {...row,segment,ownerId:customer?.id||property?.id||'',groupKey:customer?'customer:'+customer.id:property?'property:'+property.id:'unlinked:'+row.id,
   ownerName:customer?.name||property?.property_name||property?.name||row.property_name||'Unlinked feedback',
   ownerDetail:customer?.email||[property?.address,property?.city,property?.state].filter(Boolean).join(', '),
   tracker:[row.property_code,String(row.card_number||'').padStart(3,'0')].join('-')};
 }).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)||String(b.id).localeCompare(String(a.id)));
}
export function filterFeedback(rows,{segment='commercial',search='',rating='all',owner='all'}){
 const term=search.trim().toLowerCase();return rows.filter(r=>r.segment===segment&&(owner==='all'||r.groupKey===owner)&&(rating==='all'||(rating==='low'?Number(r.rating)<=3:Number(r.rating)===Number(rating)))&&(!term||[r.ownerName,r.ownerDetail,r.message,r.tracker].join(' ').toLowerCase().includes(term)));
}
