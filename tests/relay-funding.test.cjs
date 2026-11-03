const test = require('node:test');
const assert = require('node:assert/strict');
const {relayApproval, inboundTransferBody, onFundingEvent} = require('../lib/relay-funding.cjs');
test('only funds the uncovered total including fees and respects approved cap', () => {
  assert.equal(relayApproval({totalDebit:10050,available:7000,maxBankDebit:3050}),3050);
  assert.equal(relayApproval({totalDebit:10050,available:12000,maxBankDebit:0}),0);
  assert.throws(() => relayApproval({totalDebit:10050,available:6999,maxBankDebit:3050}));
  assert.equal(inboundTransferBody('test-bank','test-account',3050).amount.value,3050);
});
test('a successful debit is not yet available money; a return requires review', () => {
  const prefix = 'v2.money_management.inbound_transfer.';
  assert.equal(onFundingEvent(prefix+'bank_debit_succeeded'),'wait');
  assert.equal(onFundingEvent(prefix+'available'),'recheck_balance_and_quote');
  for(const event of ['bank_debit_failed','bank_debit_returned']) {
    assert.equal(onFundingEvent(prefix+event),'needs_review');
  }
});
