'use strict';

// Amounts are USD cents. available must exclude funds reserved for other approvals.
function relayApproval({totalDebit, available, maxBankDebit}) {
  for (const value of [totalDebit, available, maxBankDebit]) {
    if (!Number.isSafeInteger(value) || value < 0) throw Error('Invalid funding amount');
  }
  if (!totalDebit) throw Error('A positive payout total including fees is required');
  const shortfall = Math.max(0, totalDebit - available);
  if (shortfall > maxBankDebit) throw Error('Funding exceeds the approved bank debit');
  return shortfall;
}

function inboundTransferBody(bank, account, cents) {
  if (!bank || !account || !Number.isSafeInteger(cents) || cents <= 0) {
    throw Error('A verified funding source, destination and positive amount are required');
  }
  return {
    from: {payment_method: bank},
    to: {financial_account: account, currency: 'usd'},
    amount: {value: cents, currency: 'usd'}
  };
}

function onFundingEvent(event) {
  const prefix = 'v2.money_management.inbound_transfer.';
  if (event === prefix + 'available') return 'recheck_balance_and_quote';
  if ([prefix + 'bank_debit_failed', prefix + 'bank_debit_returned'].includes(event)) {
    return 'needs_review';
  }
  return 'wait';
}

module.exports = {relayApproval, inboundTransferBody, onFundingEvent};
