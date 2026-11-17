# A.L.I.C.E. SMS

Owner-only messaging on +1 252-542-5686. Messaging Service MGce98bdf99b1f746914ec884af003a614. Text agent agent_1201m7mv7fw3e29tcg3h9y63jgn3 shares the existing Turnly MCP tools. Voice configuration is separate.

POST /api/owner-sms accepts Twilio-signed form webhooks and checks account, owner, destination, message SID, and the inbound provider receipt. START opts in, STOP opts out. HELP explains usage. BUDGET reports the conservative shared allowance. MMS and messages over 1,200 characters are unsupported. No automatic marketing or recurring reports.

The one-minute Vercel cron processes at most three queued commands per invocation. Carrier campaign must be VERIFIED before any tool use. A service-role SQL claim prevents overlapping/replayed execution. Commands older than five minutes do not execute. Crashed work is uncertain, not automatically retried. Each command receives a two-minute platform:full key with deny_record_deletion=true; the worker revokes it before sending the reply. Existing API audit and idempotency controls remain in force. Payment/refund/hiring/archiving/external-message confirmation is requested by the agent before execution. Do not claim arbitrary portal functionality beyond the published API.

Only the last four successful SMS exchanges within one hour are supplied as context, never replayed as commands. Text is sealed with the existing CRON_SECRET encryption helper. Database tables are service-only with RLS. ElevenLabs retention is one day; local encrypted audit records remain retained. Replies are limited to 900 ASCII characters. Tools cannot receive the provider credential; the MCP token is a secret dynamic variable.

Budget: $25 per Eastern calendar month shared with voice. $5 is reserved for number rental, $1.50 campaign fee and a buffer; each call reserves $2 and each SMS request reserves $0.50, even when outcome is uncertain. Record the $15 campaign setup fee in setup_month/setup_cents when submitted. Never release reservations based on missing provider outcomes. This is a conservative application allowance, not a provider invoice/hard cap: unsolicited inbound traffic, taxes, other Twilio uses and separately authorized Codex job usage are not absolutely capped by it. New outbound assistant work stops when allowance is exhausted. Existing voice requests use the same advisory lock and sum.

Activation: set owner_sms_settings.enabled=true only once number routing and carrier registration are prepared. Opt-out stays true until START. Carrier verification is checked at runtime before executing commands. Twilio number incoming-message POST URL is https://portal.turnlypros.com/api/owner-sms. Status callback is the same URL with ?kind=status. Leave business-number routing unchanged.

Verification: node --test --test-isolation=none tests/owner-sms.test.cjs tests/owner-voice-retry.test.cjs tests/owner-voice.test.cjs tests/owner-voice-elevenlabs.test.cjs
