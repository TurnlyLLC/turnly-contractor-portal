# Residential customer accounts

Residential referral bookings and review requests create pending assignments without new sales leads. A scheduled booking (saved Stripe card) and positive agreed contractor pay are required before release. The database trigger protects release through either admin screen. Existing sales history is preserved.

No migration or account endpoint deletes or truncates records. Used verification links are marked consumed; logout and password reset mark sessions revoked. Expired sessions are retained and rejected by their expiry. The `lead_id` constraint is relaxed to allow future residential records without a sales lead; the column and all existing values remain.

After card confirmation, the booking receipt offers email-as-username password setup. The booking receipt token selects the stored email; a posted email cannot replace it. Resend sends a one-hour confirmation link. The customer confirms with the password they just chose. Existing accounts must sign in or use password reset; signup cannot overwrite them.

`/customer.html` shows bookings matching the account's verified email, their assignment progress, and payment status. It never returns Stripe identifiers, card data, staff metadata, or another customer's records. Changes to a clean are handled by contacting Turnly. Referral attribution remains on the original booking.

Customer sessions are deliberately separate from staff Supabase Auth: existing staff policies include broad authenticated reads. Customer sessions therefore never receive a Supabase JWT or contractor profile. Passwords use salted scrypt (N=131072, r=8, p=1); one-time links and session tokens are random 256-bit values stored only as SHA-256 hashes. Seven-day sessions use Secure, HttpOnly, host-only, SameSite=Strict cookies. Every endpoint requires same-origin JSON. Login/reset/setup requests are rate limited. Reset consumes its link atomically and revokes existing sessions; session creation compares the current password hash under a row lock.

The three account tables have RLS enabled and access revoked from PUBLIC, anon, and authenticated. Only server-side service-role code can read them. No customer password or token is logged. Apply `20261008210000_residential_customer_accounts.sql` before deployment.

Email uses the existing `RESEND_API_KEY` and `REFERRAL_FROM_EMAIL`. Admin Agents → Check email setup tests the sender using Resend's simulator. A one-off deployment can also set the build-only `TURNLY_EMAIL_SETUP_CHECK=1` to run the same synthetic check. This does not email customers or activate agents.

Validation: `npm run test:booking`, `npm run test:referrals`, plus the Playwright scripts `tests/residential-accounts-ui.cjs`, `tests/residential-booking-ui.cjs`, and `tests/residential-admin-ui.cjs`. Browser fixtures use synthetic data and mock provider calls. No live charge is part of testing.
