const S=require('./residential-server.cjs');
const VERSION='20261027-v2';
const LESSONS=[{id:'introduction',title:'Turnly sales: realtor gift cards',seconds:150.363},{id:'portal',title:'Using your Turnly sales portal',seconds:253.47}];
async function ready(db,user){return S.checked(await db.rpc('crm_seller_training_ready_v3',{p_user:user.id}))===true;}
async function requireComplete(db,user){if(!await ready(db,user))throw S.fail('Complete the onboarding requirements currently enabled for your account before outreach.',403);}
async function status(db,user){
 const [progress,review]=await Promise.all([db.from('crm_training_progress').select('lesson,watched_seconds,completed_at').eq('user_id',user.id).eq('version',VERSION),db.from('crm_training_reviews').select('acknowledged_at').eq('user_id',user.id).eq('version','20261028-v3').maybeSingle()]);
 const sections=S.checked(await db.from('crm_playbook_sections').select('section,completed_at').eq('user_id',user.id).eq('version','20261028-v3'));
 const rows=S.checked(progress),ack=S.checked(review);
 const requirements=S.checked(await db.rpc('crm_onboarding_requirements',{p_user:user.id}));
 const lessons=LESSONS.map(l=>({...l,...rows.find(r=>r.lesson===l.id),required:requirements.training&&requirements[l.id]}));
 return {version:VERSION,requirements,sections,lessons,acknowledged_at:ack?.acknowledged_at||null,ready:await ready(db,user)};
}
module.exports={VERSION,LESSONS,ready,requireComplete,status};
