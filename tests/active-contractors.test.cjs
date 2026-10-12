const {test}=require('node:test'),assert=require('node:assert/strict');
test('assignment options use active directory contractors with profile precedence and account-safe invite IDs',async()=>{
 const {normalizePerson,activeCleaningContractors,loadActiveCleaningContractors}=await import('../contractor-directory-model.mjs');
 const rows=[
 {id:'clean',role:'contractor',full_name:'Cleaner',email:'same@example.com',contractor_approved:true,status:'active'},
 {id:'inactive',role:'contractor',email:'inactive@example.com',contractor_approved:true,status:'inactive'},
 {id:'pending',role:'contractor',email:'pending@example.com',contractor_approved:false,status:'active'},
 {id:'admin',role:'admin',contractor_approved:true},
 {id:'sales',role:'sales',contractor_approved:true},
 {id:'manager',role:'property_manager',contractor_approved:true},
 {id:'plumber',role:'contractor',service_type:'Plumbing',contractor_approved:true},
 {id:'turnover',role:'contractor',service_type:'Apartment Turnovers',contractor_approved:true},
 ];
 const invites=[{id:'duplicate',email:'same@example.com',contractor_approved:true},{id:'invite',name:'Invited cleaner',contractor_approved:true},{id:'old',email:'inactive@example.com',contractor_approved:true}];
 const expected=activeCleaningContractors([...rows.map(r=>normalizePerson(r,'profiles')),...invites.map(r=>normalizePerson(r,'contractors'))].filter(Boolean));
 assert.deepEqual(expected.map(r=>r.id).sort(),['clean','invite','turnover']);
 assert.equal(expected.find(r=>r.id==='invite').assignable,false);
 assert.equal(expected.find(r=>r.id==='clean').assignable,true);
 const tables=[];const client={from(table){tables.push(table);return {select(){return this},limit:async()=>({data:table==='profiles'?rows:invites})}}};
 assert.deepEqual(await loadActiveCleaningContractors(client),expected);
 assert.deepEqual(tables,['profiles','contractors']);
});
