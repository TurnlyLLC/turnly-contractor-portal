const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {SERVICES}=require('./residential-pricing.cjs');
const page=fs.readFileSync(path.join(__dirname,'../cleaning-scope.html'),'utf8');
const policies={};
for(const scope of ['standard','deep']){
 const match=page.match(new RegExp(`<article id="${scope}"[^>]*>([\\s\\S]*?)</article>`));
 if(!match)throw new Error('Missing published cleaning scope: '+scope);
 const html=match[1].replace(/<nav[\s\S]*?<\/nav>/g,'').replace(/\s+id="[^"]*"/g,'').replace(/<details(?: open)?>/g,'<details open>');
 const digest=createHash('sha256').update(html).digest('hex');
 policies[scope]={scope,version:'sha256:'+digest,html};
}
function policy(service){
 if(!Object.hasOwn(SERVICES,service))throw Object.assign(new Error('Choose a cleaning service.'),{status:400});
 return {...policies[service==='standard'?'standard':'deep'],service,label:SERVICES[service]};
}
function accept(input){
 const p=policy(input.service);
 if(input.scope_accepted!==true||input.scope_reviewed!==true||input.scope_service!==p.service||input.scope_version!==p.version)
  throw Object.assign(new Error('Review and accept the scope of work for your selected cleaning service before continuing.'),{status:400});
 // The booking's database-created timestamp records when this acceptance was received.
 // No request-time clock is included here: retries must keep the same booking hash.
 return {accepted:true,service:p.service,scope:p.scope,version:p.version,statement:`I have reviewed and accept the included tasks, exclusions, add-on requirements and service guidelines for my ${p.label.toLowerCase()}.`,policy_html:p.html};
}
module.exports={policy,accept,policies};
