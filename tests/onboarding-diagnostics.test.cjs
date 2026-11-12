const {test}=require('node:test'),assert=require('node:assert/strict');
const {createReporter,caller}=require('../lib/onboarding-diagnostics.cjs');
test('diagnostics separate caller types without recording raw headers or URL parameters',()=>{
 assert.equal(caller({'user-agent':'node'}).kind,'server');
 assert.equal(caller({'user-agent':'Turnly CFNetwork/1 Darwin/1'}).kind,'native');
 const entries=[],report=createReporter({write:x=>entries.push(x)});
 report({authorization:'Bearer secret-test-token','user-agent':'Mozilla/5.0',referer:'https://portal.turnlypros.com/contractor-onboarding.html?private=value'})(200);
 assert.equal(entries[0].caller,'browser');assert.equal(entries[0].page,'onboarding');
 assert(!JSON.stringify(entries).includes('secret-test-token'));assert(!JSON.stringify(entries).includes('private'));assert(!JSON.stringify(entries).includes('Mozilla'));
});
test('diagnostics are sampled and bounded, then recover after the minute',()=>{
 let time=0;const entries=[],report=createReporter({now:()=>time,write:x=>entries.push(x),maxEntries:1});
 report({authorization:'Bearer a'})(200);report({authorization:'Bearer a'})(429);report({authorization:'Bearer b'})(200);
 assert.equal(entries.length,1);time=60000;report({authorization:'Bearer b'})(200);assert.equal(entries.length,2);
});
