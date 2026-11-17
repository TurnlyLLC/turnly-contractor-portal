const crypto=require('node:crypto'),S=require('./residential-server.cjs'),I=require('./integrations.cjs'),C=require('./integration-catalog.cjs'),{uuid}=require('./agent-referrals.cjs');

const check=r=>{if(r.error)throw S.fail(r.error.code==='P0001'?r.error.message:'Admin workflow could not finish; read current state before retrying.',409);return r.data;};

const ids=(v,max)=>Array.isArray(v)&&v.length>0&&v.length<=max&&v.every(uuid)&&new Set(v).size===v.length;

function validate(action,i){

 if(['allocate','assign'].includes(action)&&!ids(i.operator_ids,100))throw S.fail('Choose 1–100 distinct active sales operators.');

 if(action==='allocate'&&(!Number.isInteger(i.count)||i.count<1||i.count>2000||['region','city'].some(k=>i[k]!==undefined&&(typeof i[k]!=='string'||i[k].length>120))))throw S.fail('Choose total count 1–2000 and valid region/city.');

 if(action==='assign'&&(!ids(i.lead_ids,2000)||typeof i.only_unassigned!=='boolean'))throw S.fail('Choose distinct leads and explicitly set only_unassigned.');

 if(action==='unassign'&&(!uuid(i.operator_id)||!['all','new_leads','contacted','interested','link_sent','follow_up','active','lost','followups'].includes(i.status)||!Number.isFinite(Date.parse(i.started_at))||Date.parse(i.started_at)>Date.now()+1000))throw S.fail('Choose operator, supported status and fixed cutoff no later than now.');

 if(action==='limits'){

  if(i.rep!==null&&!uuid(i.rep))throw S.fail('rep is null or a sales UUID.');

  const allowed=i.rep?['daily_cents','monthly_cents','paused']:['daily_cents','monthly_cents','paused','calls_paused','texts_paused','max_call_minutes','default_rep_daily_cents','default_rep_monthly_cents','voice_cents_per_minute','sms_cents_per_segment'];

  if(!i.settings||Array.isArray(i.settings)||!Object.keys(i.settings).length||Object.keys(i.settings).some(k=>!allowed.includes(k)))throw S.fail('Use documented budget fields only.');

  for(const [k,v]of Object.entries(i.settings))if(k.includes('paused')?typeof v!=='boolean':!Number.isInteger(v)||v<0||v>10000000)throw S.fail('Use integer cents/limits or boolean pause flags.');

  if(!i.expected_settings||typeof i.expected_settings!=='object'||Array.isArray(i.expected_settings))throw S.fail('Read settings first.');

 }

}

async function run(db,actor,action,input,key){

 validate(action,input);

 if(action==='pending_reviews')return require('./integration-review-plans.cjs').pending(db,actor);

 if(action==='usage')return require('./integration-platform.cjs').invoke(db,actor,{endpoint:'communication-budget',action:'read'}, {},key);

 if(['allocate','assign','unassign','limits'].includes(action))return check(await db.rpc('integration_sales_control',{p_actor:actor,p_operation:action,p_input:input}));

 if(action==='calls'){

  let q=db.from('crm_voice_calls').select('id,lead_id,user_id,phone,status,created_at,dialed_at,answered_at,ended_at,answered_by,duration_seconds').order('id').limit(Math.min(100,Math.max(1,Number(input.limit)||25))+1);

  for(const k of ['lead_id','user_id'])if(input[k]){if(!uuid(input[k]))throw S.fail('Invalid '+k);q=q.eq(k,input[k]);}

  if(input.after){if(!uuid(input.after))throw S.fail('Invalid cursor');q=q.gt('id',input.after);}

  for(const k of ['from','to'])if(input[k]){if(!Number.isFinite(Date.parse(input[k])))throw S.fail('Use ISO dates');q=k==='from'?q.gte('created_at',input[k]):q.lt('created_at',input[k]);}

  const limit=Math.min(100,Math.max(1,Number(input.limit)||25)),rows=check(await q);return {calls:rows.slice(0,limit),next_cursor:rows.length>limit?rows[limit-1].id:null};

 }

 if(action==='connections_list'){const r=await I.manage(db,actor,{action:'list'});return {keys:r.keys,hooks:r.hooks,deliveries:r.deliveries,audit:r.audit,scopes:r.scopes,events:r.events};}

 if(action==='key_create'||action==='hook_create'){

  if(typeof input.name!=='string'||!input.name.trim()||input.name.length>80)throw S.fail('Name must be 1–80 characters.');

  const parent=check(await db.from('integration_keys').select('created_by,scopes,deny_record_deletion,expires_at').eq('id',key).single());

  const handoff=crypto.randomUUID(),id=crypto.randomUUID();let secret,payload;

  if(action==='key_create'){

   if(!Array.isArray(input.scopes)||!input.scopes.length||input.scopes.some(s=>!C.scopes.includes(s)||!parent.scopes.includes('platform:full')&&!parent.scopes.includes(s)))throw S.fail('Choose permissions within this connection’s access.');

   if(!Number.isInteger(input.days)||input.days<1||input.days>365)throw S.fail('Choose expiry 1–365 days.');

   const issued=I.issueKey();secret=issued.secret;payload={id,name:input.name.trim(),secret_hash:issued.secret_hash,prefix:issued.prefix,scopes:[...new Set(input.scopes)],expires_at:new Date(Date.now()+input.days*86400000).toISOString(),deny_record_deletion:parent.deny_record_deletion===true};

  }else{

   if(!Array.isArray(input.events)||!input.events.length||input.events.some(e=>!C.events.includes(e)))throw S.fail('Choose published webhook events.');

   const {u}=await I.resolveTarget(input.url);secret='whsec_'+crypto.randomBytes(32).toString('base64url');payload={id,name:input.name.trim(),url:u.href,events:[...new Set(input.events)],secret_encrypted:I.seal(secret,id)};

  }

  check(await db.rpc('integration_create_connection',{p_actor:actor,p_parent:key,p_kind:action,p_data:payload,p_handoff:handoff,p_secret:I.seal(secret,handoff)}));

  return {id,created:true,record_deletion_allowed:action==='key_create'?!payload.deny_record_deletion:undefined,credential_url:'https://portal.turnlypros.com/integrations.html#handoff='+handoff,credential_expires_in:3600,message:'Secret is available once in the authenticated admin portal; never read it aloud or text it.'};

 }

 const mapped={key_revoke:'revoke_key',hook_toggle:'toggle_hook',hook_test:'test_hook',delivery_retry:'retry_delivery'};

 if(mapped[action]){

  if(!uuid(input.id))throw S.fail('Choose an existing connection/delivery ID.');

  if(action==='key_revoke'){

   const k=check(await db.from('integration_keys').select('name').eq('id',input.id).maybeSingle());

   if(!k)throw S.fail('Key not found.',404);

   if(input.id===key||/private.*(alice|voice)|coding|worker/i.test(k.name))throw S.fail('Manage assistant authentication/worker credentials in the owner interface.',403);

  }

  return I.manage(db,actor,{...input,action:mapped[action]});

 }

 throw S.fail('Unsupported admin control.');

}

module.exports={run,validate,check};
