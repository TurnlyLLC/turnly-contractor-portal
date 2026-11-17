const S=require('./residential-server.cjs'),{uuid}=require('./agent-referrals.cjs'),Review=require('./integration-review-plans.cjs');
const fields={ambassador:['name','code'],referral:['member_id'],recurring:['status','frequency','price_cents','anchor_day','preferred_contractor_id']};
function validate(kind,data,reason){
 if(!fields[kind]||!data||Array.isArray(data)||!Object.keys(data).length||Object.keys(data).some(k=>!fields[kind].includes(k)))throw S.fail('Use only the documented fields.');
 if(typeof reason!=='string'||reason.trim().length<5||reason.length>500)throw S.fail('Provide a specific reason, up to 500 characters.');
 if('name'in data&&(typeof data.name!=='string'||!data.name.trim()||data.name.length>160))throw S.fail('Provide a name up to 160 characters.');
 if('code'in data&&!/^BA-[A-Z0-9]{16}$/.test(data.code))throw S.fail('Referral code must be BA- followed by 16 uppercase letters or digits. Existing links remain valid.');
 if('member_id'in data&&!uuid(data.member_id))throw S.fail('Choose the destination ambassador UUID.');
 if('status'in data&&!['active','needs_review','cancelled'].includes(data.status))throw S.fail('Choose active, needs_review (paused), or cancelled.');
 if('frequency'in data&&!['weekly','biweekly','monthly'].includes(data.frequency))throw S.fail('Choose weekly, biweekly or monthly.');
 if('price_cents'in data&&(!Number.isInteger(data.price_cents)||data.price_cents<1||data.price_cents>1000000))throw S.fail('Use a positive price in cents, up to $10,000.');
 if('anchor_day'in data&&(!Number.isInteger(data.anchor_day)||data.anchor_day<1||data.anchor_day>31))throw S.fail('Anchor day must be 1–31.');
 if('preferred_contractor_id'in data&&data.preferred_contractor_id!==null&&!uuid(data.preferred_contractor_id))throw S.fail('Choose a contractor UUID or null.');
}
async function rpc(db,name,args){const r=await db.rpc(name,args);if(r.error)throw S.fail(r.error.code==='P0001'?r.error.message:'Could not save this change. Read current state before retrying.',409);return r.data;}
async function snapshot(db,actor,kind,id){if(!fields[kind]||!uuid(id))throw S.fail('Choose an existing record.');return rpc(db,'integration_owner_snapshot',{p_actor:actor,p_kind:kind,p_id:id});}
async function run(db,actor,action,x){
 if(action==='read')return snapshot(db,actor,x.kind,x.id);
 if(action==='plans'){
  let q=db.from('customer_recurring_plans').select('*').order('id').limit(100);
  if(x.after){if(!uuid(x.after))throw S.fail('Use the previous next_cursor.');q=q.gt('id',x.after);}
  if(x.status){if(!['active','needs_review','cancelled'].includes(x.status))throw S.fail('Unknown plan status.');q=q.eq('status',x.status);}
  const data=S.checked(await q);return{data,next_cursor:data.length===100?data.at(-1).id:null};
 }
 if(action==='preview'){
  validate(x.kind,x.data,x.reason);const s=await snapshot(db,actor,x.kind,x.id);
  const effects=x.kind==='ambassador'?['Changes the ambassador profile; former referral links continue working. Login email is unchanged.']:x.kind==='referral'?['Moves referral ownership and unpaid earnings. Paid earnings block this change to preserve payment history.']:['Changes future recurring renewals only. Existing visits, charges and contractor assignments stay unchanged. needs_review pauses renewal; cancelled preserves the plan history.','A price/frequency change or resumed plan requires a customer authorization reference. The original customer acceptance is preserved.'];
  const consent=String(x.customer_authorization_reference||'').trim();
  if(x.kind==='recurring'&&('price_cents'in x.data||'frequency'in x.data||x.data.status==='active')&&consent.length<5)throw S.fail('Provide the reference to the customer’s authorization before changing recurring charges or resuming a plan.');
  if(consent.length>500)throw S.fail('Authorization reference is too long.');
  const review={kind:x.kind,id:x.id,data:x.data,reason:x.reason,revision:s.revision,customer_authorization_reference:consent};
  return{before:s.record,changes:x.data,effects,review_token:await Review.save(db,actor,'owner-expansion',review,{kind:x.kind,id:x.id,changes:x.data,reason:x.reason,effects})};
 }
 if(action!=='apply')throw S.fail('Unsupported operation.');
 const p=await Review.load(db,actor,x.review_token,'owner-expansion');if(p.state==='applied')return p.result;
 validate(p.data.kind,p.data.data,p.data.reason);
 const result=await rpc(db,'integration_owner_apply',{p_actor:actor,p_review:p.id});return result;
}
module.exports={run,validate,fields};
