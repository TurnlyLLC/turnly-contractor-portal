const crypto = require('node:crypto');
const S = require('./residential-server.cjs');
const ORIGIN = 'https://portal.turnlypros.com';
const RESOURCE = ORIGIN + '/api/turnly-mcp';
const CALLBACK = 'https://chatgpt.com/connector_platform_oauth_redirect';
const SCOPE = 'platform:full';
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const secret = prefix => prefix + crypto.randomBytes(32).toString('base64url');
const challenge = value => crypto.createHash('sha256').update(value).digest('base64url');
function error(message, code = 'invalid_request', status = 400) {
  return Object.assign(S.fail(message, status), { oauthCode: code });
}
function registration(body) {
  if (!Array.isArray(body.redirect_uris) || body.redirect_uris.length !== 1 || body.redirect_uris[0] !== CALLBACK) throw error('Only the ChatGPT production callback is supported.', 'invalid_redirect_uri');
  if (body.token_endpoint_auth_method && body.token_endpoint_auth_method !== 'none') throw error('Use public-client PKCE authentication.', 'invalid_client_metadata');
  if (body.grant_types && (!Array.isArray(body.grant_types) || body.grant_types.some(v => !['authorization_code','refresh_token'].includes(v)))) throw error('Unsupported grant type.');
  if (body.response_types && (!Array.isArray(body.response_types) || body.response_types.some(v => v !== 'code'))) throw error('Unsupported response type.');
  return { client_name: 'ChatGPT', redirect_uris: [CALLBACK], token_endpoint_auth_method: 'none', grant_types: ['authorization_code','refresh_token'], response_types: ['code'] };
}
function authorization(q) {
  if (q.response_type !== 'code' || q.redirect_uri !== CALLBACK || !/^[0-9a-f-]{36}$/.test(q.client_id || '')) throw error('Invalid authorization request.');
  if (q.resource !== RESOURCE) throw error('This authorization is only for the Turnly MCP server.', 'invalid_target');
  if (q.scope !== SCOPE) throw error('Choose the platform:full permission.', 'invalid_scope');
  if (q.code_challenge_method !== 'S256' || !/^[A-Za-z0-9_-]{43}$/.test(q.code_challenge || '')) throw error('S256 PKCE is required.');
  if (typeof q.state !== 'string' || q.state.length < 8 || q.state.length > 2000) throw error('An OAuth state is required.');
  return { client_id:q.client_id, redirect_uri:CALLBACK, resource:RESOURCE, scope:SCOPE, code_challenge:q.code_challenge, state:q.state };
}
function metadata() {
  return { issuer:ORIGIN, authorization_endpoint:ORIGIN+'/oauth-authorize.html', token_endpoint:ORIGIN+'/api/turnly-oauth?action=token', registration_endpoint:ORIGIN+'/api/turnly-oauth?action=register', revocation_endpoint:ORIGIN+'/api/turnly-oauth?action=revoke', response_types_supported:['code'], grant_types_supported:['authorization_code','refresh_token'], token_endpoint_auth_methods_supported:['none'], revocation_endpoint_auth_methods_supported:['none'], code_challenge_methods_supported:['S256'], scopes_supported:[SCOPE], authorization_response_iss_parameter_supported:true };
}
function protectedResource() { return {resource:RESOURCE,authorization_servers:[ORIGIN],scopes_supported:[SCOPE],bearer_methods_supported:['header'],resource_name:'Turnly Business'}; }
async function body(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    if (Buffer.byteLength(JSON.stringify(req.body)) > 12000) throw error('Request too large.');
    return req.body;
  }
  let raw=req.body ? String(req.body) : '';
  if(!raw) for await(const chunk of req){raw+=chunk.toString();if(Buffer.byteLength(raw)>12000)throw error('Request too large.');}
  if(Buffer.byteLength(raw)>12000)throw error('Request too large.');
  if(String(req.headers['content-type']||'').includes('application/x-www-form-urlencoded')) {
    const params=new URLSearchParams(raw);for(const key of params.keys())if(params.getAll(key).length!==1)throw error('Duplicate parameter.');
    return Object.fromEntries(params);
  }
  try{return JSON.parse(raw||'{}');}catch{throw error('Invalid request body.');}
}
module.exports={ORIGIN,RESOURCE,CALLBACK,SCOPE,hash,secret,challenge,error,registration,authorization,metadata,protectedResource,body};
