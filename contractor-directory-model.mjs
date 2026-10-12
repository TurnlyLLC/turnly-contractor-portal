export function token(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export function title(value) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function normalizeLookup(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function metadataFor(row = {}) {
  const meta = row?.metadata;
  if (meta && typeof meta === "object" && !Array.isArray(meta)) return meta;
  if (typeof meta === "string" && meta.trim()) {
    try {
      const parsed = JSON.parse(meta);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

export function uniqueList(values = []) {
  const seen = new Set();
  return values
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .filter((value) => {
      const key = normalizeLookup(value);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function listFrom(value) {
  if (Array.isArray(value)) return uniqueList(value);
  if (value && typeof value === "object") return uniqueList(Object.values(value));
  const text = String(value || "").trim();
  if (!text) return [];
  if ((text.startsWith("[") && text.endsWith("]")) || (text.startsWith("{") && text.endsWith("}"))) {
    try {
      return listFrom(JSON.parse(text));
    } catch {
      // Fall through to comma parsing.
    }
  }
  return uniqueList(text.split(","));
}

export function firstValue(...values) {
  return values.find((value) => String(value || "").trim()) || "";
}

export function accessFromRow(row = {}) {
  const meta = metadataFor(row);
  return {
    allowedRegions: uniqueList([
      ...listFrom(row.allowed_regions),
      ...listFrom(row.allowedRegions),
      ...listFrom(meta.allowed_regions),
      ...listFrom(meta.allowedRegions)
    ]),
    allowedPropertyIds: uniqueList([
      ...listFrom(row.allowed_property_ids),
      ...listFrom(row.allowedPropertyIds),
      ...listFrom(meta.allowed_property_ids),
      ...listFrom(meta.allowedPropertyIds)
    ]),
    allowedPropertyNames: uniqueList([
      ...listFrom(row.allowed_property_names),
      ...listFrom(row.allowedPropertyNames),
      ...listFrom(meta.allowed_property_names),
      ...listFrom(meta.allowedPropertyNames)
    ])
  };
}

export function roleText(row) {
  return [row?.role, row?.team, row?.department, row?.title, row?.account_type, row?.user_type]
    .map(token)
    .filter(Boolean)
    .join("_");
}

export function isSales(row) {
  return roleText(row).includes("sales");
}

export function isPropertyManager(row) {
  const text = roleText(row);
  return text.includes("property_manager")
    || text.includes("propertymanagement")
    || text.includes("property_management")
    || Boolean(row?.property_manager_property_id)
    || Boolean(row?.requested_property_name);
}

export function isContractor(row, source) {
  const text = roleText(row);
  if (isPropertyManager(row)) return false;
  return source === "contractors"
    || Boolean(row?.contractor_approved)
    || text.includes("contractor")
    || text.includes("vendor")
    || text.includes("cleaner")
    || text.includes("service_provider");
}

export function isInactive(row) {
  return ["inactive", "disabled", "archived", "suspended", "rejected", "declined", "deleted"].includes(token(row?.status || row?.approval_status || row?.account_status));
}

export function isApproved(row) {
  return Boolean(row?.contractor_approved)
    || token(row?.approval_status) === "approved"
    || ["approved", "enabled", "onboarded"].includes(token(row?.status));
}

export function activeStatus(row) {
  return ["active", "approved", "enabled", "onboarded"].includes(token(row?.status || row?.approval_status || row?.account_status));
}

export function teamFor(row, source) {
  if (isPropertyManager(row)) return "property_manager";
  if (isSales(row)) return "sales";
  if (isContractor(row, source)) return "contractor";
  return "";
}

export function visibleStatus(row, team) {
  if (isInactive(row)) return token(row?.status || row?.approval_status) || "inactive";
  if (team === "contractor" && !isApproved(row)) return "pending_approval";
  if (team === "contractor" && isApproved(row)) return "active";
  if (team === "property_manager" && activeStatus(row)) return "active";
  if (activeStatus(row)) return "active";
  return token(row?.status) && token(row?.status) !== "pending_approval" ? token(row?.status) : "active";
}

export function normalizePerson(row, source) {
  const team = teamFor(row, source);
  if (!team) return null;
  const access = accessFromRow(row);
  const email = row?.email || row?.contact_email || row?.primary_email || "";
  const name = row?.full_name || row?.name || row?.display_name || row?.contractor_name || row?.sales_name || email.split("@")[0] || "Unnamed";
  const id = row?.profile_id || row?.user_id || row?.auth_user_id || row?.id || email || name;
  const service = team === "property_manager"
    ? "Property Manager"
    : team === "sales"
    ? row?.title || row?.department || row?.service_type || "Sales Team"
    : Array.isArray(row?.service_types)
      ? row.service_types.filter(Boolean).join(", ")
      : row?.service_type || row?.services || row?.specialties || "Contractor";
  const status = visibleStatus(row, team);
  return {
    key: `${source}:${id}`,
    id: String(id || ""),
    profileId: String(row?.profile_id || (source === "profiles" ? row?.id || "" : "")),
    source,
    sourceLabel: source === "profiles" ? "Registered Account" : "Directory Invite",
    team,
    teamLabel: team === "property_manager" ? "Property Manager" : team === "sales" ? "Sales Team" : "Contractor",
    name: String(name || "Unnamed"),
    email: String(email || ""),
    phone: String(row?.phone || row?.contact_phone || row?.primary_phone || ""),
    company: String(row?.company_name || row?.business_name || row?.company || ""),
    service: String(service || ""),
    location: String(row?.market || row?.region || row?.location || [row?.city, row?.state].filter(Boolean).join(", ") || ""),
    notes: String(row?.notes || row?.bio || ""),
    allowedRegions: access.allowedRegions,
    allowedPropertyIds: access.allowedPropertyIds,
    allowedPropertyNames: access.allowedPropertyNames,
    propertyManagerPropertyId: String(row?.property_manager_property_id || ""),
    requestedPropertyName: String(row?.requested_property_name || ""),
    status,
    approved: team !== "contractor" || isApproved(row),
    raw: row
  };
}


export function mergeDirectoryPeople(rows) {
  const unique=new Map();
  for(const person of rows){
    const key=person.email.trim().toLowerCase()||person.key;
    if(!unique.has(key)||person.source==='profiles')unique.set(key,person);
  }
  return [...unique.values()];
}
export function activeCleaningContractors(people) {
  return mergeDirectoryPeople(people).filter(person=>{
    if(person.team!=='contractor'||person.status!=='active'||!person.approved)return false;
    if(/(?:^|_)(admin|administrator|sales|property_manager)(?:_|$)/.test(roleText(person.raw)))return false;
    const service=token(person.service);
    return !service||service==='contractor'||/clean|turnover|janitorial|housekeep/.test(service);
  }).map(person=>({...person,assignable:Boolean(person.source==='profiles'||person.raw.profile_id||person.raw.user_id||person.raw.auth_user_id)}))
    .sort((a,b)=>a.name.localeCompare(b.name)||a.email.localeCompare(b.email));
}
export async function loadActiveCleaningContractors(client) {
  const parts=await Promise.all(['profiles','contractors'].map(async source=>{
    const {data,error}=await client.from(source).select('*').limit(1000);
    if(error)throw error;
    return (data||[]).map(row=>normalizePerson(row,source)).filter(Boolean);
  }));
  return activeCleaningContractors(parts.flat());
}
