const {test}=require('node:test'),assert=require('node:assert/strict');
const {verify,miles}=require('../lib/service-coverage.cjs');
const home={property_address:'207 Oak Hill Dr',city:'Durham',state:'NC',zip:'27712'};
const candidate={address:'207 OAK HILL DRIVE, DURHAM, NC, 27712',score:100,location:{x:-78.913566,y:36.081171},attributes:{Addr_type:'PointAddress',Region:'NC',City:'DURHAM',Postal:'27712'}};
const response=(candidates=[candidate])=>async()=>({ok:true,json:async()=>({candidates})});
test('Durham exact address is approved and Virginia is rejected without a misleading NC lookup',async()=>{
 const result=await verify(home,response());assert.equal(result.approved,true);assert.equal(result.service_city,'Durham');assert.ok(result.distance_miles>6&&result.distance_miles<7);
 assert.equal((await verify({property_address:'2003 Upper Lake Dr',city:'Reston',state:'VA'},()=>{throw Error('Should not call NC geocoder');})).approved,false);
});
test('only verified point addresses inside 25 miles qualify; errors fail closed',async()=>{
 assert.equal((await verify(home,response([{...candidate,location:{x:-80.8431,y:35.2271}}]))).approved,false);
 for(const candidates of [[],[{...candidate,score:97}],[candidate,candidate],[{...candidate,attributes:{...candidate.attributes,Addr_type:'StreetAddress'}}],[{...candidate,address:'209 OAK HILL DRIVE'}],[{...candidate,location:{x:null,y:null}}]])await assert.rejects(verify(home,response(candidates)),/verify this exact/);
 await assert.rejects(verify(home,async()=>{throw Error('offline');}),/temporarily unavailable/);
 const lat=35.994,delta=25/3958.7613*180/Math.PI;
 assert.ok(miles(lat,-78.8986,lat+delta-.000001,-78.8986)<25);
 assert.ok(miles(lat,-78.8986,lat+delta+.000001,-78.8986)>25);
});
