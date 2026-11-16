# Turnly Business API and MCP

Production MCP endpoint: `https://portal.turnlypros.com/api/turnly-mcp` (stateless Streamable HTTP, JSON responses).
API v2: `https://portal.turnlypros.com/api/integration-v2`.
Authentication: `Authorization: Bearer YOUR_KEY`. Never put keys in URLs or chat messages.

Create a dedicated connection in `/integrations.html`. Choose restricted permissions or explicitly confirm `platform:full`. Existing keys retain their scopes. Expiration can be 30, 90, 365 days or none; revoke from Integrations. Tokens are hashed at rest. Owners must remain active administrators. OAuth access is also supported for ChatGPT; no portal session impersonation token or Supabase service key is issued to consumers.

Codex supports saved API-key credentials. ChatGPT uses the reusable OAuth Turnly Portals connection described in chatgpt-oauth.md. Save the key through the host's private credential connection. Codex CLI can alternatively use `codex mcp add turnly --url https://portal.turnlypros.com/api/turnly-mcp --bearer-token-env-var TURNLY_API_KEY`. Configure that environment variable securely on the machine launching Codex. This is a one-time key connection, not repeated portal login. Expiration, revocation, or loss of admin status requires reconnecting with a valid key.

## Contract

`GET ?resource=catalog` is authoritative and includes all resources, read/write fields, actions, scopes, examples, and granted permissions. A downloadable OpenAPI 3.1 document is available at `/integration-openapi.json`.

`GET ?resource=clients&limit=25` returns `data`, `next_cursor`, `request_id`. Pass `after` to continue or `id` to select one record. Equality filters use URL-encoded JSON in `filters` and only catalog-listed fields. Max 100 rows per page. API key rate limit is 120 authenticated checks/minute; MCP discovery and tool calls also consume checks.

`POST ?resource=clients` with `{"data":{"company_name":"Example"}}` creates a supported record. `PATCH ?resource=clients` takes `id`, `data`, and `expected_updated_at` copied exactly from the last read. Timestamp checking prevents stale updates. Customers without update timestamps use row locking; consumers should re-read before changing them.

Lead creation remains duplicate-safe through v1 or MCP `turnly_create_leads`; v2 POST `resource=leads` accepts data fields `name`, `contact_email`, `contact_phone`, `sales_city`, `sales_state`. Requires `leads:create`, a name and an email or phone. It returns an existing match without changing it. Lead PATCH requires `leads:write` and explicit changed fields. Commercial and residential leads can be read through v2; v1 retains its residential filter.

All mutations require an `Idempotency-Key` header (8–100 letters, digits, underscores or hyphens). Reuse it only for the identical request. Direct record mutations and idempotency results commit atomically. Repeated requests replay the first result. The same key with different input fails.

`POST ?action=bookings.cancel` with `{"input":{"id":"UUID"},"confirm":true}` invokes the existing portal workflow. Action inputs and validation are the portal's existing contract, documented in catalog examples. Financial transfers/refunds use existing eligibility checks and provider idempotency. Communications require existing channel-consent validation. No business action is run merely by creating or connecting a key.

Actions that span external services are reserved before execution. If one fails or times out, its outcome may be uncertain. Reusing the same idempotency key is blocked, not rerun. Inspect the affected portal/provider and request history before considering a new key. This is intentionally not an automatic replay of a potentially completed payment or message.

## Coverage and boundaries

19 resource families and 24 workflow actions are described by the catalog, including sales summaries and BA dashboard/earnings. Full access means every operation in this catalog, including supported financial and personnel operations. It is not unrestricted SQL, authentication administration, password resets, file downloads, or every historical portal operation. New APIs should be added explicitly to the contract, never through arbitrary table/RPC selection.

The platform currently has one Turnly workspace. Do not onboard independent SaaS businesses until tenant isolation is implemented throughout the existing business tables and workflows.

New signed webhook events cover every catalog resource on insert/update; payloads contain IDs and resource names, not records. Existing `lead.*` and `booking.*` names remain compatible. Lead events now include both commercial and residential leads; use v2 for full lead retrieval. Only active admin-owned enabled subscriptions enqueue. Receivers retrieve details using their scoped key. Pausing and retry behavior remains as documented in the Integrations page.

API history stores connection ID, operation, status, request ID, HTTP result and duration, without request bodies or secrets. History currently covers v2/MCP business execution; rejected authentication, discovery, and legacy v1 calls are not included. Retention is not automatically pruned in this release.

## Verification

Tests cover scoped MCP discovery, forbidden fields, full-key versus restricted-key permissions, stale writes, atomic idempotency, action reservation/replay, revocation, service-only storage, existing ambassador ownership and CRM consent. Production smoke tests use a short-lived full key for read-only discovery/reads, then revoke it. No payments, messages or hiring decisions are used as smoke tests.

## Contractor documents

Full access now includes `documents:upload`. See [the document upload workflow](contractor-document-api.md) for private direct uploads and verified finalization. Uploading a background check does not approve it or change onboarding status.
