const S=require('../lib/residential-server.cjs');
const {uuid}=require('../lib/agent-referrals.cjs');
async function all(db,table,fields){const rows=[];for(let from=0;;from+=500){const r=await db.from(table).select(fields).order('id').range(from,from+499);const data=S.checked(r)||[];rows.push(...data);if(data.length<500)return rows;}}
async function handle(db,input){
 if(input.action==='link'){
  if(!uuid(input.id)||!uuid(input.owner_id)||!['commercial','residential'].includes(input.segment))throw S.fail('Choose a property or customer.');
  const residential=input.segment==='residential';
  const owner=S.checked(await db.from(residential?'referral_customers':'portal_properties').select('id').eq('id',input.owner_id).maybeSingle());
  if(!owner)throw S.fail('That property or customer is no longer available.',404);
  const changed=S.checked(await db.from('resident_feedback_responses').update({customer_id:residential?owner.id:null,portal_property_id:residential?null:owner.id}).eq('id',input.id).select('id'));
  if(!changed?.length)throw S.fail('That feedback no longer exists.',404);
  return {ok:true};
 }
 if(input.action!=='list')throw S.fail('Unsupported feedback action.');
 const [responses,properties,customers]=await Promise.all([
  all(db,'resident_feedback_responses','id,created_at,property_name,property_code,card_number,rating,message,portal_property_id,customer_id,resident_feedback_cards(portal_property_id)'),
  all(db,'portal_properties','id,name,property_name,address,city,state'),
  all(db,'referral_customers','id,name,email')
 ]);
 return {responses,properties,customers};
}
module.exports=async(req,res)=>{
 if(req.method!=='POST')return S.json(res,405,{error:'Method not allowed.'});
 try{const db=S.database();await S.admin(db,req);const input=await S.body(req);return S.json(res,200,await handle(db,input));}
 catch(error){return S.json(res,error.status||503,{error:error.status?error.message:'Unable to load or update feedback. Please retry.'});}
};
module.exports.handle=handle;
