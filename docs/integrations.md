# Turnly integrations v1

Admin UI: /integrations.html. API: /api/integration-v1?resource=leads or bookings.

This release serves the existing Turnly business only. All active platform administrators can manage its connections. It is NOT a multi-tenant SaaS authorization system. Before onboarding other businesses, add tenant ownership to business records and enforce it in every API query, event trigger, and administrative action. Do not issue credentials for another business against this deployment.

Keys are 256-bit random values. Only SHA-256 hashes are persisted. They expire after 30, 90, or 365 days; revoke and create a replacement to change scopes. Each request validates expiry, revocation, the creator's active admin status, and its required scope. The database implements a 60-request fixed-minute limit per key. Never put a key in a public browser client.

Lead creation accepts only name, contact_email, contact_phone, sales_city, sales_state and requires an Idempotency-Key. Identical retries return the same lead. Reusing the key with different input returns 409. Existing matching email, or matching name and phone, returns its ID without editing any details. New leads are unassigned. There are no update/delete, payment, contractor-document, or account-management API capabilities.

Webhook events are queued transactionally from residential lead and booking inserts/updates. Payloads contain resource identifiers only. Existing records are not backfilled. The five-minute Vercel cron authenticates with CRON_SECRET and claims up to ten deliveries using SKIP LOCKED and five-minute leases. Delivery is at least once, with eight attempts and exponential delays. The receiver must deduplicate event IDs and validate HMAC-SHA256 over timestamp + dot + exact raw body, rejecting timestamps outside five minutes. Redirects are not followed.

Webhook secrets are encrypted with AES-256-GCM, a per-record nonce, record-ID authenticated context, and a domain-separated HKDF key from CRON_SECRET. Rotating CRON_SECRET requires recreating webhook subscriptions or coordinated re-encryption. URL validation allows only public IPv4 HTTPS destinations on port 443. DNS addresses are validated again at delivery and pinned to the connection; private/reserved IPv4, IPv6, userinfo and fragments are rejected.

Integration tables have RLS enabled and no browser-role grants. Privileged RPCs are service-role-only. Only the event trigger uses SECURITY DEFINER because normal authorized lead writers cannot write the private delivery queue. It resides in a non-exposed schema and uses a controlled search path.

Tests: node --test --test-isolation=none tests/integrations.test.cjs tests/integrations-db.test.cjs
