# Alice: direct OpenAI with ElevenLabs speech

Set `TURNLY_OWNER_VOICE_PROVIDER=openai-eleven-tts` after the read-only `/api/alice-check` passes. The existing OpenAI key needs Responses read/write; its value stays in Vercel. Roll back that setting to `elevenlabs` to restore the previous agent routes.

Calls retain the signed Twilio webhook, registered owner number, spoken passphrase, attempt limits, and per-session non-deleting Turnly key. Twilio Gather recognizes speech; OpenAI Responses interprets it and uses the existing business API. ElevenLabs Flash generates replies in the owner's Alice voice. The greeting and authenticated welcome use cached Alice audio. No ElevenAgents conversation runs on the new route. SMS and file inspection use OpenAI directly.

OpenAI requests run in background mode so long tool requests do not exceed Twilio's webhook deadline. Polling never resubmits a command. The database atomically claims ordered turns; uncertain operations are not retried. Conversation text/audio is encrypted in the service-role-only turn table. Audio URLs are signed and expire with the authenticated call. OpenAI background responses are stored by the provider; the passphrase is never included in them.

The compact MCP endpoint discovers exact schemas and invokes the same authenticated platform executor. It cannot bypass scopes, deletion policy, optimistic locking, idempotency, or provider workflow checks. Existing owner instructions retain financial/message confirmations and read-back. This is published API access, not arbitrary SQL or browser control.

The shared $25 monthly guard remains unchanged. Calls retain a $2 temporary hold; text replies retain a $0.50 hold. Model usage is calculated from returned token counts at pinned-model rates ($0.75/$0.075/$4.50 per million input/cached/output tokens). Flash speech is accounted at $0.05/1,000 characters. Twilio call/message charges reconcile from provider records; speech recognition retains a conservative 3-cent allowance per Gather because it is billed separately. Missing usage remains reserved. Limits on tool outputs, tool calls, generated tokens, turns, and call duration bound spend. Existing fixed costs and registration fees remain included. Other unrelated provider-account spending is outside this application guard.

Verification: `tests/owner-openai.test.cjs`, existing voice/auth/SMS/budget/files/admin-control tests, private-table grants, live read-only voice/text model checks and TTS generation. A physical owner call verifies actual microphone recognition, interruptions and handset playback.
