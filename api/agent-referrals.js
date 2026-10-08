const { createClient }=require('@supabase/supabase-js');
const { randomUUID,createHash }=require('node:crypto');
const { ORIGIN,uuid,codeValid,clean,phone,email,agentInput,referralUrl,qrImage,placement,makeFlyer }=require('../lib/agent-referrals.cjs');
const admins=new Set(['admin','owner','super_admin']);
const roles=new Set([...admins,'sales','sales_team']);
function json(res,status,data){res.statusCode=status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(data));}
function checked(result){if(result.error) throw Object.assign(new Error('Unable to save or load referral data.'),{dbCode:result.error.code}); return result.data;}
async function readBody(req){
  if(req.body && typeof req.body==='object') return req.body;
  if(typeof req.body==='string') return JSON.parse(req.body);
  let raw='';for await(const chunk of req){raw+=chunk.toString();if(Buffer.byteLength(raw)>3600000) throw new Error('Request is too large.');}return JSON.parse(raw||'{}');
}
async function access(client,req){
  const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
  if(!token) throw Object.assign(new Error('Sign in to the sales portal.'),{status:401});
  const auth=await client.auth.getUser(token);
  if(auth.error||!auth.data?.user) throw Object.assign(new Error('Your session expired. Sign in again.'),{status:401});
  const profile=checked(await client.from('profiles').select('role,status').eq('id',auth.data.user.id).maybeSingle());
  if(!profile||!roles.has(profile.role)||['inactive','disabled','suspended','rejected'].includes(profile.status)) throw Object.assign(new Error('Active admin or sales access is required.'),{status:403});
  return {id:auth.data.user.id,admin:admins.has(profile.role)};
}
function requireAdmin(user){if(!user.admin) throw Object.assign(new Error('Only admins can import leads, configure flyers, or manage referral payments.'),{status:403});}
function capabilities(){return {email:!!(process.env.RESEND_API_KEY&&process.env.REFERRAL_FROM_EMAIL),sms:!!(process.env.TWILIO_ACCOUNT_SID&&process.env.TWILIO_AUTH_TOKEN&&process.env.TWILIO_MESSAGING_SERVICE_SID)};}
async function settings(client){return checked(await client.from('referral_settings').select('*').eq('id',true).single());}
async function findAgent(client,id){if(!uuid(id)) throw new Error('Choose an agent.');const a=checked(await client.from('referral_agents').select('*').eq('id',id).single());if(!a)throw new Error('Agent not found.');return a;}
async function flyer(client,a,config){
  const template=config.template_path
    ?await checked(await client.storage.from('agent-flyer-templates').download(config.template_path)).arrayBuffer()
    :require('node:fs').readFileSync(require('node:path').join(__dirname,'../assets/agent-referral-template.png'));
  const bytes=await makeFlyer(template,config,a.referral_code);
  const path=`${a.referral_code}/${config.updated_at.replace(/[^0-9]/g,'')}.pdf`;
  checked(await client.storage.from('agent-flyers').upload(path,bytes,{contentType:'application/pdf',upsert:true,cacheControl:'3600'}));
  const url=client.storage.from('agent-flyers').getPublicUrl(path).data.publicUrl;
  return {bytes,url};
}
async function providerFetch(url,options){
  const response=await fetch(url,{...options,signal:AbortSignal.timeout(18000)});
  const body=await response.json().catch(()=>({}));
  if(!response.ok)throw Object.assign(new Error('The sending service rejected this message. Check sender setup and recipient details.'),{definitive:true});
  return body;
}
async function sendChannel(client,a,user,channel,requestId,asset){
  let recipient;
  try{recipient=channel==='email'?email(a.email):phone(a.phone);}catch(error){return {channel,status:'failed',error:error.message};}
  const existing=checked(await client.from('referral_deliveries').select('*').eq('request_id',requestId).eq('channel',channel).maybeSingle());
  if(existing){if(existing.agent_id!==a.id)throw new Error('This send request belongs to another agent.');return existing;}
  const config=capabilities();
  if(!config[channel])return {channel,status:'not_configured',error:`${channel==='email'?'Email':'Text'} sending is not connected yet.`};
  if(!recipient)return {channel,status:'failed',error:`Add the agent's ${channel==='email'?'email address':'phone number'}.`};
  if(channel==='sms'&&!a.sms_consent)return {channel,status:'failed',error:'Record the agent’s permission to receive texts before sending.'};
  const inserted=await client.from('referral_deliveries').insert({request_id:requestId,agent_id:a.id,channel,recipient,created_by:user.id}).select('*').single();
  if(inserted.error?.code==='23505')return checked(await client.from('referral_deliveries').select('*').eq('request_id',requestId).eq('channel',channel).single());
  const record=checked(inserted);
  let update;
  try{
    let result;
    if(channel==='email'){
      result=await providerFetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`agent-${record.id}`},body:JSON.stringify({from:process.env.REFERRAL_FROM_EMAIL,to:[recipient],subject:'Your Turnly referral flyer and signup link',text:`Hi ${a.name},\n\nYour personalized Turnly flyer is attached. Share this signup link with your clients:\n${referralUrl(a.referral_code)}\n\nReferral ID: ${a.referral_code}\nYou earn 10% of the eligible cleaning subtotal on each referred customer's first completed and paid clean.\n\nTurnly`,attachments:[{filename:'Turnly-referral-flyer.pdf',content:asset.bytes.toString('base64')}]})});
      if(!result.id)throw new Error('Sending service returned no message ID.');
      update={status:'accepted',provider_id:result.id,error:null};
    }else{
      result=await providerFetch(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`,{method:'POST',headers:{Authorization:'Basic '+Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({To:recipient,MessagingServiceSid:process.env.TWILIO_MESSAGING_SERVICE_SID,Body:`Turnly: Your personalized flyer: ${asset.url}\nClient signup: ${referralUrl(a.referral_code)}\nReply STOP to opt out.`}).toString()});
      if(!result.sid)throw new Error('Sending service returned no message ID.');
      update={status:result.status||'queued',provider_id:result.sid,error:null};
    }
  }catch(error){update={status:error.definitive?'failed':'unknown',error:error.definitive?error.message:'Delivery could not be confirmed. Check the sending service before retrying to avoid duplicate messages.'};}
  const saved=await client.from('referral_deliveries').update({...update,updated_at:new Date().toISOString()}).eq('id',record.id).select('*').single();
  if(saved.error)return {...record,...update,warning:'Message result could not be saved. Check the sending service before retrying.'};
  return saved.data;
}
module.exports=async function handler(req,res){
  if(req.method!=='POST'){res.setHeader('Allow','POST');return json(res,405,{error:'Method not allowed.'});}
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SERVICE_KEY||process.env.SUPABASE_SERVICE_ROLE||process.env.SUPABASE_SECRET_KEY;
  if(!key)return json(res,503,{error:'Referral service needs its server database connection.'});
  const client=createClient(process.env.SUPABASE_URL||'https://nwnzdoveskthebfyndcs.supabase.co',key,{auth:{persistSession:false,autoRefreshToken:false}});
  try{
    const body=await readBody(req);
    if(!body||typeof body!=='object'||Array.isArray(body)||Buffer.byteLength(JSON.stringify(body))>3600000)throw new Error('Invalid request.');
    if(['context','register'].includes(body.action)){
      if(!codeValid(body.code))throw new Error('This referral link is invalid.');
      const a=checked(await client.from('referral_agents').select('name,referral_code,status').eq('referral_code',body.code).eq('status','active').maybeSingle());
      if(!a)return json(res,404,{error:'This referral link is no longer active. Contact Turnly for help.'});
      if(body.action==='context')return json(res,200,{agent:{name:a.name,code:a.referral_code}});
      if(body.website)return json(res,200,{ok:true});
      const name=clean(body.name,160),em=email(body.email),ph=phone(body.phone),address=clean(body.address,300),city=clean(body.city,120);
      if(!name||!em||!ph||!address||!city)throw new Error('Name, email, phone, street address, and city are required.');
      const ip=String(req.headers['x-vercel-forwarded-for']||req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0].trim();
      const rateKey=createHash('sha256').update('turnly-referral:'+ip).digest('hex');
      const allowed=checked(await client.rpc('allow_referral_request',{p_key:rateKey}));
      if(!allowed)return json(res,429,{error:'Too many requests. Please try again later.'});
      checked(await client.rpc('register_agent_referral',{p_code:body.code,p_name:name,p_email:em,p_phone:ph,p_address:address,p_city:city,p_notes:clean(body.notes,3000)}));
      return json(res,200,{ok:true});
    }
    const user=await access(client,req);
    if(body.admin_view)requireAdmin(user);
    if(body.action==='list'){
      const page=Math.max(1,Math.floor(Number(body.page)||1));
      let query=client.from('referral_agents').select('*',{count:'exact'}).order('city_rank').order('city').order('name').order('id');
      if(clean(body.city))query=query.eq('city',clean(body.city));
      if(body.status && body.status!=='all')query=query.eq('status',body.status);
      if(clean(body.search))query=query.ilike('name','%'+clean(body.search,100).replace(/[%,_\\]/g,'')+'%');
      const result=await query.range((page-1)*25,page*25-1);checked(result);
      return json(res,200,{agents:result.data,total:result.count,page,admin:user.admin,settings:await settings(client),sending:capabilities(),cities:checked(await client.rpc('referral_city_counts'))});
    }
    if(body.action==='save'){
      const prior=body.id?await findAgent(client,body.id):{};
      const row=agentInput({...prior,...body.agent});let result;
      if(body.id){if(!uuid(body.id))throw new Error('Invalid agent.');result=await client.from('referral_agents').update(row).eq('id',body.id).select('*').single();}
      else{requireAdmin(user);result=await client.from('referral_agents').insert({...row,created_by:user.id}).select('*').single();}
      const a=checked(result);return json(res,200,{agent:a,link:a.referral_code?referralUrl(a.referral_code):null,qr:a.referral_code?await qrImage(a.referral_code):null});
    }
    if(body.action==='import'){
      requireAdmin(user);if(!Array.isArray(body.rows)||!body.rows.length||body.rows.length>500)throw new Error('Import between 1 and 500 agents at a time.');
      const rows=body.rows.map((row,index)=>{try{return {...agentInput({...row,status:'new',sms_consent:false}),source_key:'csv:'+createHash('sha256').update(JSON.stringify(row)).digest('hex'),created_by:user.id};}catch(e){throw new Error(`Row ${index+2}: ${e.message}`);}});
      // One transaction handles the whole upload without hundreds of network calls.
      return json(res,200,checked(await client.rpc('import_referral_agents',{p_rows:rows,p_actor:user.id})));
    }
    if(body.action==='detail'){
      const a=await findAgent(client,body.id);
      const ledger=checked(await client.from('referral_ledger').select('*').eq('agent_id',a.id).order('created_at',{ascending:false}).limit(500));
      const deliveries=checked(await client.from('referral_deliveries').select('*').eq('agent_id',a.id).order('created_at',{ascending:false}).limit(30));
      return json(res,200,{agent:a,ledger,deliveries,link:a.referral_code?referralUrl(a.referral_code):null,qr:a.referral_code?await qrImage(a.referral_code):null});
    }
    if(body.action==='template'){
      requireAdmin(user);const pos=placement(body);
      let path=(await settings(client)).template_path;
      if(body.pdf){
        const bytes=Buffer.from(String(body.pdf),'base64');if(bytes.length>2500000||bytes.subarray(0,5).toString()!=='%PDF-')throw new Error('Upload a PDF under 2.5 MB.');
        await makeFlyer(bytes,pos,'TA-'+'A'.repeat(32)); // Validate page and placement before persisting.
        path=randomUUID()+'.pdf';checked(await client.storage.from('agent-flyer-templates').upload(path,bytes,{contentType:'application/pdf'}));
      }
      if(!path)throw new Error('Choose your flyer PDF.');
      if(!body.pdf){const file=checked(await client.storage.from('agent-flyer-templates').download(path));await makeFlyer(await file.arrayBuffer(),pos,'TA-'+'A'.repeat(32));}
      const update={...pos,template_path:path,updated_at:new Date().toISOString()};if(body.pdf)update.template_name=clean(body.name,150);
      checked(await client.from('referral_settings').update(update).eq('id',true));return json(res,200,{ok:true});
    }
    if(['flyer','send'].includes(body.action)){
      let a=await findAgent(client,body.id);
      if(!a.referral_code)a=checked(await client.from('referral_agents').update({referral_code:'TA-'+randomUUID().replace(/-/g,'').toUpperCase()}).eq('id',a.id).select('*').single());
      if(body.action==='send'&&!uuid(body.request_id))throw new Error('Invalid send request.');
      const asset=await flyer(client,a,await settings(client));
      if(body.action==='flyer')return json(res,200,{url:asset.url});
      // Each channel has an independent durable result. Never call acceptance delivery.
      const channels=body.channels||['email','sms'];
      if(!Array.isArray(channels)||!channels.length||channels.length>2||channels.some(c=>!['email','sms'].includes(c))||new Set(channels).size!==channels.length)throw new Error('Choose email, text, or both.');
      const recipientAgent={...a};
      for(const channel of channels){
        const key=channel==='email'?'email':'phone',chosen=body[key];
        const allowed=channel==='email'?[a.email,a.email_2,a.email_3]:[a.phone,a.phone_1,a.phone_2,a.phone_3,a.email_1_phone,a.email_2_phone,a.email_3_phone];
        if(chosen!==undefined){if(!allowed.includes(chosen))throw new Error('Choose a saved contact for this agent.');recipientAgent[key]=chosen;}
      }
      const results=[];for(const channel of channels)results.push(await sendChannel(client,recipientAgent,user,channel,body.request_id,asset));
      const successful=results.some(r=>['accepted','queued','sending','sent','delivered','read'].includes(r.status)&&r.provider_id&&!r.warning);
      let activated=false,activation_error;
      if(successful){
        const saved=await client.from('referral_agents').update({status:'active'}).eq('id',a.id).select('*').single();
        if(saved.error)activation_error='Flyer accepted by the sender, but activation could not be saved. Set the agent to Active before sharing their link.';
        else activated=true;
      }
      return json(res,200,{results,activated,activation_error});
    }
    if(body.action==='delivery_status'){
      if(!uuid(body.id))throw new Error('Invalid message.');
      const record=checked(await client.from('referral_deliveries').select('*').eq('id',body.id).single());
      if(!record.provider_id)return json(res,200,{delivery:record});
      let status;
      if(record.channel==='email'){
        if(!capabilities().email)throw new Error('Email sending is not connected.');
        const result=await providerFetch(`https://api.resend.com/emails/${encodeURIComponent(record.provider_id)}`,{headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`}});status=result.last_event||record.status;
      }else{
        if(!capabilities().sms)throw new Error('Text sending is not connected.');
        const result=await providerFetch(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages/${encodeURIComponent(record.provider_id)}.json`,{headers:{Authorization:'Basic '+Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64')}});status=result.status||record.status;
      }
      return json(res,200,{delivery:checked(await client.from('referral_deliveries').update({status,updated_at:new Date().toISOString()}).eq('id',record.id).select('*').single())});
    }
    if(body.action==='assignments'){
      requireAdmin(user);const term=clean(body.search,80).replace(/[%,_\\]/g,'');
      if(!term)return json(res,200,{assignments:[]});
      const rows=checked(await client.from('assignment_blocks').select('id,property_name,status,start_window').ilike('property_name',`%${term}%`).order('start_window',{ascending:false}).limit(20));return json(res,200,{assignments:rows});
    }
    if(body.action==='link_clean'){
      requireAdmin(user);if(!uuid(body.customer_id)||!uuid(body.assignment_id))throw new Error('Choose a customer and their first clean.');
      const subtotal=Number(body.subtotal);if(!Number.isFinite(subtotal)||subtotal<=0||subtotal>100000||Math.round(subtotal*100)/100!==subtotal)throw new Error('Enter the cleaning subtotal, excluding tax and tips.');
      const customer=checked(await client.from('referral_customers').select('*').eq('id',body.customer_id).single());
      if(customer.first_assignment_id||customer.payout_at)throw new Error('This customer already has a first clean linked.');
      checked(await client.from('assignment_blocks').select('id').eq('id',body.assignment_id).single());
      const saved=checked(await client.from('referral_customers').update({first_assignment_id:body.assignment_id,eligible_subtotal:subtotal,linked_by:user.id}).eq('id',body.customer_id).is('first_assignment_id',null).select('id'));
      if(!saved.length)throw new Error('Another user already linked this customer. Refresh the record.');return json(res,200,{ok:true});
    }
    if(body.action==='record_customer_payment'){
      requireAdmin(user);if(!uuid(body.customer_id)||!clean(body.reference,300))throw new Error('Enter the customer payment reference.');
      const saved=checked(await client.from('referral_customers').update({manual_paid_at:new Date().toISOString(),payment_reference:clean(body.reference,300)}).eq('id',body.customer_id).not('first_assignment_id','is',null).is('payout_at',null).select('id'));
      if(!saved.length)throw new Error('Link the first clean before recording customer payment.');return json(res,200,{ok:true});
    }
    if(body.action==='record_payout'){
      requireAdmin(user);if(!uuid(body.customer_id)||!clean(body.reference,300))throw new Error('Enter the referral payout reference.');
      checked(await client.rpc('record_referral_payout',{p_customer:body.customer_id,p_reference:clean(body.reference,300),p_actor:user.id}));return json(res,200,{ok:true});
    }
    throw new Error('Unknown action.');
  }catch(error){
    const message=error.dbCode==='23505'?'This email, phone, or clean is already linked to another record.':error.message;
    return json(res,error.status||(error.dbCode?503:400),{error:message||'Unable to complete this request.'});
  }
};
