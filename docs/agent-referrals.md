# Residential agent referrals

Agents are managed at `/sales-agents.html` and `/admin-agents.html`, linked from their respective portal navigation. Both pages share the same records; the admin page enforces admin access on the server. The feature uses the existing Vercel deployment and Supabase project. It does not send through a connected chat account.

## Workflow

1. An admin uploads a CSV of up to 500 agents or adds an agent manually. The import preserves city, name, primary phone, phone_1–3, primary email_1, email_2–3, address, state, postal code, website, and email contact phone fields. Shared office contact details do not collapse distinct leads. Exact repeated CSV imports are skipped by source hash. The one-time workbook import uses the workbook hash, sheet, and row as its repeat-safe source key; raw lead data is kept outside this public repository.
2. Leads start New and support Follow up, Not interested, Interested, and Active. City sorting is Durham, Raleigh, Asheville, then all other cities alphabetically; city filters and pagination run on the server. Cards show every contact, with explicit primary/alternative labels.
3. Active creates a permanent random referral ID. Preview and Send info can reserve the ID while the lead remains New. The supplied Fresh Start PNG is the built-in flyer template. PDF generation replaces its sample QR and caption without changing the original asset. Admins can optionally substitute a one-page PDF. Deactivation stops new signups; reactivation keeps the ID.
4. Send info sends immediately to the primary email and phone. Choose recipients opens optional channel and saved-alternative selectors. Email attaches the PDF; text links to the PDF and signup page. A confirmed provider acceptance through either selected channel activates the agent. Partial success is explicit; failed, unconfigured, processing, unknown, or unpersisted results alone do not activate. Accepted/queued is distinct from delivered. Check delivery refreshes the provider status. Each request/channel is idempotent; uncertain network requests retain their request ID in the open dialog.
5. The public referral form creates a residential sales lead and an attributed customer in one database transaction. Duplicate submissions matching normalized email or phone retain the original attribution. Twenty submissions per IP per hour are allowed; request IP hashes expire from the limiter after two hours.
6. An admin links the customer's first cleaning assignment once and enters the final eligible cleaning subtotal, excluding tax and tips. Confirm that this really is their first clean, including any work predating the referral. Later assignments cannot earn another bonus for this customer.
7. The bonus becomes earned when that assignment is completed and its linked QuickBooks invoice is fully paid. For payments outside QuickBooks, an admin can record a payment reference. QA pending does not count as complete. Contractor payment status is never used as customer payment evidence.
8. Record bonus paid stores the amount, actor, timestamp, and transaction/check reference after the agent is paid. It does not transfer funds. Paid history is retained; refunds or incorrect prior payment records require an admin accounting correction, not an automatic clawback.

## Launch setup

Apply `supabase/migrations/20261008120000_agent_referrals.sql` once before deploying the new screens. It adds new tables, functions, a restricted ledger view, and two storage buckets. It does not rewrite existing assignments, leads, invoices, or customer records. New tables have RLS enabled, browser roles have no grants, and the authenticated server route alone uses the service role. RPCs use security invoker and are executable only by the service role.

Set these server-only Vercel environment variables, then redeploy:

| Variable | Purpose |
| --- | --- |
| `SUPABASE_URL` | Existing Turnly project URL |
| `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SECRET_KEY` | Existing server database credential |
| `RESEND_API_KEY` | Resend account key with sending and email retrieval access |
| `REFERRAL_FROM_EMAIL` | Verified Turnly sender, e.g. `Turnly <sales@turnlypros.com>` |
| `TWILIO_ACCOUNT_SID` | Twilio account |
| `TWILIO_AUTH_TOKEN` | Twilio server credential |
| `TWILIO_MESSAGING_SERVICE_SID` | Messaging Service with an approved sender and opt-out handling |

The existing public Supabase URL and anon key in `env.js` remain for portal sign-in. Never add the service key or messaging keys there. Provider accounts, sender verification/registration, and usage billing must be set up by the account owner. No subscriptions are purchased by this code.

Without provider credentials, the screen shows Needs setup and send results report Not configured. Text sending also requires a stored agent consent checkbox. Do not send test messages to actual prospects; perform the first end-to-end send to an authorized internal recipient after setup.

The flyer template bucket is private. Generated flyers are intentionally public marketing documents, addressed by opaque referral codes. They contain the supplied template, QR, and referral code; do not upload a template containing confidential information. Old generated versions remain downloadable so sent links do not expire. Deactivation disables signup, not already distributed PDF copies.

## Verification performed

`npm run test:referrals` runs seven local test cases covering database behavior, permissions, contact deduplication, first-clean eligibility, payout idempotency, imports, rate limits, QR decoding, PDF overlay, sending authorization, per-channel results, send retries, missing configuration, missing text consent, and unknown provider outcomes.

`tests/agent-referrals-ui.cjs` runs a local browser check with synthetic data and mocked services. It verifies desktop/mobile layouts, editing, truthful send statuses, and referral attribution at signup. Set `NODE_PATH` to a runtime with Playwright; optionally set `QA_CHROMIUM` to an installed Chromium executable. No real messages are sent by tests.

The supplied flyer was rendered and its replacement QR decoded to the exact referral URL. Browser checks cover sales/admin views, alternative contact display, city filtering, and mobile layout. Production email/text delivery requires account credentials and an internal-recipient test after setup. Detailed account-owner steps are at `/agent-sending-setup.html`.

## Provider references

- [Resend send API](https://resend.com/docs/api-reference/emails/send-email)
- [Resend delivery status](https://resend.com/docs/api-reference/emails/retrieve-email)
- [Twilio messaging API and message statuses](https://www.twilio.com/docs/messaging/api/message-resource)
- [Supabase explicit Data API grants](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)
