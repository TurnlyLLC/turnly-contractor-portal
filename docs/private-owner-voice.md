# Private Turnly voice assistant

Dedicated number: +1 252-542-5686 (Twilio PNfeb813307a1592b350e98399d506d38a).

The owner calls from the configured cell, hangs up, answers the callback, and presses 1. The callback destination comes only from server configuration. Caller ID alone never grants data access. Other callers receive a private-line message. No audio recording or transcript is stored by this application.

Twilio incoming webhook (POST): `https://portal.turnlypros.com/api/owner-voice?kind=incoming`.
OpenAI project webhook: `https://portal.turnlypros.com/api/owner-voice?kind=openai`, event `realtime.call.incoming`.

The callback uses TLS SIP to the configured OpenAI project. Twilio and OpenAI webhook signatures are validated. A one-use SIP session claim creates a Turnly key lasting at most six minutes; the completion callback revokes it immediately. Existing integration audit logs capture business tool operations. Failed or uncertain writes must not be retried under a fresh idempotency key.

The assistant can use Turnly's published API capabilities; it cannot operate the owner's local terminal, read existing Codex/ChatGPT conversations, or access Gmail without another explicitly configured integration.

## Configuration

Production-only secrets: `TURNLY_VOICE_OPENAI_API_KEY`, `TURNLY_VOICE_OPENAI_WEBHOOK_SECRET`.
The initial OpenAI key is restricted to Realtime and expires December 16, 2026. Rotate before expiry. Never put either secret in a client bundle, source control, or logs.

Configuration: `TURNLY_OWNER_VOICE_ENABLED`, `TURNLY_OWNER_VOICE_PHONE`, `TURNLY_OWNER_VOICE_NUMBER`, `TURNLY_OWNER_VOICE_ADMIN_ID`, `TURNLY_OWNER_VOICE_TWILIO_ACCOUNT`, `TURNLY_VOICE_OPENAI_PROJECT`, `TURNLY_VOICE_OPENAI_MODEL`.
Uses the existing server-only Twilio credentials and CRON_SECRET; fails closed if the configured Twilio account does not match. Changing the flag or credentials requires a new Vercel deployment. Disable the flag and redeploy to stop new sessions; revoke outstanding integration keys to end tool access immediately.

## Spending allowance

Initially eleven sessions per Eastern calendar month, each with at most five connected minutes and a ten-minute interval between callback requests. Each attempt reserves $2, even on uncertain provider failure. $22 of reserved usage plus $1.15 monthly number rent leaves a buffer toward the requested $25/month target. This conservative application allowance is not provider-level billing enforcement and does not cover other Twilio/OpenAI projects, taxes, or unexpected provider pricing. Revisit only after measuring actual call costs. Promotional OpenAI credit expiry does not change the allowance.

## Verification

`node --test --test-isolation=none tests/owner-voice.test.cjs tests/owner-voice-db.test.cjs`

Before declaring ready, confirm the deployed GET readiness response, reject unsigned webhook requests, test a real owner callback and keypad authorization, verify OpenAI call acceptance plus a read-only Turnly tool result, and confirm completion revokes the temporary key. Do not change a real business record just to test write access.

## Direct Alice calls (November 17)
ElevenLabs incoming calls now play the prerecorded Alice greeting and verify a spoken passphrase on the server before issuing any business token. Only a salted scrypt hash is stored in a service-only table. Three attempts per call and five failed attempts per hour; no SpeechResult logging or forwarding into ElevenLabs. Twilio processes recognition and may retain webhook request diagnostics. The number status callback must POST to /api/owner-voice?kind=status. Cron also reconciles finished calls. Agent queue disabled; silent sessions end after 30 seconds.
