const {test}=require('node:test');const assert=require('node:assert/strict');
test('birth date requires a real complete date, with legacy ISO support',async()=>{
 const {validationIssue,validBirthDate}=await import('../contractor-onboarding-model.mjs');
 const q={id:'contractor-information.date-of-birth',label:'Date of birth',required:true,sensitive:true};
 for(const v of ['1994','2/3/1994','02/30/1994','02/29/1993','13/15/1994','04/15/2994'])assert(validationIssue({fields:[q]},{[q.id]:v},{}),v);
 for(const v of ['04/15/1994','02/29/1996','1994-04-15'])assert(validBirthDate(v),v);
 assert.equal(validationIssue({fields:[q]},{[q.id]:'04/15/1994'},{}),null);
});