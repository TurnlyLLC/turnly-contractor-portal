export const adminPreviewStorageKey = "turnlyAdminPreviewContext";
export const adminPreviewUserOptionsStorageKey = "turnlyAdminPreviewUserOptions:v1";

export const adminPreviewPortalOptions = [
  { value: "admin", label: "Admin", href: "admin.html" },
  { value: "contractor", label: "Contractor", href: "contractor-desktop.html" },
  { value: "property_manager", label: "Property Manager", href: "property-manager.html" }
];

export const adminPreviewPropertyOptions = [
  {
    value: "greenwood_forest_childrens_center",
    label: "Greenwood Forest Children's Center",
    aliases: [
      "greenwood forest childrens center",
      "greenwood forest children's center",
      "greenwood forest childcare center",
      "greenwood forest baptist church and childcare center"
    ]
  },
  {
    value: "greenwood_forest_baptist_church",
    label: "Greenwood Forest Baptist Church",
    aliases: [
      "greenwood forest baptist church",
      "greenwoof forest baptist church",
      "greenwood forest baptist church and childcare center"
    ]
  },
  {
    value: "vetra_forest_hills",
    label: "Vetra Forest Hills",
    aliases: [
      "vetra forest hills",
      "vetra forest hills service"
    ]
  }
];

export const adminPreviewUserOptions = [
  { value: "current_admin", label: "Current Admin", aliases: ["admin", "turnly admin"], roles: ["admin"] },
  { value: "amelia", label: "Amelia Coupe", aliases: ["amelia", "amelia coupe"], roles: ["contractor"] },
  { value: "shekinah", label: "Shekinah Thorne", aliases: ["shekinah", "shekinah thorne"], roles: ["contractor"] },
  { value: "ryan_coupe", label: "Ryan Coupe", aliases: ["ryan coupe", "ryan matthew coupe"], roles: ["property_manager"] }
];

