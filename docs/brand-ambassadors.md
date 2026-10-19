# Brand ambassador portal

Entry: `https://ba.turnlypros.com` (email/password). Existing active admins may sign in with their admin account. Team creates ambassador accounts with a temporary password, forces a first-login password change, and supports password resets and deactivation. Ambassador membership is separate from sales CRM access.

Sharing: `/r/BA-…` opens a consent-based referral intake and continues to the existing residential booking form. Each ambassador has a unique random code. First-touch email/phone attribution cannot be overwritten by a subsequent link. Only the first booking is exposed; names are abbreviated for ambassadors. Customer contact, address and billing details are never included in dashboard responses.

Rewards: $25 on confirmed (`scheduled`) first booking, plus $25 on actual completion (`completed` with `completed_at`). Requests and abandoned checkout earn nothing. Unique `(lead_id,milestone)` entries prevent duplicate rewards. Existing customers and repeat bookings do not earn new rewards. Cancelled/refunded first bookings retain their ledger and are flagged for review pending the owner's reversal policy; unpaid flagged earnings cannot be recorded as paid. Cancelled first bookings that require a replacement must be reviewed by operations; they are not silently reattributed.

Payouts: Admins may record a $25 milestone payment already made, including its reference. This does not transfer funds. Duplicate payment recording is rejected; paid history is retained. Payout automation is not configured.

Storage: `ba_members`, `ba_leads`, `ba_earnings`, `ba_events` are RLS-protected and service-role-only. APIs validate the current stored profile and membership. Member sessions are bound to a verified Supabase session ID; resets/deactivation clear that ID. One active ambassador login per account. Admin authorization uses stored roles, never user metadata.

Deployment: apply `20261019164146_brand_ambassador_portal.sql` before publishing the API. This adds the enum role and private tables, and attaches a lifecycle trigger to existing bookings without modifying historical booking data. The existing Stripe booking confirmation and operational completion paths drive the ledger. No additional Stripe product or webhook is needed.

Verification: `node --test --test-isolation=none tests/ambassadors.test.cjs tests/residential-booking.test.cjs`. Tests use local PostgreSQL (PGlite), with no synthetic production accounts, bookings or charges.
