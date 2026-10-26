// Local-only UI preview. Never writes to Supabase or accepts a real signature.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),{CONSENT}=require('../lib/residential-video-consent.cjs');
const sample={id:'fictional-consent',assignment_id:'fictional-assignment',customer_name:'Sample Customer — TEST ONLY',signature:[[[.1,.6],[.2,.2],[.25,.7],[.3,.4],[.4,.6],[.5,.3],[.6,.6],[.75,.4]]],signed_at:'2026-10-26T15:00:00Z',consent_text:CONSENT};
http.createServer((req,res)=>{
 const u=new URL(req.url,'http://localhost');
 if(u.pathname==='/'){res.setHeader('Content-Type','text/html');return res.end(`<html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body><p>LOCAL PREVIEW — fictional assignment, no signatures saved</p><script>window.__ENV={SUPABASE_URL:'test',SUPABASE_ANON_KEY:'test'}</script><script type="module" src="/preview.js${u.search}"></script></body></html>`);}
 if(u.pathname==='/api/assignment-video-consent'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({consent:null,consent_text:CONSENT}));}
 if(u.pathname==='/preview.js'){
  let js=fs.readFileSync(path.join(root,'contractor-job-flow-mobile.js'),'utf8').replace(/import \{ createClient \} from [^;]+;/,`const createClient=()=>({auth:{getSession:async()=>({data:{session:{access_token:'test'}}})}});`);
  js+=`\nsaveChecklistProgress=async()=>{captureChecklistInputs();};activeAssignment={id:'fictional-assignment',title:'Test residential clean',property_name:'Sample home',metadata:{}};activeUser={id:'test'};activeChecklistItems=['before','after'].map(phase=>({id:'residential-video-'+phase+'-1',source_item_id:'residential-video-'+phase,module_id:phase,module_name:phase==='before'?'Before-clean video':'After-clean video',type:'video',media_required:'video',required:true,task:'Record and upload the '+phase+'-clean walkthrough video'}));activeChecklistModules=buildChecklistModules(activeChecklistItems);ensureChecklistDrafts(activeChecklistItems);activeVideoConsent=${u.searchParams.has('signed')?JSON.stringify(sample):'null'};activeVideoConsentText=${JSON.stringify(CONSENT)};ensureChecklistModal().hidden=false;applyVideoWaiver();renderChecklistStep();`;
  res.setHeader('Content-Type','text/javascript');return res.end(js);
 }
 if(u.pathname==='/video-consent.mjs'){res.setHeader('Content-Type','text/javascript');return res.end(fs.readFileSync(path.join(root,'video-consent.mjs')));}
 res.statusCode=404;res.end();
}).listen(8798,'127.0.0.1',()=>console.log('Local video consent preview: http://127.0.0.1:8798'));
