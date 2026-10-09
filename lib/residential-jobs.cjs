// Residential jobs use the existing assignment board. Booking UUIDs also identify
// their assignments, so concurrent webhook retries cannot create duplicate jobs.
const source='residential_booking';
const checked=r=>{if(r.error)throw new Error('Residential job synchronization needs attention.');return r.data;};
function assignmentFor(b){
  // Resolve the service date's Eastern offset independently of an early charge window.
  const probe=new Date(b.service_date+'T12:00:00Z');
  const hour=Number(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'2-digit',hourCycle:'h23'}).format(probe));
  const zone=hour===8?'-04:00':'-05:00';
  return {id:b.id,title:`Residential clean - ${b.name}`,property_name:`Residential - ${b.name}`,
    address:[b.property_address,b.city,b.state,b.zip].filter(Boolean).join(', '),
    service_type:b.quote.service_label,pay_amount:0,status:'pending',visibility:'pending',priority:'normal',
    start_window:new Date(`${b.service_date}T${b.arrival_start.slice(0,5)}:00${zone}`).toISOString(),
    end_window:new Date(`${b.service_date}T${b.arrival_end.slice(0,5)}:00${zone}`).toISOString(),
    scope:`${b.quote.service_label}. ${b.sqft} sq ft; ${b.beds} bedrooms, ${b.baths} bathrooms.`,
    special_instructions:b.notes||'',assignment_type:'one_time',recurrence_frequency:'one_time',auto_renewal:false,
    metadata:{source,residential_booking_id:b.id,admin_approval_status:'pending',residential_frequency:b.frequency,pay_review_required:true}};
}
async function syncBooking(db,b,actor=null){
  if(b.assignment_deleted_at)return null;
  let job=checked(await db.from('assignment_blocks').select('id,status,pay_amount,assigned_to_name,claimed_by_name,metadata,completed_by').eq('id',b.id).maybeSingle());
  if(job&&job.metadata?.source!==source)throw new Error('Residential assignment ID conflicts with another job.');
  if(!job&&b.status==='scheduled'){
    checked(await db.from('assignment_blocks').upsert(assignmentFor(b),{onConflict:'id',ignoreDuplicates:true}));
    job=checked(await db.from('assignment_blocks').select('id,status,pay_amount,assigned_to_name,claimed_by_name,metadata,completed_by').eq('id',b.id).single());
  }
  if(!job)return null;
  if(job.metadata?.awaiting_booking&&b.status==='scheduled'){
    checked(await db.from('assignment_blocks').update({status:'pending',visibility:'pending',metadata:{...job.metadata,awaiting_booking:false}}).eq('id',b.id));job.status='pending';
  }
  if(b.status==='cancelled'&&!['cancelled','canceled','completed'].includes(job.status)){
    checked(await db.from('assignment_blocks').update({status:'cancelled',visibility:'closed'}).eq('id',b.id));job.status='cancelled';
  }
  if(b.status==='scheduled'&&b.payment_status==='paid'&&['completed','complete','done','closed'].includes(job.status)){
    checked(await db.rpc('finish_residential_booking',{p_id:b.id,p_actor:job.completed_by||actor,p_cancel:false}));
  }
  if(b.status==='scheduled'&&['cancelled','canceled','declined'].includes(job.status)&&['not_collected','card_saved','action_required'].includes(b.payment_status)){
    checked(await db.rpc('finish_residential_booking',{p_id:b.id,p_actor:actor,p_cancel:true}));
  }
  return job;
}
async function syncBatch(db){
  let synced=0,attention=0,cursor=null;
  // Keyset pagination avoids skipping rows when completion changes their status.
  for(;;){
    let q=db.from('referral_bookings').select('*').in('status',['scheduled','cancelled']).order('id').limit(100);
    if(cursor)q=q.gt('id',cursor);
    const rows=checked(await q);if(!rows.length)break;
    for(let i=0;i<rows.length;i+=8)await Promise.all(rows.slice(i,i+8).map(async b=>{try{await syncBooking(db,b);synced++;}catch{attention++;}}));
    cursor=rows.at(-1).id;if(rows.length<100)break;
  }
  return {synced,attention};
}
module.exports={assignmentFor,syncBooking,syncBatch,source};
