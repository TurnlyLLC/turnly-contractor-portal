# Sales portal calling

Calling stays inside the lead page. Each agent uses their existing CRM login and Turnly's shared voice number. The account currently has +19842176450; a second number is not necessary.

## Activate the connection

1. In Twilio, create a TwiML App named **Turnly Sales CRM**. Set its Voice Request URL to `https://sales.turnlypros.com/api/crm-voice-hook?kind=connect`, method **POST**. Leave messaging settings unchanged. Copy the Application SID (starts with AP).
2. Create a **Standard API key** in the same account/US1 region. Its secret is shown once. Enter it directly into Vercel; do not paste secrets into chat or commit them.
3. In the Vercel project connected to `TurnlyLLC/turnly-contractor-portal`, add these **Production**, server-only environment variables:

| Variable | Value |
| --- | --- |
| `TWILIO_ACCOUNT_SID` | The account SID shown in Twilio |
| `TWILIO_AUTH_TOKEN` | Account auth token; used to verify signed callbacks |
| `TWILIO_API_KEY_SID` | New Standard API key SID (SK…) |
| `TWILIO_API_KEY_SECRET` | That key's secret |
| `TWILIO_TWIML_APP_SID` | Turnly Sales CRM Application SID (AP…) |
| `TWILIO_VOICE_NUMBER` | `+19842176450` |
| `TWILIO_VOICE_ENABLED` | `true`, only when ready for a supervised test |

Preserve any existing account credentials used for SMS. No credentials belong in `env.js` or any frontend/public variable. Redeploy after saving settings.

4. In Twilio Voice geographic permissions, enable only the destinations Turnly needs (United States initially). Configure billing alerts against the account's $50 balance. Auto-recharge is a separate owner decision.
5. Test using a saved test lead and a phone number whose owner has agreed to receive the test. Allow microphone access on sales.turnlypros.com. Verify two-way audio, mute, keypad, hang-up, and the completed call in recent history. Confirm callbacks appear in Twilio's logs without signature errors.

The shared outbound number does not configure inbound routing. Decide how returned calls should be handled before broad rollout. Existing number inbound settings are preserved.

## Access and records

Only active sales/admin accounts with valid CRM sessions can request calls. Agents call only their own residential leads. Do-not-contact leads are blocked. Dial requests expire after two minutes, are single-use, and are checked again when Twilio connects. The server selects the saved primary number; arbitrary destinations cannot be supplied by the browser. One concurrent call per agent, six preparations per minute, and a one-hour call duration limit apply. Multiple agents can call concurrently.

Call status and duration are stored in `crm_voice_calls` and written to the lead's activity log. Signed callbacks and sequence numbers prevent forged, duplicated, or delayed events from corrupting history. Audio is not recorded. The service-role-only table is exposed through authenticated server routes, not direct browser database access.

## New-clean pay

New residential booking rows receive a 40% rate. Existing bookings retain their previous rate/amount behavior. New commercial assignments with a unit customer price or saved cleaning price receive 40%, rounded to cents. Gift-card redemption is a payment method and does not reduce the cleaning-price base. Old assignments are not recalculated; status updates never recalculate their pay. Historical completed cleans entered later retain their recorded compensation.

New jobs without a cleaning price are held pending with pay review required. In the admin assignment form, enter **Cleaning price · new cleans pay 40%**, or select a priced unit. Existing pay adjustments remain available to admins. These changes do not send contractor payments or change gift-card or ambassador commission rules.
