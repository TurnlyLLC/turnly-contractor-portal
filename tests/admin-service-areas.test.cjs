const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('area counts, multi-area filtering, sorting and pagination use the roster',()=>{
 let source=fs.readFileSync('contractor-crm.mjs','utf8').replace(/^import .*;\s*$/gm,'').replace(/export /g,'');
 const handlers={},nodes=new Map(),node=key=>{if(!nodes.has(key))nodes.set(key,{innerHTML:'',textContent:'',value:'',classList:{},checked:false});return nodes.get(key);};
 const root={querySelector:node,addEventListener:(key,fn)=>handlers[key]=fn};
 const people=[{key:'a',name:'Zoe',email:'z@test',team:'contractor',raw:{role:'contractor'},allowedRegions:['NC:Raleigh','Durham']},{key:'b',name:'Amy',email:'a@test',team:'contractor',raw:{role:'contractor'},allowedRegions:['Asheville']},{key:'c',name:'Cal',email:'c@test',team:'contractor',raw:{role:'contractor'},allowedRegions:[]}];
 const context={document:{addEventListener(){}},esc:v=>String(v??''),contractorAvatar:()=>'',bindAccessManager(){},progressButton:()=>'',roleCell:()=>'',console,Date,Map,Set,URL,Blob,setTimeout};
 vm.createContext(context);vm.runInContext(source+';globalThis.factory=createContractorCRM;',context);
 const crm=context.factory({getPeople:()=>people,reviews:{markup:()=>'',summary:()=>({onboarding:{},training:{}})},fileUrl:()=>'',edit(){},reset(){},refresh(){}});crm.bind(root);crm.render();
 assert.match(node('[data-cc-coverage]').innerHTML,/data-cc-area="raleigh"[^>]*><strong>1/);
 assert.match(node('[data-cc-coverage]').innerHTML,/data-cc-area="__none"[^>]*><strong>1/);
 const change=(attr,value)=>handlers.change({target:{value,dataset:{},matches:s=>s===attr}});
 change('[data-cc-city]','durham');assert.match(node('[data-cc-rows]').innerHTML,/Zoe/);assert.doesNotMatch(node('[data-cc-rows]').innerHTML,/Amy/);
 change('[data-cc-city]','__none');assert.match(node('[data-cc-rows]').innerHTML,/Cal/);assert.doesNotMatch(node('[data-cc-rows]').innerHTML,/Zoe/);
 change('[data-cc-city]','');change('[data-cc-sort]','area');const html=node('[data-cc-rows]').innerHTML;assert.ok(html.indexOf('Amy')<html.indexOf('Zoe'));
});
