const {test}=require('node:test'),assert=require('node:assert/strict');
const {visitDetails}=require('../lib/residential-visit.cjs'),{accountEmail}=require('../lib/residential-email.cjs');
test('visit answers require conditional details and discard hidden codes',()=>{
 const base={pets:'no',parking:'driveway',access_method:'resident'};
 assert.throws(()=>visitDetails({...base,pets:'yes'}),/pets/);
 assert.throws(()=>visitDetails({...base,access_method:'code'}),/access code/);
 assert.throws(()=>visitDetails({...base,access_method:'lockbox'}),/lockbox/);
 assert.throws(()=>visitDetails({...base,parking:'invented'}),/parking/);
 assert.equal(visitDetails({...base,access_code:'old secret',lockbox_code:'old secret'}).access_code,'');
 assert.equal(visitDetails({...base,access_method:'lockbox',lockbox_code:'1234'}).lockbox_code,'1234');
});
test('account email renders branded actions, expiry, username and escaped content',()=>{
 const html=accountEmail('https://portal.turnlypros.com/customer.html#setup=example','setup','<customer>@example.com');
 assert.match(html,/Confirm my account/);assert.match(html,/one hour/);assert.match(html,/&lt;customer&gt;/);assert.doesNotMatch(html,/<customer>/);assert.match(html,/already saved/);
 assert.match(accountEmail('https://portal.turnlypros.com/customer.html#reset=example','reset','a@example.com'),/Reset my password/);
});
