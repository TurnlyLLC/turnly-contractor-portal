'use strict';

// Read-only preflight. Refuse live credentials even if the environment is misconfigured.
const key = process.env.STRIPE_GLOBAL_PAYOUTS_KEY;
async function main() {
  if (!key?.startsWith('rk_test_')) throw Error('A restricted Stripe sandbox key is required.');
  for (const path of ['money_management/financial_accounts', 'core/vault/us_bank_accounts']) {
    const res = await fetch('https://api.stripe.com/v2/' + path + '?limit=10', {
      headers: {Authorization: 'Bearer ' + key, 'Stripe-Version': '2026-10-28.preview'},
      signal: AbortSignal.timeout(15000)
    });
    if (!res.ok) throw Error(path + ' read failed (HTTP ' + res.status + ').');
    const body = await res.json();
    if (!body.data?.length) throw Error('No sandbox records available for ' + path);
    console.log(path + ': sandbox records accessible');
  }
}
main().catch(error => {console.error(error.message); process.exitCode = 1;});
