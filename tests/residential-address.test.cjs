const {test}=require('node:test'),assert=require('node:assert/strict');
const {suggest}=require('../lib/residential-address.cjs');
test('suggestions return only distinct complete NC street addresses and never provider metadata',async()=>{
 let requested;
 const result=await suggest({query:'101 City & Durham'},async url=>{requested=new URL(url);return {ok:true,json:async()=>({suggestions:[
  {text:'101 CITY HALL PLAZA, DURHAM, NC, 27701',magicKey:'private-provider-detail',isCollection:false},
  {text:'101 CITY HALL PLAZA, DURHAM, NC, 27701',isCollection:false},
  {text:'CITY HALL PLAZA, DURHAM, NC, 27701'},
  {text:'101 CITY HALL PLAZA, City of Durham, NC'},
  {text:'1 OTHER LANE, SOMEWHERE, VA, 22000'},
  {text:'101 CITY HALL PLAZA, DURHAM, NC, 27701',isCollection:true}
 ]})};});
 assert.equal(requested.origin,'https://services.nconemap.gov');assert.equal(requested.searchParams.get('text'),'101 City & Durham');
 assert.deepEqual(result.suggestions,[{label:'101 CITY HALL PLAZA, DURHAM, NC, 27701',property_address:'101 CITY HALL PLAZA',city:'DURHAM',state:'NC',zip:'27701'}]);
});
test('short searches do not call the provider; errors and malformed responses allow manual entry',async()=>{
 assert.deepEqual(await suggest({query:'12'},()=>{throw Error('Must not fetch');}),{suggestions:[]});
 for(const fetcher of [async()=>{throw Error('Network');},async()=>({ok:false}),async()=>({ok:true,json:async()=>({error:{message:'offline'}})})])assert.deepEqual(await suggest({query:'123 Main'},fetcher),{suggestions:[],unavailable:true});
});
