# Resident feedback QR cards

The admin portal's **Quality → Resident Feedback** page creates numbered card batches for a selected property. Each card gets a cryptographically random link at `https://turnlypros.com/f/<token>`. Only a SHA-256 hash of that link is stored in `resident_feedback_cards`; the raw link is returned once to the signed-in admin so the browser can render the QR code and print four cards per letter-size page.

Residents can submit a 1–5 rating and an optional note without entering their name, unit, or property. Responses are stored in `resident_feedback_responses`; only admins can read the card inventory or responses. The Dashboard and Command Center show the six newest responses in the Resident Feedback widget.

## Deploy

1. Apply `supabase/migrations/20260918100000_resident_feedback_qr.sql` to the connected Supabase project.
2. Publish the portal repository to Vercel. Its `/api/resident-feedback` route checks the admin session before creating batches and keeps the service-role key server-side.
3. Publish the public website repository. The feedback page posts to the portal API; `404.html` handles `/f/<token>` on GitHub Pages and `_redirects` rewrites that route on hosts that support it.

No real feedback response is created as part of deployment verification. Validator checks run with:

```sh
node --test --test-isolation=none tests/resident-feedback-validation.test.mjs tests/website-inquiry-validation.test.mjs
```
