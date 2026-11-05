# Shared app access for Rork

Supabase project: `nwnzdoveskthebfyndcs`.

Admin portal → Contractor directory → **Access roles** controls all registered contractors, ambassadors and admins. Each contractor row also has an Access roles button. Select multiple checkboxes for combined designations. Existing users keep their login, service areas, status and onboarding approvals. Admin access is broad; the primary owner cannot be demoted from this editor.

## Native app integration

After authentication, on app resume, and after an authorization failure:

```js
const { data: access, error } = await supabase.rpc('my_app_access');
if (error) throw error; // fail closed; do not infer admin from user_metadata
// access.roles: contractor, brand_ambassador, admin (multiple allowed)
// access.permissions: named screen capabilities
// access.service_areas: canonical NC city zones
// access.status, contractor_approved, primary_role, contract_version
const { data: jobs, error: jobError } = await supabase.rpc('my_app_job_board');
```

Render a role selector when multiple roles are returned. Hide inaccessible areas and clear cached private data when a role is revoked. Never accept a target user ID from a client for these self-scoped RPCs. Inactive users get no effective roles. Job results use the existing server-side approval, assignment visibility, property and 25-mile service-area rules. A Contractor designation alone does not bypass onboarding. An admin's job management remains on the existing admin APIs.

`app_access_roles` is the role/permission catalog. `app_user_access` stores assignments; users can read only their own row, while admins can read all. No authenticated user can write either table directly. `app_access_audit` records changes made through the directory. The server-only `admin_set_app_access` RPC verifies the active admin and synchronizes the legacy primary profile role and ambassador membership transactionally.

Use the directory to change multiple designations; legacy writes to `profiles.role` replace designations when the primary role changes. Newly created contractor profiles receive their default designation automatically. Adding Brand Ambassador creates/enables the membership without changing the user's password or marking training complete. Removing it disables the membership and clears its portal session. The ambassador portal still uses its own sign-in/session and onboarding checks.

These database functions are live integration points, not an automatic native UI update. Rork must call them and use the response for navigation. Do not embed service-role credentials in the app. Existing backend authorization remains required on every data operation.
