// Compact discovery/execution surface over the SAME authenticated Turnly API.
// No service-role shortcut: every action retains the caller's scopes and deletion policy.
const S=require('../lib/residential-server.cjs'),I=require('../lib/integrations.cjs'),P=require('../lib/integration-platform.cjs'),M=require('./turnly-mcp.js');
const tools=[
 {name:'turnly_tool_schema',description:'Find exact Turnly tool schemas by name or topic. Use a narrow query. Business workflows are documented by executing turnly_admin_guide with input.topic.',inputSchema:{type:'object',properties:{query:{type:'string'}},required:['query'],additionalProperties:false},annotations:{readOnlyHint:true}},
 {name:'turnly_run',description:'Execute a published Turnly tool. Supply its exact name and JSON-encoded arguments. All existing permissions, revision checks, confirmations, idempotency and deletion restrictions apply. Read current records before writes and read back afterward.',inputSchema:{type:'object',properties:{name:{type:'string'},arguments_json:{type:'string'}},required:['name','arguments_json'],additionalProperties:false},annotations:{readOnlyHint:false,destructiveHint:true}}
];
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');let id=null;
 try{
  const db=S.database(),key=await I.apiKey(db,req,'catalog:read');
  if(req.method!=='POST'){res.setHeader('Allow','POST');return S.json(res,405,{error:'Use POST.'});}
  const b=await require('../lib/integration-body.cjs').read(req);id=b?.id;if(!b||b.jsonrpc!=='2.0'||JSON.stringify(b).length>32000)throw S.fail('Invalid request.',400);
  const reply=result=>S.json(res,200,{jsonrpc:'2.0',id,result});
  if(b.method==='notifications/initialized'){res.statusCode=202;return res.end();}
  if(b.method==='initialize')return reply({protocolVersion:['2025-03-26','2025-06-18','2025-11-25'].includes(b.params?.protocolVersion)?b.params.protocolVersion:'2025-06-18',capabilities:{tools:{}},serverInfo:{name:'alice-turnly',version:'1.0.0'}});
  if(b.method==='ping')return reply({});
  if(b.method==='tools/list')return reply({tools});
  if(b.method!=='tools/call')throw S.fail('Unknown method.',400);
  const record=S.checked(await db.from('integration_keys').select('scopes,deny_record_deletion').eq('id',key).single()),allowed=M.definitions(record.scopes,record),a=b.params?.arguments||{};
  let result;
  if(b.params.name==='turnly_tool_schema'){
   const q=String(a.query||'').trim().toLowerCase();if(!q||q.length>100)throw S.fail('Use a focused tool query.');
   const exact=allowed.filter(t=>t.name===q),matches=exact.length?exact:allowed.filter(t=>t.name.includes(q.replaceAll('.','_')));
   result={tools:matches.slice(0,6),more:matches.length>6};
  }else if(b.params.name==='turnly_run'){
   if(!allowed.some(t=>t.name===a.name)||a.name==='turnly_api_catalog')throw S.fail('Tool unavailable; use focused schema discovery.',403);
   const args=JSON.parse(a.arguments_json);if(!args||Array.isArray(args)||typeof args!=='object')throw S.fail('Arguments must be an object.');
   result=await P.execute(db,M.toolRequest(a.name,args,req.headers));
  }else throw S.fail('Unknown tool.',404);
  const text=JSON.stringify(result);
  // Bound model context. Never silently call a truncated response a complete result.
  return reply({content:[{type:'text',text:text.length<=10000?text:JSON.stringify({truncated:true,message:'Response exceeds the conversation limit. Repeat a focused read with fewer fields/rows or use a summary action. Do not repeat a write; inspect current state.',preview:text.slice(0,8000)})}]});
 }catch(e){return S.json(res,e.status===401?401:200,{jsonrpc:'2.0',id,result:{isError:true,content:[{type:'text',text:e.status?e.message:'Operation unavailable; check current state before retrying.'}]}});}
};
module.exports.tools=tools;
