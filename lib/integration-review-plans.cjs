const S=require('./residential-server.cjs'),{uuid}=require('./agent-referrals.cjs');
async function save(db,actor,kind,data,summary){const row=S.checked(await db.from('integration_review_plans').insert({actor,kind,data,summary}).select('id,expires_at').single());return row.id;}
async function load(db,actor,id,kind){if(!uuid(id))throw S.fail('Use the saved review ID from the preview.');const row=S.checked(await db.from('integration_review_plans').select('*').eq('id',id).eq('actor',actor).eq('kind',kind).gt('expires_at',new Date().toISOString()).maybeSingle());if(!row)throw S.fail('Preview expired or belongs to another administrator. Preview again.',409);return row;}
async function finish(db,id,result){S.checked(await db.from('integration_review_plans').update({state:'applied',result}).eq('id',id));}
async function pending(db,actor){return {reviews:S.checked(await db.from('integration_review_plans').select('id,kind,summary,created_at,expires_at').eq('actor',actor).eq('state','pending').gt('expires_at',new Date().toISOString()).order('created_at',{ascending:false}).limit(20))};}
module.exports={save,load,finish,pending};