export function normalizePreviewToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function normalizePreviewLookup(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compact(values = []) {
  return values.filter((value) => value !== undefined && value !== null && String(value).trim() !== "");
}

function exactOptionForValue(options = [], value) {
  if (!options.length) return null;
  const raw = String(value || "").trim();
  const token = normalizePreviewToken(value);
  const lookup = normalizePreviewLookup(value);
  return options.find((option) => {
    const optionValues = [option?.value, option?.label, ...(option?.aliases || [])].filter(Boolean);
    return optionValues.some((optionValue) => {
      const optionRaw = String(optionValue || "").trim();
      return optionRaw === raw ||
        normalizePreviewToken(optionRaw) === token ||
        normalizePreviewLookup(optionRaw) === lookup;
    });
  }) || null;
}

function optionForValue(options = [], value) {
  return exactOptionForValue(options, value) || options[0] || null;
}

function optionMatchesRole(option, role) {
  const roleToken = normalizePreviewToken(role);
  return (option?.roles || []).map(normalizePreviewToken).includes(roleToken);
}

export function adminPreviewPortalRole(portal) {
  const token = normalizePreviewToken(portal);
  const option = adminPreviewPortalOptions.find((item) => item.value === token || normalizePreviewToken(item.label) === token);
  return option?.value || adminPreviewPortalOptions[0].value;
}

export function adminPreviewUsersForPortal(portal) {
  const role = adminPreviewPortalRole(portal);
  return readAdminPreviewUserOptions().filter((option) => optionMatchesRole(option, role));
}

export function isAdminPreviewUserAllowedForPortal(user, portal) {
  const userOption = exactOptionForValue(readAdminPreviewUserOptions(), user);
  if (!userOption) return false;
  return adminPreviewUsersForPortal(portal).some((option) => option.value === userOption.value);
}

function optionLookupValues(option) {
  return [option?.label, option?.value, ...(option?.aliases || [])].map(normalizePreviewLookup).filter(Boolean);
}

function fieldLookupValues(row = {}, fields = []) {
  return fields.flatMap((field) => {
    const value = row?.[field];
    if (Array.isArray(value)) return value;
    return [value];
  }).map(normalizePreviewLookup).filter(Boolean);
}

function lookupMatchesAny(rowValues, optionValues) {
  return rowValues.some((rowValue) => optionValues.some((optionValue) => {
    if (!rowValue || !optionValue) return false;
    return rowValue === optionValue || rowValue.includes(optionValue) || optionValue.includes(rowValue);
  }));
}

const inactivePreviewStatuses = new Set(["archived", "deleted", "disabled", "inactive", "rejected", "removed", "suspended"]);

function adminPreviewRoleForProfile(profile = {}) {
  const role = normalizePreviewToken(profile?.role);
  if (isAdminRoleValue(role)) return "admin";
  if (role === "contractor") return "contractor";
  if (role === "property_manager" || role === "propertymanager") return "property_manager";
  if (profile?.property_manager_property_id || profile?.requested_property_name) return "property_manager";
  if (profile?.contractor_approved !== undefined && profile?.contractor_approved !== null) return "contractor";
  return "";
}

function previewProfileIsActive(profile = {}) {
  const role = adminPreviewRoleForProfile(profile);
  const status = normalizePreviewToken(profile?.status);
  if (!role || inactivePreviewStatuses.has(status)) return false;
  if (role === "contractor") {
    return profile?.contractor_approved === true || ["active", "approved", "enabled", "live"].includes(status);
  }
  return true;
}

function normalizeAdminPreviewUserOption(option = {}) {
  const role = adminPreviewPortalRole(option.roles?.[0] || option.role || "");
  const value = String(option.value || option.id || option.email || normalizePreviewToken(option.label)).trim();
  const label = String(option.label || option.full_name || option.name || option.email || value || "Preview User").trim();
  if (!value || !label) return null;
  return {
    value,
    label,
    aliases: compact([...(option.aliases || []), option.id, option.email, option.full_name, option.name, option.display_name, value, label]),
    roles: [role],
    email: option.email || "",
    status: option.status || ""
  };
}

function mergeAdminPreviewUserOptions(...optionGroups) {
  const seen = new Set();
  return optionGroups
    .flat()
    .map(normalizeAdminPreviewUserOption)
    .filter(Boolean)
    .filter((option) => {
      const key = `${adminPreviewPortalRole(option.roles?.[0])}:${normalizePreviewLookup(option.value)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => {
      const roleOrder = { admin: 0, contractor: 1, property_manager: 2 };
      const roleDelta = (roleOrder[adminPreviewPortalRole(a.roles?.[0])] ?? 9) - (roleOrder[adminPreviewPortalRole(b.roles?.[0])] ?? 9);
      return roleDelta || a.label.localeCompare(b.label);
    });
}

export function adminPreviewUserOptionFromProfile(profile = {}) {
  if (!previewProfileIsActive(profile)) return null;
  const role = adminPreviewRoleForProfile(profile);
  const label = profile.full_name || profile.name || profile.display_name || profile.email || "Preview User";
  return normalizeAdminPreviewUserOption({
    value: profile.id || profile.email || normalizePreviewToken(label),
    label,
    aliases: [profile.id, profile.email, profile.full_name, profile.name, profile.display_name],
    roles: [role],
    email: profile.email || "",
    status: profile.status || ""
  });
}

export function readAdminPreviewUserOptions() {
  let stored = [];
  try {
    const raw = typeof window !== "undefined" ? window.localStorage?.getItem(adminPreviewUserOptionsStorageKey) : "";
    stored = raw ? JSON.parse(raw) : [];
  } catch {
    stored = [];
  }
  return Array.isArray(stored) && stored.length
    ? mergeAdminPreviewUserOptions(stored)
    : mergeAdminPreviewUserOptions(adminPreviewUserOptions);
}

export function writeAdminPreviewUserOptions(options = []) {
  const normalized = mergeAdminPreviewUserOptions(options);
  try {
    if (typeof window !== "undefined") {
      window.localStorage?.setItem(adminPreviewUserOptionsStorageKey, JSON.stringify(normalized));
    }
  } catch {
    // Storage may be unavailable in private browsing.
  }
  return normalized;
}

export async function loadAdminPreviewUserOptions(supabase) {
  if (!supabase) return readAdminPreviewUserOptions();

  let result = await supabase
    .from("profiles")
    .select("id,role,full_name,email,status,contractor_approved,property_manager_property_id,requested_property_name")
    .order("full_name", { ascending: true, nullsFirst: false })
    .limit(1000);

  if (result.error) {
    result = await supabase
      .from("profiles")
      .select("id,role,full_name,email,status,contractor_approved")
      .order("full_name", { ascending: true, nullsFirst: false })
      .limit(1000);
  }

  if (result.error) {
    result = await supabase
      .from("profiles")
      .select("id,role,full_name,email,status")
      .order("full_name", { ascending: true, nullsFirst: false })
      .limit(1000);
  }

  if (result.error) return readAdminPreviewUserOptions();
  const liveOptions = (result.data || []).map(adminPreviewUserOptionFromProfile).filter(Boolean);
  return liveOptions.length ? writeAdminPreviewUserOptions(liveOptions) : readAdminPreviewUserOptions();
}

export function defaultAdminPreviewContext() {
  return normalizeAdminPreviewContext({
    enabled: true,
    portal: "contractor",
    property: "vetra_forest_hills",
    user: "amelia"
  });
}

export function normalizeAdminPreviewContext(context = {}) {
  const portalOption = optionForValue(adminPreviewPortalOptions, context.portal) || adminPreviewPortalOptions[0];
  const propertyOption = optionForValue(adminPreviewPropertyOptions, context.property) || adminPreviewPropertyOptions[0];
  const allowedUsers = adminPreviewUsersForPortal(portalOption.value);
  const requestedUser = String(context.user || "").trim();
  const fallbackUser = requestedUser
    ? normalizeAdminPreviewUserOption({
        value: requestedUser,
        label: context.userLabel || context.previewUserLabel || context.user_label || requestedUser,
        aliases: [requestedUser, context.userLabel, context.previewUserLabel],
        roles: [portalOption.value]
      })
    : null;
  const userOption = exactOptionForValue(allowedUsers, requestedUser) || fallbackUser || allowedUsers[0] || adminPreviewUserOptions[0];
  return {
    enabled: context.enabled !== false,
    portal: portalOption.value,
    portalLabel: portalOption.label,
    property: propertyOption.value,
    propertyLabel: propertyOption.label,
    user: userOption.value,
    userLabel: userOption.label
  };
}

export function readAdminPreviewContext(options = {}) {
  const params = new URLSearchParams(window.location.search || "");
  const hasUrlContext = params.has("adminPreview") || params.has("previewPortal") || params.has("previewProperty") || params.has("previewUser");
  if (hasUrlContext) {
    const context = normalizeAdminPreviewContext({
      enabled: params.get("adminPreview") !== "0",
      portal: params.get("previewPortal") || params.get("portal"),
      property: params.get("previewProperty") || params.get("property"),
      user: params.get("previewUser") || params.get("user"),
      userLabel: params.get("previewUserLabel") || params.get("userLabel")
    });
    if (options.persistFromUrl !== false) writeAdminPreviewContext(context);
    return context;
  }

  try {
    const saved = window.localStorage?.getItem(adminPreviewStorageKey);
    if (saved) return normalizeAdminPreviewContext(JSON.parse(saved));
  } catch {
    // Ignore malformed preview state.
  }
  return defaultAdminPreviewContext();
}

export function writeAdminPreviewContext(context = {}) {
  const normalized = normalizeAdminPreviewContext(context);
  try {
    window.localStorage?.setItem(adminPreviewStorageKey, JSON.stringify(normalized));
  } catch {
    // Storage may be unavailable in private browsing.
  }
  return normalized;
}

export function clearAdminPreviewContext() {
  try {
    window.localStorage?.removeItem(adminPreviewStorageKey);
  } catch {
    // Storage may be unavailable in private browsing.
  }
}

export function adminPreviewTargetUrl(context = {}) {
  const normalized = normalizeAdminPreviewContext(context);
  const portal = adminPreviewPortalOptions.find((option) => option.value === normalized.portal) || adminPreviewPortalOptions[0];
  const params = new URLSearchParams({
    adminPreview: "1",
    previewPortal: normalized.portal,
    previewProperty: normalized.property,
    previewUser: normalized.user,
    previewUserLabel: normalized.userLabel
  });
  return `${portal.href}?${params.toString()}`;
}

export function adminPreviewSummary(context = {}) {
  const normalized = normalizeAdminPreviewContext(context);
  return `${normalized.portalLabel} / ${normalized.propertyLabel} / ${normalized.userLabel}`;
}

export function isAdminRoleValue(value) {
  return ["admin", "administrator", "owner", "super_admin"].includes(normalizePreviewToken(value));
}

export async function verifyAdminPreviewSession(supabase, user) {
  const preview = readAdminPreviewContext();
  if (!preview?.enabled || !supabase || !user?.id) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id,role,full_name,email,status")
    .eq("id", user.id)
    .maybeSingle();

  const isAdmin = isAdminRoleValue(profile?.role) ||
    isAdminRoleValue(user.app_metadata?.role) ||
    isAdminRoleValue(user.user_metadata?.role);

  if (!isAdmin) return null;
  return { preview, adminUser: user, adminProfile: profile || null };
}

function profileMatchesRole(profile, targetRole) {
  if (!targetRole) return true;
  const role = normalizePreviewToken(profile?.role);
  if (targetRole === "admin") return isAdminRoleValue(role);
  if (targetRole === "property_manager") return role === "property_manager" || Boolean(profile?.property_manager_property_id || profile?.requested_property_name);
  return role === normalizePreviewToken(targetRole);
}

function profileMatchesUser(profile, userOption) {
  const optionValues = optionLookupValues(userOption);
  const rowValues = fieldLookupValues(profile, ["id", "full_name", "email", "name", "display_name"]);
  return lookupMatchesAny(rowValues, optionValues);
}

export async function resolvePreviewProfile(supabase, preview, targetRole = "") {
  if (!supabase || !preview) return null;
  const targetRoleToken = normalizePreviewToken(targetRole);
  const allowedUsers = targetRoleToken ? adminPreviewUsersForPortal(targetRoleToken) : readAdminPreviewUserOptions();
  const userOption = exactOptionForValue(allowedUsers, preview.user) || normalizeAdminPreviewUserOption({
    value: preview.user,
    label: preview.userLabel || preview.user,
    aliases: [preview.user, preview.userLabel],
    roles: [targetRoleToken || preview.portal || "contractor"]
  });

  let result = await supabase
    .from("profiles")
    .select("id,role,full_name,email,status,contractor_approved,property_manager_property_id,requested_property_name,allowed_regions,allowed_property_ids,allowed_property_names")
    .limit(500);

  if (result.error) {
    result = await supabase
      .from("profiles")
      .select("id,role,full_name,email,status,contractor_approved,property_manager_property_id,requested_property_name")
      .limit(500);
  }

  if (result.error) {
    result = await supabase
      .from("profiles")
      .select("id,role,full_name,email,status")
      .limit(500);
  }

  if (result.error) return null;
  const profiles = result.data || [];
  const previewValue = normalizePreviewLookup(preview.user);
  const directMatch = profiles.find((profile) => {
    const rowValues = fieldLookupValues(profile, ["id", "full_name", "email", "name", "display_name"]);
    return rowValues.includes(previewValue) && (!targetRoleToken || profileMatchesRole(profile, targetRoleToken));
  });
  if (directMatch) return directMatch;
  if (!userOption) return null;
  const userMatches = profiles.filter((profile) => profileMatchesUser(profile, userOption));
  if (targetRoleToken) {
    return userMatches.find((profile) => profileMatchesRole(profile, targetRoleToken)) || null;
  }
  return userMatches[0] || null;
}

function propertyMatchesOption(row, propertyOption) {
  const optionValues = optionLookupValues(propertyOption);
  const metadata = row?.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? row.metadata : {};
  const rowValues = [
    ...fieldLookupValues(row, ["name", "property_name", "company_name", "client_name", "title", "display_name", "address", "billing_address", "property_address", "service_address"]),
    ...fieldLookupValues(metadata, ["name", "property_name", "company_name", "client_name", "title", "display_name", "address", "billing_address", "property_address", "service_address"])
  ];
  return lookupMatchesAny(rowValues, optionValues);
}

async function fetchPreviewRows(supabase, table, select = "*") {
  const { data, error } = await supabase.from(table).select(select).limit(500);
  return error ? [] : data || [];
}

export async function resolvePreviewProperty(supabase, preview) {
  if (!supabase || !preview) return null;
  const propertyOption = optionForValue(adminPreviewPropertyOptions, preview.property);

  const portalProperties = await fetchPreviewRows(supabase, "portal_properties");
  const portalProperty = portalProperties.find((row) => propertyMatchesOption(row, propertyOption));
  if (portalProperty) return { ...portalProperty, __previewSourceTable: "portal_properties" };

  const contracts = await fetchPreviewRows(supabase, "client_contracts");
  const contract = contracts.find((row) => propertyMatchesOption(row, propertyOption));
  if (contract) return { ...contract, __previewSourceTable: "client_contracts" };

  const clients = await fetchPreviewRows(supabase, "clients");
  const client = clients.find((row) => propertyMatchesOption(row, propertyOption));
  if (client) return { ...client, __previewSourceTable: "clients" };

  return null;
}

export function buildPreviewEffectiveUser(profile, adminUser, role) {
  if (!profile?.id) return null;
  const fullName = profile.full_name || profile.name || profile.email || "Preview User";
  return {
    id: profile.id,
    email: profile.email || adminUser?.email || "",
    app_metadata: { ...(adminUser?.app_metadata || {}), role },
    user_metadata: {
      ...(adminUser?.user_metadata || {}),
      role,
      full_name: fullName
    }
  };
}

export function previewIdentityValues(profile, user) {
  return compact([
    profile?.id,
    user?.id,
    profile?.full_name,
    profile?.email,
    user?.email,
    user?.user_metadata?.full_name
  ]);
}

export function rowMatchesPreviewUser(row = {}, identityValues = []) {
  const identity = new Set(identityValues.map(normalizePreviewLookup).filter(Boolean));
  if (!identity.size) return false;
  const rowValues = fieldLookupValues(row, [
    "claimed_by",
    "assigned_to",
    "started_by",
    "completed_by",
    "claimed_by_name",
    "claimed_by_email",
    "assigned_to_name",
    "assigned_to_email",
    "contractor_name",
    "contractor_email"
  ]);
  return rowValues.some((value) => identity.has(value) || [...identity].some((candidate) => value.includes(candidate) || candidate.includes(value)));
}

export function rowMatchesPreviewProperty(row = {}, preview = {}) {
  const propertyOption = optionForValue(adminPreviewPropertyOptions, preview.property);
  return propertyMatchesOption(row, propertyOption);
}
