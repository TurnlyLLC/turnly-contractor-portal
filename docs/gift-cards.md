# Turnly gift card program

Purchase: https://client.turnlypros.com/gift-cards.html
Admin: https://portal.turnlypros.com/admin-gift-cards.html
Terms: https://client.turnlypros.com/gift-card-terms.html

Uses existing Stripe, Supabase and Resend configuration; never add service keys to browser code. Required environment names: STRIPE_SECRET_KEY (existing STRIP_SECRET_KEY fallback supported), STRIPE_WEBHOOK_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (existing aliases supported), RESEND_API_KEY, REFERRAL_FROM_EMAIL, CRON_SECRET, RESIDENTIAL_PAYMENTS_ENABLED=true. Checkout requires the existing live payments configuration.

The existing /api/residential-webhook receives checkout.session.completed. Payment intent and charge refund/dispute events reconcile gift purchases separately from cleaning bookings. /api/gift-reconcile runs every ten minutes with Vercel CRON_SECRET authorization. It recovers paid checkout fulfillment and email delivery, observes provider delivery status, releases expired abandoned setup holds, and resolves pending refunds. Provider acceptance is not proof of inbox receipt or opening. Uncertain email attempts older than 23 hours are marked review to avoid sending twice after Resend's idempotency window.

Cards are $100 each, 1–25 per order, with 24-character random uppercase letter/digit codes and a database uniqueness constraint. Each QR contains a fragment-based booking link so the code is not sent in the HTTP path or Referer. Full codes and buyer information are private service-role records. The admin endpoint separately validates an active admin profile. Public balance lookups require the code and are rate limited. Card activity is an append-only ledger for the application role.

A booking holds available credit atomically; the server recomputes the service price and the database rejects a changed gift balance before checkout. Only the amount above gift credit is charged on the service date. Payment confirmation captures reserved credit; cancellation before charge releases it. Scanning does not redeem. One card per booking; remaining value persists without expiry. Direct gift recipients are not fabricated realtor referrals or sales leads. Existing customer attribution is retained.

Refunds require a completely unused and unreserved card plus an admin-recorded service-unavailability reason. The card is locked before Stripe is contacted; the refund uses a stable idempotency key and is reconciled against Stripe before retry. External dashboard adjustments or disputes suspend remaining cards for review. Suspended balances and uncertain payments should be resolved with their Stripe records before any manual database adjustment. No automated reinstatement is attempted.

Terms version 2026-10-15.1 is recorded with purchaser acceptance time. Keep that accepted terms version available when revising future terms. The terms were drafted from the owner's requirements and checked against CFPB gift-card rules and NC G.S. 66-67.5; they are not attorney-reviewed. Sources: https://www.consumerfinance.gov/rules-policy/regulations/1005/20/ and https://www.ncleg.gov/enactedlegislation/statutes/html/bychapter/chapter_66.html .

Verification: local PostgreSQL-compatible ledger tests, payment-validation tests, booking regressions, desktop/mobile purchase and booking browser journeys using mocked providers, full-page PDF visual review and QR decode. These tests do not make a live purchase or deliver a real customer email. Complete an owner-controlled end-to-end live purchase before advertising broadly.

Migration 20261015152655_turnly_gift_cards.sql was applied through the connected Supabase migration service. docs/gift-cards.sql is the matching test fixture. Gift-table RLS-without-policies advisor notices are intentional: anonymous and signed-in clients have no table privileges, and all operations use authorized server endpoints. Other project advisor warnings predate this program.

## Admin management update — October 15, 2026

Gift Cards in the Sales sidebar now offers separate card and purchase views. Search across purchaser name, email, partial/full card code and order ID; filter status and inclusive Eastern-time purchase dates; sort newest/oldest and page 25/50/100 records. Pending/expired purchases use checkout creation time. Summary totals cover the complete filtered result, not only the visible page. Paid order value is gross before refunds; card balances remain the authoritative available value.

Open any card or purchase for its codes, balances, delivery state and a paginated 20-event timeline. Existing server-authorized reconciliation/refund actions remain available. The search RPC is service-role only, SECURITY INVOKER, parameterized and bounded to 100 rows; pg_trgm indexes support name/email/code matching. No customer data was changed. Migration 20261015154534_gift_card_admin_search uses the existing public.pg_trgm extension. The docs SQL fixture excludes the extension-specific indexes for PGlite.

Validation: 21 database/payment regression tests, admin browser tests with mocked authenticated records, production RPC/privilege checks and live unauthenticated denial. No real purchase or refund was initiated during this update.
