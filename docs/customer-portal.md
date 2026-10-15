# Customer web portal

The customer portal at `/customer.html` follows the Turnly Customer App design in Rork project `d8gnkliiac1i6z949ethg`. It uses the existing residential bookings and assignment board.

Customers can sign in with verified website accounts or active customer app accounts; view paginated upcoming/history visits, gift-credit payment breakdowns, cleaner assignment and checklist progress; reschedule/cancel eligible future unpaid visits; update notes; rebook an existing home using a saved card with explicit authorization; change a visit's card in Stripe Checkout; view Stripe receipts; and send support requests to Residential inquiries in the admin portal. Recurring plan changes route to support. Ask Turnly currently routes to the human team, not the app's AI assistant. No GPS map or live in-app chat is represented as available.

Website accounts use the existing verified-email session. App access tokens remain in secure HttpOnly same-site cookies and expire with the Supabase session. Only actual verified-email app accounts can auto-link by email; auto-confirmed app signups are restricted to previously linked bookings. No customer IDs supplied by the browser establish ownership. Password recovery for native app accounts remains in the app.

`customer_portal_change` locks booking and assignment together; refuses payment/visit changes once collection is due, underway, or completed; releases gift reservations through the existing cancellation trigger. Reschedules return the assignment to admin review and clear cleaner assignment. `customer_portal_rebook` deduplicates retries and does not transfer gift credit. Both functions and the event ledger are service-role-only. All state-changing HTTP calls require same-origin JSON.

Card replacement uses a completed Stripe setup session tied to the same booking and Stripe customer. It cannot retarget a charged or locked visit. Existing per-booking Stripe customer records are preserved. No payment data is stored in the browser.

Validation: local PostgreSQL fixtures cover ownership, locks, DST, rescheduling, cancellation, rebooking idempotency, saved-card completion and private privileges. Existing account and gift-card regression tests also pass. Browser QA uses synthetic data only; no real charge, email, or customer booking is created during validation.
