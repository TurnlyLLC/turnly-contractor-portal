# Contractor CRM

Cleaner-only directory with live onboarding queues, progress, city and availability filters, 50-row pages, full-dataset pagination past 1,000 records, selected/filtered CSV exports, and a contractor detail workspace. Onboarding reuses the native review service and Academy completion. Unknown status never counts as ready. Files and work history use the existing contractor file with direct tab links. Availability uses contractor_availability; location edits use existing profile allowed_regions/property access. Login details come from Supabase Auth; passwords are never returned.

## Payouts
Admin record > Payments supports recording money already paid elsewhere and explicitly confirmed Stripe Connect transfers. Amounts use assignment pay_amount plus metadata.payment.added_fee_amount minus fee_amount. Completed jobs only; existing manual/QuickBooks paid records are excluded. Test assignments cannot receive real Stripe transfers.

Contractors sign in at https://portal.turnlypros.com/contractor-payouts.html and complete their own Stripe-hosted setup. Activate Connect on the platform account first. Transfers and payouts must both be enabled for the connected recipient. The platform's existing Stripe secret is reused. No bank details or contractor agreements are entered by the administrator.

A private ledger reserves one payment per assignment atomically. It checks actor, owner, status and amount, protects against edits through other admin screens, and uses a stable Stripe idempotency key. Retries reconcile transfer_group before sending. Unknown outcomes remain reserved; after 23 hours an unconfirmed reservation requires manual reconciliation instead of risking another transfer after Stripe forgets its idempotency key. Confirm matching destination, USD amount and payout metadata before completing the service-only ledger. Never delete a reservation to retry.

Stripe transfer completion is distinct from bank settlement; Stripe handles bank payout schedules. Reversals and corrections need separate administrative reconciliation; this UI does not issue reversals.

Verification: PGlite authorization/duplicate/amount/ledger tests, ambiguous-response reconciliation, existing onboarding tests, and browser fixture with 1,250 records. No real payments, signatures, passwords, approvals or waivers changed during verification.
