const S=require('./residential-server.cjs');
const VERSION='20261027-v2';
const LESSONS=[{id:'introduction',title:'Turnly sales: realtor gift cards',seconds:150.363}];
async function ready(db,user){return S.checked(await db.rpc('crm_seller_training_ready',{p_user:user.id}))===true;}
async function requireComplete(db,user){if(!await ready(db,user))throw S.fail('Complete sales onboarding: watch the introduction, review the playbook, and sign your seller agreement before outreach.',403);}
async function status(db,user){
 const [progress,review]=await Promise.all([db.from('crm_training_progress').select('lesson,watched_seconds,completed_at').eq('user_id',user.id).eq('version',VERSION),db.from('crm_training_reviews').select('acknowledged_at').eq('user_id',user.id).eq('version',VERSION).maybeSingle()]);
 const rows=S.checked(progress),ack=S.checked(review);
 const lessons=LESSONS.map(l=>({...l,...rows.find(r=>r.lesson===l.id)}));
 return {version:VERSION,lessons,acknowledged_at:ack?.acknowledged_at||null,ready:lessons.every(l=>!!l.completed_at)&&!!ack};
}
module.exports={VERSION,LESSONS,ready,requireComplete,status};
