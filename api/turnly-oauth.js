const S=require('../lib/residential-server.cjs'), I=require('../lib/integrations.cjs'), O=require('../lib/turnly-oauth.cjs');
module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Pragma','no-cache');res.setHeader('X-Content-Type-Options','nosniff');
  try{
    const action=req.query?.action;
    if(req.method==='GET'&&action==='metadata')return S.json(res,200,O.metadata());
    if(req.method==='GET'&&action==='resource')return S.json(res,200,O.protectedResource());
    const db=S.database();
    if(req.method!=='POST')throw O.error('Use POST.','invalid_request',405);
    const input=await O.body(req);await S.rate(db,req,'oauth-'+action);
    if(action==='register'){
      const details=O.registration(input),client_id=require('node:crypto').randomUUID();
      S.checked(await db.from('integration_oauth_clients').insert({id:client_id,redirect_uri:O.CALLBACK}));
      return S.json(res,201,{...details,client_id,client_id_issued_at:Math.floor(Date.now()/1000)});
    }
    if(action==='inspect'||action==='authorize'){
      // Never use ambient cookies for consent: a verified Turnly admin bearer session is mandatory.
      if(req.headers.origin!==O.ORIGIN)throw O.error('Consent must originate on Turnly.','access_denied',403);
      const user=await I.admin(db,req),q=O.authorization(input.request||{});
      const client=S.checked(await db.from('integration_oauth_clients').select('id,redirect_uri').eq('id',q.client_id).maybeSingle());
      if(!client||client.redirect_uri!==q.redirect_uri)throw O.error('Unknown OAuth client.','invalid_client');
      if(action==='inspect')return S.json(res,200,{name:'ChatGPT',scope:q.scope,resource:q.resource,duration_days:365});
      if(input.approved!==true)throw O.error('Explicit authorization is required.','access_denied',403);
      const code=O.secret('tl_code_');
      S.checked(await db.from('integration_oauth_codes').insert({code_hash:O.hash(code),client_id:client.id,created_by:user,redirect_uri:q.redirect_uri,resource:q.resource,scope:q.scope,challenge:q.code_challenge,expires_at:new Date(Date.now()+300000).toISOString()}));
      const redirect=new URL(q.redirect_uri);redirect.searchParams.set('code',code);redirect.searchParams.set('state',q.state);redirect.searchParams.set('iss',O.ORIGIN);
      return S.json(res,200,{redirect:redirect.href});
    }
    if(action==='token'){
      if(!/^[0-9a-f-]{36}$/.test(input.client_id||''))throw O.error('Invalid client.','invalid_client');
      if(input.resource!==O.RESOURCE)throw O.error('Invalid target resource.','invalid_target');
      if(input.scope&&input.scope!==O.SCOPE)throw O.error('Scope cannot change during token exchange.','invalid_scope');
      const access=O.secret('tl_oauth_'),refresh=O.secret('tl_refresh_'),root=O.secret('tl_root_');let args;
      if(input.grant_type==='authorization_code'){
        if(input.redirect_uri!==O.CALLBACK||!/^tl_code_[A-Za-z0-9_-]{43}$/.test(input.code||'')||!/^[A-Za-z0-9._~-]{43,128}$/.test(input.code_verifier||''))throw O.error('Invalid authorization code request.','invalid_grant');
        args={p_kind:'code',p_hash:O.hash(input.code),p_challenge:O.challenge(input.code_verifier),p_redirect:input.redirect_uri};
      }else if(input.grant_type==='refresh_token'){
        if(!/^tl_refresh_[A-Za-z0-9_-]{43}$/.test(input.refresh_token||''))throw O.error('Invalid refresh token.','invalid_grant');
        args={p_kind:'refresh',p_hash:O.hash(input.refresh_token),p_challenge:null,p_redirect:null};
      }else throw O.error('Unsupported grant type.','unsupported_grant_type');
      const r=S.checked(await db.rpc('integration_oauth_exchange',{...args,p_client:input.client_id,p_resource:input.resource,p_access:O.hash(access),p_refresh:O.hash(refresh),p_root:O.hash(root)}));
      if(!r?.ok)throw O.error('Authorization expired, revoked, or already used. Reconnect Turnly.','invalid_grant');
      return S.json(res,200,{access_token:access,token_type:'Bearer',expires_in:3600,refresh_token:refresh,scope:O.SCOPE});
    }
    if(action==='revoke'){
      if(!/^[0-9a-f-]{36}$/.test(input.client_id||'')||!/^tl_(oauth|refresh)_[A-Za-z0-9_-]{43}$/.test(input.token||''))return S.json(res,200,{});
      S.checked(await db.rpc('integration_oauth_revoke',{p_client:input.client_id,p_hash:O.hash(input.token)}));return S.json(res,200,{});
    }
    throw O.error('Unknown OAuth operation.');
  }catch(e){return S.json(res,e.status||503,{error:e.oauthCode||(e.status===401?'access_denied':'server_error'),error_description:e.status?e.message:'Authorization service unavailable.'});}
};
