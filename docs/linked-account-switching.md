# Linked admin and contractor views

Ryan's primary login remains admin@turnlypros.com. Its existing admin ID is linked to the existing ryanmatthewcoupe01@gmail.com contractor ID. No profile, assignments, earnings, training, documents, referrals, passwords or roles are moved or deleted.

The link is stored in Supabase Auth **app_metadata**, never user_metadata:

- Admin: `linked_contractor_id`
- Contractor: `linked_admin_id`
- Both: `primary_login_email`, `account_link_confirmed_at`

Both sides must agree and both profiles must be active. Removing either link disables switching. The API reads fresh server-side Auth records and profiles each time. It accepts no caller-specified target ID.

`POST /api/linked-account` with the current Supabase bearer token:

- `{ "action": "status" }`: returns `linked`, `view`, `admin_id`, `contractor_id`, `contractor_name`, `contractor_email`.
- `{ "action": "contractor" }`: only the linked active admin can obtain its linked contractor's session. Returns `session: {access_token, refresh_token}` plus `contractor_id`. It uses generateLink and verifyOtp internally; no email is sent. Tokens must never be logged, placed in URLs, or sent anywhere except the configured Supabase project.
- There is deliberately no action that mints an admin session from contractor credentials.

The web switch retains the original admin session in sessionStorage for this tab for up to eight hours, restores that session to return to Admin, and validates current admin access. Sign-out controls clear this backup. When the original session is unavailable, sign in again with the admin email. Auth and data caches must be cleared/reloaded on every switch. Supabase's normal same-origin session sharing means other open portal tabs may also change identity; refresh them after switching.

Native Rork integration must call this API when its Admin → Contractor selector is used, retain the original admin session in platform secure storage with an eight-hour maximum, setSession to the returned contractor session, invalidate all user-specific queries and reload my_app_access/my_app_job_board. Returning to Admin restores and validates the original admin session (or requests admin sign-in). Never grant the contractor profile an admin role or render a contractor screen using the admin profile ID. The native source is maintained outside this repository; metadata alone does not implement its selector.

Verification: linked-account tests cover unauthenticated callers, editable metadata, nonreciprocal links, inactive and banned accounts, incorrect roles, unverified email, wrong generated identity, wrong verified identity and contractor-to-admin escalation rejection.
