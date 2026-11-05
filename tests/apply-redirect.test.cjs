const {test}=require('node:test'),assert=require('node:assert/strict');
const redirect=require('../api/apply-redirect');
test('old application links preserve role and source on the fixed public host',()=>{
 for(const query of ['', '?role=cleaner&utm_source=indeed','?role=brand_ambassador','?next=https%3A%2F%2Fexample.com']){
  const headers={},res={setHeader(k,v){headers[k]=v},end(){}};
  redirect({url:'/apply.html'+query},res);
  assert.equal(res.statusCode,308);assert.equal(headers.Location,'https://turnlypros.com/apply.html'+query);
 }
});
