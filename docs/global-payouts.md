# Team payments

Admin entry: `/admin-payouts.html`, linked from Directory and Finance navigation.

Status: integration scaffold with a private review queue. Sending is deliberately disabled until Stripe API access and sandbox verification are complete. Global Payouts requires its own restricted `STRIPE_GLOBAL_PAYOUTS_KEY`; it never uses or changes the gift-card/residential payment key. Do not enable `GLOBAL_PAYOUTS_SEND_ENABLED=true` until the live account, recipient requirements, fees, FX and sandbox lifecycle have been verified.

Recipients are created through Stripe Global Payouts (no Stripe login required for recipients), then linked by account ID to a cleaning contractor or assistant in the portal. Bank information stays with Stripe. Supported recipient countries: US, PH, PK. International routing depends on Stripe account eligibility and recipient requirements; do not promise access based only on country support.

Drafts reserve completed, real cleaning assignments in the existing contractor payout ledger, blocking Connect/external duplicates and changes to compensation. Assistant references are unique per recipient. Contractor pay is the saved assignment amount plus adjustments, not recomputed as a percentage here.

The implementation uses the Payout Intents private preview with `confirmation_method: manual`. Prepare retrieves a Stripe quote without sending; Send verifies the exact review hash, records the approver atomically, and confirms once with a stable idempotency key. An ambiguous confirmation is only reconciled, never automatically retried. Preparation retries expire locally after 23 hours. Posted means sent, not guaranteed bank receipt. Failures/returns remain reserved and need admin reconciliation; they do not authorize a replacement payment.

Outstanding before activation:
- Replace the restricted key disclosed in chat; safely add the replacement to Vercel Production as Sensitive.
- Stripe access: recipient configuration, financial account read, payout methods and outbound payments write; Payout Intents write and cross-border preview approval.
- Verify exact preview response schemas against enabled account; test prepare, quote expiry, confirm timeout, failed/returned payouts and duplicates in Stripe sandbox.
- Configure signed thin-event webhook reconciliation before enabling send; current status refresh is manual.
- Fund the financial account (user action), add recipients, and verify their banking requirements.
- Replace raw quote diagnostic rendering with customer-readable fee, debit, destination and FX fields after actual enabled preview schemas are verified.

No real recipients, bank data transfers or payouts were created during implementation.
