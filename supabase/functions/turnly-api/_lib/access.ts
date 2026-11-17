// The app and portals share this database-owned access record. Never authorize
// from user_metadata: users can edit it, and roles are additive in Turnly.
export type AccessProfile = {
  role?: string; status?: string | null; is_active?: boolean | null;
  active?: boolean | null; disabled?: boolean | null; deleted_at?: string | null;
};
const inactive = new Set(["inactive", "disabled", "suspended", "deactivated", "banned", "archived", "deleted", "revoked", "rejected", "deletion_pending"]);
export function accessRole(profile: AccessProfile | undefined, access: unknown, allowApplicant = false, preferContractor = false): "contractor" | "admin" | null {
  if (!profile || profile.is_active === false || profile.active === false || profile.disabled === true || profile.deleted_at || inactive.has(String(profile.status ?? "").toLowerCase())) return null;
  const row = (Array.isArray(access) ? access[0] : access) as { status?: unknown; roles?: unknown } | undefined;
  const roles = row?.status === "active" && Array.isArray(row.roles) ? row.roles : [];
  if (preferContractor && roles.includes("contractor")) return "contractor";
  if (roles.includes("admin")) return "admin";
  if (roles.includes("contractor")) return "contractor";
  // Pending applicants still need onboarding. A persisted profile is required;
  // neither a client-provided role nor auth user_metadata can grant access.
  if (allowApplicant && profile.role === "contractor" && profile.status === "pending") return "contractor";
  return null;
}

