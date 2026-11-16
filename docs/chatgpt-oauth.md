# ChatGPT OAuth connection

ChatGPT web requires OAuth, not the API-key authentication used by the desktop Codex connection. Add the production MCP URL in ChatGPT Plugins → Add custom MCP server, choose OAuth and dynamic registration, and authorize `platform:full` as an active Turnly admin.

This limited authorization server supports only ChatGPT's exact stable production callback, public clients with S256 PKCE, the Turnly MCP resource, and the explicit `platform:full` scope. It does not offer arbitrary third-party OAuth registration, OIDC, password grants, client-credentials grants, or Supabase sessions to clients.

Discovery is served from `/.well-known/oauth-authorization-server` and `/.well-known/oauth-protected-resource/api/turnly-mcp`. Authorization responses include the exact issuer. Five-minute codes are single use. Opaque access tokens expire after one hour; rotating refresh tokens expire with their one-year grant. Only SHA-256 token hashes are stored. Code/refresh exchange is atomic; verified reuse revokes the grant. Registration and exchange use the existing server request rate limiter.

Consent requires an active admin's verified portal bearer session, a same-origin request, and explicit approval. Authentication is performed by the existing Supabase Auth login. OAuth grants appear as **ChatGPT OAuth** on Integrations. Revoking that entry invalidates all access/refresh tokens immediately. Each business request still checks the grant, active admin, resource and existing permissions; API operations retain audit logging and idempotency protections.

The new tables and functions are service-role-only with RLS enabled and no browser role grants. They contain no plaintext credentials. Codex's existing API key remains unchanged. The bundled private desktop plugin is distinct from the ChatGPT web MCP connection.

Tests cover redirect/resource/scope/PKCE binding, replay revocation, refresh rotation, expired access/codes, inactive admin, wrong-client revocation and denied anonymous SQL access. Live setup must also verify ChatGPT's end-to-end authorization and a read-only tool call.
