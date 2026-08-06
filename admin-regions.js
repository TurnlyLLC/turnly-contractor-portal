import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const env = window.__ENV || {};
const supabase = env.SUPABASE_URL && env.SUPABASE_ANON_KEY
  ? createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
  : null;

const root = document.getElementById("regionAccessRoot");

const state = {
  loading: false,
  saving: false,
  message: "",
  error: false,
  user: null,
  profile: null,
  regions: [],
  regionLinks: [],
  managerRegionLinks: [],
  managerPropertyLinks: [],
  managers: [],
  propertyOptions: [],
  stateSettingsRecordId: "",
  cityStateOverrides: {},
  hiddenStates: [],
  selectedRegionId: "",
  selectedManagerId: "",
  propertySearch: "",
  managerSearch: "",
  directPropertySearch: "",
  pendingRegionPropertyKeys: null,
  pendingRegionManagerIds: null,
  pendingDirectPropertyKeysByManager: {}
};

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizeToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeLookup(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compact(values = []) {
  return values.filter((value) => value !== undefined && value !== null && String(value).trim() !== "");
}

function unique(values = []) {
  const seen = new Set();
  return values.filter((value) => {
    const key = String(value || "").trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function firstValue(...values) {
  return compact(values)[0] || "";
}

function metadata(row = {}) {
  const raw = row?.metadata;
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function displayStatus(value) {
  const status = normalizeToken(value || "active");
  if (status === "inactive") return "Inactive";
  if (status === "archived") return "Archived";
  return "Active";
}

function isActiveish(row = {}) {
  const token = normalizeToken(row.status || row.pipeline_stage || row.stage || row.contract_status || "active");
  return !["lost", "cancelled", "canceled", "archived", "inactive", "deleted"].includes(token);
}

function propertyName(row = {}) {
  const meta = metadata(row);
  return firstValue(
    row.property_name,
    row.name,
    row.company_name,
    row.client_name,
    row.title,
    row.display_name,
    meta.property_name,
    meta.name,
    meta.company_name
  ) || "Unnamed property";
}

function propertyAddress(row = {}) {
  const meta = metadata(row);
  return firstValue(
    row.address,
    row.property_address,
    row.billing_address,
    row.service_address,
    compact([row.city, row.state, row.postal_code]).join(", "),
    meta.address,
    meta.property_address,
    meta.service_address
  );
}

function propertyRegion(row = {}) {
  const meta = metadata(row);
  return firstValue(
    row.region,
    row.market,
    row.location,
    row.city,
    meta.region,
    meta.market,
    meta.location,
    "Unassigned Region"
  );
}

function propertyCity(row = {}) {
  const meta = metadata(row);
  const address = firstValue(row.address, row.property_address, row.service_address, row.billing_address, meta.address);
  const addressCity = String(address || "").split(",")[0] || "";
  return firstValue(
    row.city,
    row.service_city,
    row.property_city,
    meta.city,
    meta.service_city,
    meta.property_city,
    addressCity
  );
}

function propertyState(row = {}) {
  const meta = metadata(row);
  const address = firstValue(row.address, row.property_address, row.service_address, row.billing_address, meta.address);
  const addressState = String(address || "").match(/,\s*([A-Z]{2})(?:\s+\d{5})?\s*$/i)?.[1] || "";
  const cityOverride = cityStateForCity(propertyCity(row));
  if (cityOverride) return cityOverride;
  return firstValue(
    row.state,
    row.service_state,
    row.property_state,
    meta.state,
    meta.service_state,
    meta.property_state,
    addressState,
    "Unassigned State"
  ).toUpperCase();
}

function normalizePropertyOption(row = {}, source = {}) {
  const name = propertyName(row);
  const address = propertyAddress(row);
  if (!normalizeLookup(name) && !normalizeLookup(address)) return null;
  const sourceTable = source.table || row.__sourceTable || "";
  const portalPropertyId = sourceTable === "portal_properties" ? row.id || "" : "";
  const contractId = sourceTable === "client_contracts" ? row.id || "" : "";
  return {
    key: "",
    id: String(portalPropertyId || contractId || row.id || ""),
    portalPropertyId: String(portalPropertyId || ""),
    contractId: String(contractId || ""),
    name: String(name),
    address: String(address || ""),
    region: String(propertyRegion(row) || "Unassigned Region"),
    stateName: String(propertyState(row) || "Unassigned State"),
    cityName: String(propertyCity(row) || ""),
    sourceLabel: sourceTable === "client_contracts" ? "Contract" : "Property",
    sourceTable,
    active: isActiveish(row),
    row
  };
}

function optionKey(option = {}) {
  return normalizeLookup([option.name, option.address].filter(Boolean).join(" ")) ||
    option.portalPropertyId ||
    option.contractId ||
    option.id;
}

function mergedPropertyOptions(properties = [], contracts = []) {
  const options = [
    ...properties.map((row) => normalizePropertyOption(row, { table: "portal_properties" })),
    ...contracts.map((row) => normalizePropertyOption(row, { table: "client_contracts" }))
  ].filter(Boolean).filter((option) => option.active || option.sourceTable === "portal_properties");
  const byKey = new Map();
  options.forEach((option) => {
    const key = optionKey(option);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...option, key });
      return;
    }
    existing.portalPropertyId = existing.portalPropertyId || option.portalPropertyId;
    existing.contractId = existing.contractId || option.contractId;
    existing.id = existing.portalPropertyId || existing.contractId || existing.id || option.id;
    existing.region = existing.region === "Unassigned Region" ? option.region : existing.region;
    existing.address = existing.address || option.address;
    existing.sourceLabel = unique([existing.sourceLabel, option.sourceLabel]).join(" / ");
  });
  return Array.from(byKey.values())
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

function contractPropertyOptions(properties = [], contracts = []) {
  const portalOptions = properties
    .map((row) => normalizePropertyOption(row, { table: "portal_properties" }))
    .filter(Boolean);
  const activeContracts = contracts
    .map((row) => normalizePropertyOption(row, { table: "client_contracts" }))
    .filter((option) => option && option.active);

  const byClientId = new Map();
  const byPortalId = new Map();
  const byLookup = new Map();
  portalOptions.forEach((option) => {
    const row = option.row || {};
    if (row.client_id) byClientId.set(String(row.client_id), option);
    if (option.portalPropertyId) byPortalId.set(String(option.portalPropertyId), option);
    byLookup.set(optionKey(option), option);
  });

  const sourceOptions = activeContracts.length ? activeContracts : portalOptions.filter((option) => option.active);
  return sourceOptions.map((option) => {
    const portalMatch = byClientId.get(option.contractId)
      || byPortalId.get(option.contractId)
      || byLookup.get(option.key)
      || portalOptions.find((portalOption) => normalizeLookup(portalOption.name) === normalizeLookup(option.name));
    const merged = {
      ...option,
      portalPropertyId: option.portalPropertyId || portalMatch?.portalPropertyId || "",
      address: option.address || portalMatch?.address || "",
      stateName: option.stateName && option.stateName !== "UNASSIGNED STATE" ? option.stateName : portalMatch?.stateName || "Unassigned State",
      sourceLabel: activeContracts.length ? "Contract" : "Property"
    };
    return {
      ...merged,
      key: optionKey(merged)
    };
  }).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

function managerName(row = {}) {
  return firstValue(row.full_name, row.name, row.display_name, row.email, "Property Manager");
}

function managerStatus(row = {}) {
  return displayStatus(row.status || "active");
}

function isPropertyManager(row = {}) {
  return normalizeToken(row.role) === "property_manager" ||
    Boolean(row.property_manager_property_id) ||
    Boolean(row.requested_property_name);
}

function propertyMatchesSearch(option, search) {
  const term = normalizeLookup(search);
  if (!term) return true;
  return [option.name, option.address, option.region, option.sourceLabel]
    .some((value) => normalizeLookup(value).includes(term));
}

function managerMatchesSearch(manager, search) {
  const term = normalizeLookup(search);
  if (!term) return true;
  return [managerName(manager), manager.email, managerStatus(manager), manager.requested_property_name]
    .some((value) => normalizeLookup(value).includes(term));
}

function regionById(id) {
  return state.regions.find((region) => String(region.id) === String(id)) || null;
}

function managerById(id) {
  return state.managers.find((manager) => String(manager.id) === String(id)) || null;
}

function optionByKey(key) {
  return state.propertyOptions.find((option) => option.key === key) || null;
}

function optionByPortalPropertyId(id) {
  if (!id) return null;
  return state.propertyOptions.find((option) => option.portalPropertyId && String(option.portalPropertyId) === String(id)) || null;
}

function optionForLink(link = {}) {
  return state.propertyOptions.find((item) => (
    (link.portal_property_id && item.portalPropertyId && String(item.portalPropertyId) === String(link.portal_property_id))
    || (link.contract_id && item.contractId && String(item.contractId) === String(link.contract_id))
    || normalizeLookup(item.name) === normalizeLookup(link.property_name)
  )) || null;
}

function linkMatchesOption(link = {}, option = {}) {
  if (!option) return false;
  return Boolean(
    (link.portal_property_id && option.portalPropertyId && String(link.portal_property_id) === String(option.portalPropertyId))
    || (link.contract_id && option.contractId && String(link.contract_id) === String(option.contractId))
    || normalizeLookup(link.property_name) === normalizeLookup(option.name)
  );
}

function regionPropertyLinks(regionId = state.selectedRegionId) {
  return state.regionLinks.filter((link) => String(link.region_id) === String(regionId) && normalizeToken(link.status || "active") === "active");
}

function regionManagerLinks(regionId = state.selectedRegionId) {
  return state.managerRegionLinks.filter((link) => String(link.region_id) === String(regionId) && normalizeToken(link.status || "active") === "active");
}

function managerDirectLinks(managerId = state.selectedManagerId) {
  return state.managerPropertyLinks.filter((link) => String(link.profile_id) === String(managerId) && normalizeToken(link.status || "active") === "active");
}

function regionPropertyKeys(regionId = state.selectedRegionId) {
  const keys = new Set();
  regionPropertyLinks(regionId).forEach((link) => {
    const option = state.propertyOptions.find((item) => (
      (link.portal_property_id && item.portalPropertyId && String(item.portalPropertyId) === String(link.portal_property_id))
      || (link.contract_id && item.contractId && String(item.contractId) === String(link.contract_id))
      || normalizeLookup(item.name) === normalizeLookup(link.property_name)
    ));
    if (option) keys.add(option.key);
  });
  return keys;
}

function managerDirectPropertyKeys(managerId = state.selectedManagerId) {
  const keys = new Set();
  managerDirectLinks(managerId).forEach((link) => {
    const option = state.propertyOptions.find((item) => (
      (link.portal_property_id && item.portalPropertyId && String(item.portalPropertyId) === String(link.portal_property_id))
      || (link.contract_id && item.contractId && String(item.contractId) === String(link.contract_id))
      || normalizeLookup(item.name) === normalizeLookup(link.property_name)
    ));
    if (option) keys.add(option.key);
  });
  return keys;
}

function currentRegionPropertyKeys(regionId = state.selectedRegionId) {
  return state.pendingRegionPropertyKeys instanceof Set
    ? new Set(state.pendingRegionPropertyKeys)
    : regionPropertyKeys(regionId);
}

function currentRegionManagerIds(regionId = state.selectedRegionId) {
  return state.pendingRegionManagerIds instanceof Set
    ? new Set(state.pendingRegionManagerIds)
    : new Set(regionManagerLinks(regionId).map((link) => String(link.profile_id)));
}

function currentDirectPropertyKeys(managerId = state.selectedManagerId) {
  const pending = state.pendingDirectPropertyKeysByManager[managerId];
  return pending instanceof Set ? new Set(pending) : managerDirectPropertyKeys(managerId);
}

function resetPendingSelections() {
  state.pendingRegionPropertyKeys = null;
  state.pendingRegionManagerIds = null;
  state.pendingDirectPropertyKeysByManager = {};
}

function managerRegionIds(managerId) {
  return new Set(state.managerRegionLinks
    .filter((link) => String(link.profile_id) === String(managerId) && normalizeToken(link.status || "active") === "active")
    .map((link) => String(link.region_id)));
}

function managerPropertySummary(manager) {
  const direct = managerDirectLinks(manager.id)
    .map((link) => optionByPortalPropertyId(link.portal_property_id)?.name || link.property_name)
    .filter(Boolean);
  const regionIds = managerRegionIds(manager.id);
  const viaRegion = Array.from(regionIds).flatMap((regionId) => regionPropertyLinks(regionId))
    .map((link) => optionByPortalPropertyId(link.portal_property_id)?.name || link.property_name)
    .filter(Boolean);
  return unique([...direct, ...viaRegion]).slice(0, 4).join(", ") || "No properties assigned";
}

function regionManagerCount(regionId) {
  return new Set(regionManagerLinks(regionId).map((link) => String(link.profile_id))).size;
}

function regionPropertyCount(regionId) {
  return regionPropertyKeys(regionId).size;
}

function allAssignedPropertyKeys() {
  const keys = new Set();
  state.regionLinks.forEach((link) => {
    if (normalizeToken(link.status || "active") !== "active") return;
    const option = state.propertyOptions.find((item) => (
      (link.portal_property_id && item.portalPropertyId && String(item.portalPropertyId) === String(link.portal_property_id))
      || (link.contract_id && item.contractId && String(item.contractId) === String(link.contract_id))
      || normalizeLookup(item.name) === normalizeLookup(link.property_name)
    ));
    if (option) keys.add(option.key);
  });
  return keys;
}

function unassignedPropertyOptions(limit = 8) {
  const assigned = allAssignedPropertyKeys();
  return state.propertyOptions
    .filter((option) => !assigned.has(option.key))
    .slice(0, limit);
}

function visiblePropertyOptions(search) {
  return state.propertyOptions.filter((option) => propertyMatchesSearch(option, search));
}

function visibleManagers(search) {
  return state.managers.filter((manager) => managerMatchesSearch(manager, search));
}

function managerInitials(manager = {}) {
  const name = managerName(manager);
  const parts = name.split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : name.slice(0, 2)).toUpperCase();
}

function renderSelectionToolbar(kind, selectedCount, visibleCount, totalCount, noun) {
  return `
    <div class="region-selection-toolbar">
      <span>${esc(selectedCount)} selected</span>
      <small>${esc(visibleCount)} visible / ${esc(totalCount)} total ${esc(noun)}</small>
      <div>
        <button class="secondary-action compact-action" type="button" data-bulk-select="${esc(kind)}" data-bulk-action="select">Select Visible</button>
        <button class="secondary-action compact-action" type="button" data-bulk-select="${esc(kind)}" data-bulk-action="clear">Clear Visible</button>
      </div>
    </div>
  `;
}

const US_STATE_OPTIONS = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "IA", "ID", "IL", "IN", "KS", "KY", "LA", "MA", "MD",
  "ME", "MI", "MN", "MO", "MS", "MT", "NC", "ND", "NE", "NH",
  "NJ", "NM", "NV", "NY", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VA", "VT", "WA", "WI", "WV", "WY",
  "DC"
];

const US_STATE_LABELS = {
  AL: "Alabama",
  AK: "Alaska",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  FL: "Florida",
  GA: "Georgia",
  HI: "Hawaii",
  IA: "Iowa",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  MA: "Massachusetts",
  MD: "Maryland",
  ME: "Maine",
  MI: "Michigan",
  MN: "Minnesota",
  MO: "Missouri",
  MS: "Mississippi",
  MT: "Montana",
  NC: "North Carolina",
  ND: "North Dakota",
  NE: "Nebraska",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NV: "Nevada",
  NY: "New York",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VA: "Virginia",
  VT: "Vermont",
  WA: "Washington",
  WI: "Wisconsin",
  WV: "West Virginia",
  WY: "Wyoming",
  DC: "District of Columbia"
};

const US_STATE_CODE_BY_LOOKUP = Object.entries(US_STATE_LABELS).reduce((map, [code, label]) => {
  map[normalizeLookup(code)] = code;
  map[normalizeLookup(label)] = code;
  map[normalizeLookup(label).replace(/\s+/g, "")] = code;
  return map;
}, {});

function cleanStateName(value) {
  const raw = String(value || "").trim();
  if (!raw) return "Unassigned State";
  const lookup = normalizeLookup(raw);
  const code = US_STATE_CODE_BY_LOOKUP[lookup] || US_STATE_CODE_BY_LOOKUP[lookup.replace(/\s+/g, "")];
  if (code) return code;
  return raw.length <= 3 ? raw.toUpperCase() : raw.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function stateDisplayLabel(value) {
  const clean = cleanStateName(value);
  return US_STATE_LABELS[clean] || clean;
}

function hiddenStateSet() {
  return new Set((state.hiddenStates || []).map(cleanStateName));
}

function isHiddenState(value) {
  const clean = cleanStateName(value);
  return clean !== "Unassigned State" && hiddenStateSet().has(clean);
}

function displayStateName(value) {
  const clean = cleanStateName(value);
  return isHiddenState(clean) ? "Unassigned State" : clean;
}

function cityStateForCity(city) {
  const key = normalizeLookup(city);
  return key ? state.cityStateOverrides?.[key] || "" : "";
}

function detectedCityRows() {
  const rowsByCity = new Map();
  state.propertyOptions.forEach((option) => {
    const city = String(option.cityName || "").trim();
    if (!city) return;
    const key = normalizeLookup(city);
    const existing = rowsByCity.get(key) || { key, city, states: new Set(), count: 0 };
    existing.states.add(cleanStateName(option.stateName));
    existing.count += 1;
    rowsByCity.set(key, existing);
  });
  return Array.from(rowsByCity.values())
    .map((row) => ({
      ...row,
      detectedState: Array.from(row.states).filter(Boolean).join(", ") || "Unassigned State",
      overrideState: state.cityStateOverrides?.[row.key] || ""
    }))
    .sort((a, b) => a.city.localeCompare(b.city, undefined, { sensitivity: "base" }));
}

function stateOptionMarkup(selected = "") {
  const current = cleanStateName(selected);
  const options = unique([
    current,
    ...US_STATE_OPTIONS,
    ...stateGroups().map((group) => group.stateName).filter((name) => name !== "Unassigned State")
  ]).filter(Boolean);
  return options.map((option) => {
    const clean = cleanStateName(option);
    return `<option value="${esc(clean)}" ${clean === current ? "selected" : ""}>${esc(stateDisplayLabel(clean))}</option>`;
  }).join("");
}

function regionStateName(region = {}) {
  const meta = metadata(region);
  const assigned = regionPropertyLinks(region.id).map(optionForLink).filter(Boolean);
  return displayStateName(firstValue(
    region.state,
    region.service_state,
    meta.state,
    meta.service_state,
    meta.state_name,
    assigned[0]?.stateName,
    "Unassigned State"
  ));
}

function propertyRegionLink(option = {}) {
  const matches = state.regionLinks.filter((link) => normalizeToken(link.status || "active") === "active" && linkMatchesOption(link, option));
  return matches[matches.length - 1] || null;
}

function propertyRegionId(option = {}) {
  return propertyRegionLink(option)?.region_id || "";
}

function propertyAssignedToRegion(option = {}, regionId = "") {
  return String(propertyRegionId(option)) === String(regionId);
}

function propertiesForRegion(regionId) {
  return state.propertyOptions.filter((option) => propertyAssignedToRegion(option, regionId));
}

function unassignedProperties() {
  return state.propertyOptions.filter((option) => !propertyRegionId(option));
}

function managerPropertyKeys(managerId) {
  const keys = new Set();
  managerDirectLinks(managerId).forEach((link) => {
    const option = optionForLink(link);
    if (option) keys.add(option.key);
  });
  return keys;
}

function managersForProperty(option = {}, regionId = "") {
  const rows = [];
  const directIds = new Set(state.managerPropertyLinks
    .filter((link) => normalizeToken(link.status || "active") === "active" && linkMatchesOption(link, option))
    .map((link) => String(link.profile_id)));
  directIds.forEach((id) => {
    const manager = managerById(id);
    if (manager) rows.push({ manager, source: "Direct" });
  });
  regionManagerLinks(regionId).forEach((link) => {
    const id = String(link.profile_id);
    if (directIds.has(id)) return;
    const manager = managerById(id);
    if (manager) rows.push({ manager, source: "Region" });
  });
  return rows.sort((a, b) => managerName(a.manager).localeCompare(managerName(b.manager), undefined, { sensitivity: "base" }));
}

function managerIdsForProperty(option = {}, regionId = "") {
  return new Set(managersForProperty(option, regionId).map(({ manager }) => String(manager.id)));
}

function unassignedManagers() {
  return state.managers.filter((manager) => {
    const id = String(manager.id);
    return !manager.property_manager_property_id
      && managerPropertyKeys(id).size === 0
      && managerRegionIds(id).size === 0;
  });
}

function stateGroups() {
  const stateNames = new Set();
  state.propertyOptions.forEach((option) => {
    const stateName = displayStateName(option.stateName);
    if (stateName !== "Unassigned State") stateNames.add(stateName);
  });
  state.regions.forEach((region) => {
    const stateName = regionStateName(region);
    if (stateName !== "Unassigned State") stateNames.add(stateName);
  });
  return Array.from(stateNames)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
    .map((stateName) => ({
      stateName,
      regions: state.regions
        .filter((region) => regionStateName(region) === stateName && normalizeToken(region.status || "active") !== "archived")
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
    }));
}

function regionSelectOptions(selectedId = "") {
  return state.regions
    .filter((region) => normalizeToken(region.status || "active") === "active" && regionStateName(region) !== "Unassigned State")
    .sort((a, b) => `${regionStateName(a)} ${a.name}`.localeCompare(`${regionStateName(b)} ${b.name}`, undefined, { sensitivity: "base" }))
    .map((region) => `<option value="${esc(region.id)}" ${String(region.id) === String(selectedId) ? "selected" : ""}>${esc(stateDisplayLabel(regionStateName(region)))} - ${esc(region.name)}</option>`)
    .join("");
}

function propertySelectOptions(selectedKey = "") {
  return state.propertyOptions
    .map((option) => `<option value="${esc(option.key)}" ${option.key === selectedKey ? "selected" : ""}>${esc(option.name)}${option.address ? ` - ${esc(option.address)}` : ""}</option>`)
    .join("");
}

function unassignedPropertySelectOptions(selectedKey = "") {
  return unassignedProperties()
    .map((option) => `<option value="${esc(option.key)}" ${option.key === selectedKey ? "selected" : ""}>${esc(option.name)}${option.address ? ` - ${esc(option.address)}` : ""}</option>`)
    .join("");
}

function managerSelectOptions(selectedId = "") {
  return state.managers
    .map((manager) => `<option value="${esc(manager.id)}" ${String(manager.id) === String(selectedId) ? "selected" : ""}>${esc(managerName(manager))}${manager.email ? ` - ${esc(manager.email)}` : ""}</option>`)
    .join("");
}

function managerCheckboxOptions(option = {}, regionId = "") {
  const attachedIds = managerIdsForProperty(option, regionId);
  return state.managers
    .filter((manager) => !attachedIds.has(String(manager.id)))
    .map((manager) => `
      <label class="region-manager-option">
        <input type="checkbox" value="${esc(manager.id)}" data-property-manager-pick>
        <span>
          <strong>${esc(managerName(manager))}</strong>
          <small>${esc(manager.email || "No email saved")}</small>
        </span>
      </label>
    `)
    .join("");
}

function isStateSettingsRegion(region = {}) {
  const meta = metadata(region);
  return Boolean(meta.state_city_settings) || normalizeToken(region.name) === "state_city_settings";
}

function stateSettingsMetadata(overrides = state.cityStateOverrides, hiddenStates = state.hiddenStates) {
  return {
    state_city_settings: true,
    city_state_overrides: overrides || {},
    hidden_states: (hiddenStates || []).map(cleanStateName)
  };
}

function setMessage(message, error = false) {
  state.message = message || "";
  state.error = error;
  const node = root?.querySelector("[data-region-message]");
  if (node) {
    node.textContent = state.message;
    node.classList.toggle("is-error", state.error);
  }
}

function fieldMarkup(label, name, value = "", type = "text", attrs = "") {
  return `
    <label class="region-field">
      <span>${esc(label)}</span>
      <input name="${esc(name)}" type="${esc(type)}" value="${esc(value)}" ${attrs} />
    </label>
  `;
}

function selectMarkup(label, name, options = [], value = "", attrs = "") {
  return `
    <label class="region-field">
      <span>${esc(label)}</span>
      <select name="${esc(name)}" ${attrs}>
        ${options.map((option) => `<option value="${esc(option.value)}" ${String(option.value) === String(value) ? "selected" : ""}>${esc(option.label)}</option>`).join("")}
      </select>
    </label>
  `;
}

function textareaMarkup(label, name, value = "", attrs = "") {
  return `
    <label class="region-field region-field-wide">
      <span>${esc(label)}</span>
      <textarea name="${esc(name)}" rows="3" ${attrs}>${esc(value)}</textarea>
    </label>
  `;
}

function stat(label, value, caption) {
  return `
    <article class="region-stat">
      <span>${esc(label)}</span>
      <strong>${esc(value)}</strong>
      <small>${esc(caption)}</small>
    </article>
  `;
}

function renderMessage() {
  return `<p class="region-message ${state.error ? "is-error" : ""}" data-region-message>${esc(state.message)}</p>`;
}

function renderLoading() {
  return `
    <section class="region-empty">
      <strong>Loading region access</strong>
      <p>Pulling regions, properties, contracts, and property manager accounts.</p>
    </section>
  `;
}

function renderAccessDenied() {
  return `
    <section class="region-empty">
      <strong>Admin access required</strong>
      <p>Sign in with an admin account to manage regions and property manager access.</p>
    </section>
  `;
}

function renderRegionList() {
  const rows = state.regions;
  const unassigned = unassignedPropertyOptions();
  return `
    <div class="region-sidebar-stack">
      <section class="region-card region-list-card">
        <div class="region-card-head">
          <div>
            <h2>Regions</h2>
            <p>Choose a region to manage its properties and managers.</p>
          </div>
        </div>
        <form class="region-add-form" data-region-add-form>
          ${fieldMarkup("Region name", "name", "", "text", 'placeholder="Add a new region..."')}
          <button class="primary-action" type="submit"><span>Add</span></button>
        </form>
        <div class="region-list">
          ${rows.length ? rows.map((region) => `
            <button class="region-list-item ${String(region.id) === String(state.selectedRegionId) ? "active" : ""}" type="button" data-region-select="${esc(region.id)}">
              <span>
                <strong>${esc(region.name)}</strong>
                <small>${esc(regionPropertyCount(region.id))} properties - ${esc(regionManagerCount(region.id))} managers</small>
              </span>
              <em>${esc(displayStatus(region.status))}</em>
            </button>
          `).join("") : `<div class="region-mini-empty">No regions yet. Add one above to start grouping properties.</div>`}
        </div>
      </section>
      <section class="region-card region-unassigned-card">
        <div class="region-card-head">
          <div>
            <h2>Needs Region</h2>
            <p>Properties not assigned to any service region.</p>
          </div>
          <span class="region-pill neutral">${esc(state.propertyOptions.length - allAssignedPropertyKeys().size)}</span>
        </div>
        <div class="region-unassigned-list">
          ${unassigned.length ? unassigned.map((option) => `
            <div class="region-property-preview">
              <strong>${esc(option.name)}</strong>
              <small>${esc(propertyOptionLabel(option))}</small>
            </div>
          `).join("") : `<div class="region-mini-empty">Every visible property is assigned to a region.</div>`}
        </div>
      </section>
    </div>
  `;
}

function propertyOptionLabel(option) {
  return [option.region, option.address, option.sourceLabel].filter(Boolean).join(" - ");
}

function renderPropertyChecks(selectedKeys, search, prefix) {
  const options = visiblePropertyOptions(search);
  if (!options.length) return `<div class="region-mini-empty">No properties or contracts match this filter.</div>`;
  return `
    <div class="region-check-grid">
      ${options.map((option) => `
        <label class="region-check">
          <input type="checkbox"
            data-${prefix}-property
            data-option-key="${esc(option.key)}"
            data-portal-property-id="${esc(option.portalPropertyId)}"
            data-contract-id="${esc(option.contractId)}"
            data-property-name="${esc(option.name)}"
            ${selectedKeys.has(option.key) ? "checked" : ""} />
          <span>
            <strong>${esc(option.name)}</strong>
            <small>${esc(propertyOptionLabel(option))}</small>
          </span>
        </label>
      `).join("")}
    </div>
  `;
}

function renderManagerChecks(selectedIds, search) {
  const managers = visibleManagers(search);
  if (!managers.length) return `<div class="region-mini-empty">No property managers match this filter.</div>`;
  return `
    <div class="region-check-grid manager-check-grid">
      ${managers.map((manager) => `
        <label class="region-check">
          <input type="checkbox" data-region-manager value="${esc(manager.id)}" ${selectedIds.has(String(manager.id)) ? "checked" : ""} />
          <span>
            <strong>${esc(managerName(manager))}</strong>
            <small>${esc([manager.email, managerStatus(manager), manager.requested_property_name ? `Requested: ${manager.requested_property_name}` : ""].filter(Boolean).join(" - "))}</small>
          </span>
        </label>
      `).join("")}
    </div>
  `;
}

function renderSelectedRegion() {
  const region = regionById(state.selectedRegionId);
  if (!region) {
    return `
      <section class="region-card region-detail-card">
        <div class="region-empty">
          <strong>Select a region</strong>
          <p>Add a region or choose one from the left to attach properties and managers.</p>
        </div>
      </section>
    `;
  }
  const propertyKeys = currentRegionPropertyKeys(region.id);
  const managerIds = currentRegionManagerIds(region.id);
  const propertyVisible = visiblePropertyOptions(state.propertySearch).length;
  const managerVisible = visibleManagers(state.managerSearch).length;
  const managerNames = Array.from(managerIds).map(managerById).filter(Boolean).map(managerName);
  return `
    <section class="region-card region-detail-card">
      <div class="region-card-head">
        <div>
          <h2>${esc(region.name)}</h2>
          <p>Control which properties belong to this region and which managers can access it.</p>
        </div>
        <span class="region-pill">${esc(displayStatus(region.status))}</span>
      </div>
      <div class="region-summary-row">
        <div>
          <span>Properties</span>
          <strong>${esc(propertyKeys.size)}</strong>
        </div>
        <div>
          <span>Managers</span>
          <strong>${esc(managerIds.size)}</strong>
        </div>
        <div>
          <span>Manager Access</span>
          <strong>${esc(managerNames.slice(0, 2).join(", ") || "None")}</strong>
        </div>
      </div>
      <details class="region-settings">
        <summary>
          <span>Region Settings</span>
          <small>Rename, archive, or keep internal notes.</small>
        </summary>
        <form class="region-form-grid" data-region-detail-form>
          <input type="hidden" name="id" value="${esc(region.id)}" />
          ${fieldMarkup("Region name", "name", region.name)}
          ${selectMarkup("Status", "status", [
            { value: "active", label: "Active" },
            { value: "inactive", label: "Inactive" },
            { value: "archived", label: "Archived" }
          ], region.status || "active")}
          ${textareaMarkup("Notes", "notes", region.notes || "", 'placeholder="Optional internal notes for this region."')}
          <div class="region-form-actions">
            <button class="secondary-action" type="button" data-region-archive="${esc(region.id)}"><span>Archive</span></button>
            <button class="primary-action" type="submit"><span>Save Region</span></button>
          </div>
        </form>
      </details>
      <div class="region-assignment-grid">
        <section class="region-subsection">
          <div class="region-section-head">
            <div>
              <h3>Properties and Contracts</h3>
              <p>Add active contracts or property records that belong to this region.</p>
            </div>
            <input class="region-filter" type="search" data-region-property-search value="${esc(state.propertySearch)}" placeholder="Filter properties..." />
          </div>
          ${renderSelectionToolbar("region-properties", propertyKeys.size, propertyVisible, state.propertyOptions.length, "properties")}
          ${renderPropertyChecks(propertyKeys, state.propertySearch, "region")}
          <div class="region-form-actions">
            <button class="primary-action" type="button" data-save-region-properties><span>Save Properties</span></button>
          </div>
        </section>
        <section class="region-subsection">
          <div class="region-section-head">
            <div>
              <h3>Property Managers</h3>
              <p>Managers assigned here can access every property in this region.</p>
            </div>
            <input class="region-filter" type="search" data-region-manager-search value="${esc(state.managerSearch)}" placeholder="Filter managers..." />
          </div>
          ${renderSelectionToolbar("region-managers", managerIds.size, managerVisible, state.managers.length, "managers")}
          ${renderManagerChecks(managerIds, state.managerSearch)}
          <div class="region-form-actions">
            <button class="primary-action" type="button" data-save-region-managers><span>Save Managers</span></button>
          </div>
        </section>
      </div>
    </section>
  `;
}

function renderManagerAccess() {
  const selectedManager = managerById(state.selectedManagerId) || state.managers[0] || null;
  if (!state.selectedManagerId && selectedManager) state.selectedManagerId = selectedManager.id;
  const directKeys = currentDirectPropertyKeys(state.selectedManagerId);
  const currentPrimary = selectedManager?.property_manager_property_id || "";
  const primaryValue = optionByPortalPropertyId(currentPrimary)?.key || "";
  const regionNames = Array.from(managerRegionIds(state.selectedManagerId))
    .map((id) => regionById(id)?.name)
    .filter(Boolean);
  const directVisible = visiblePropertyOptions(state.directPropertySearch).length;
  return `
    <section class="region-card manager-access-card">
      <div class="region-card-head">
        <div>
          <h2>Direct Manager Access</h2>
          <p>Give one manager access to a property without changing a whole region.</p>
        </div>
      </div>
      ${state.managers.length ? `
        <div class="region-secondary-grid">
          <div>
            <div class="region-manager-toolbar">
              ${selectMarkup("Property manager", "manager", state.managers.map((manager) => ({
                value: manager.id,
                label: `${managerName(manager)}${manager.email ? ` - ${manager.email}` : ""}`
              })), state.selectedManagerId, "data-manager-selector")}
              ${selectMarkup("Primary portal property", "primary_property", [
                { value: "", label: "No change / none" },
                ...state.propertyOptions
                  .filter((option) => option.portalPropertyId)
                  .map((option) => ({ value: option.key, label: option.name }))
              ], primaryValue, "data-manager-primary-property")}
            </div>
            <div class="region-selected-summary">
              <div class="region-manager-avatar">${esc(selectedManager ? managerInitials(selectedManager) : "PM")}</div>
              <div>
                <strong>${esc(selectedManager ? managerName(selectedManager) : "Property Manager")}</strong>
                <span>${esc(selectedManager?.email || "No email saved")}</span>
                <span>${esc(regionNames.length ? `Regions: ${regionNames.join(", ")}` : "No regions assigned")}</span>
              </div>
            </div>
          </div>
          <div class="region-access-preview">
            <span>Current Reach</span>
            <strong>${esc(managerPropertySummary(selectedManager || {}))}</strong>
          </div>
        </div>
        <div class="region-section-head">
          <div>
            <h3>Direct Properties</h3>
            <p>Select any individual properties this manager should see in addition to regional access.</p>
          </div>
          <input class="region-filter" type="search" data-direct-property-search value="${esc(state.directPropertySearch)}" placeholder="Filter direct properties..." />
        </div>
        ${renderSelectionToolbar("direct-properties", directKeys.size, directVisible, state.propertyOptions.length, "properties")}
        ${renderPropertyChecks(directKeys, state.directPropertySearch, "direct")}
        <div class="region-form-actions">
          <button class="primary-action" type="button" data-save-manager-access><span>Save Manager Access</span></button>
        </div>
      ` : `<div class="region-mini-empty">No property manager profiles found yet.</div>`}
    </section>
  `;
}

function renderManagerMatrix() {
  return `
    <section class="region-card region-directory-card">
      <div class="region-card-head">
        <div>
          <h2>Property Manager Directory</h2>
          <p>Quick view of primary properties, region assignments, and direct access.</p>
        </div>
      </div>
      <div class="region-manager-card-grid">
        ${state.managers.length ? state.managers.map((manager) => {
          const regions = Array.from(managerRegionIds(manager.id)).map((id) => regionById(id)?.name).filter(Boolean);
          return `
            <article class="region-manager-card">
              <div class="region-manager-card-top">
                <div class="region-manager-avatar">${esc(managerInitials(manager))}</div>
                <div>
                  <strong>${esc(managerName(manager))}</strong>
                  <small>${esc(manager.email || "No email saved")}</small>
                </div>
                <span class="region-pill">${esc(managerStatus(manager))}</span>
              </div>
              <dl>
                <div>
                  <dt>Primary</dt>
                  <dd>${esc(optionByPortalPropertyId(manager.property_manager_property_id)?.name || manager.requested_property_name || "Not set")}</dd>
                </div>
                <div>
                  <dt>Regions</dt>
                  <dd>${esc(regions.join(", ") || "None")}</dd>
                </div>
                <div>
                  <dt>Visible Access</dt>
                  <dd>${esc(managerPropertySummary(manager))}</dd>
                </div>
              </dl>
            </article>
          `;
        }).join("") : `<div class="region-mini-empty">No property manager profiles found.</div>`}
      </div>
    </section>
  `;
}

function renderPropertyManagerRows(option, region) {
  const rows = managersForProperty(option, region.id);
  const attachOptions = managerCheckboxOptions(option, region.id);
  return `
    <div class="region-property-manager-block">
      <div class="region-property-manager-list">
        ${rows.length ? rows.map(({ manager, source }) => `
          <div class="region-manager-chip">
            <span class="region-manager-avatar small">${esc(managerInitials(manager))}</span>
            <span>
              <strong>${esc(managerName(manager))}</strong>
              <small>${esc(source)} access${manager.email ? ` - ${manager.email}` : ""}</small>
            </span>
            ${source === "Direct" ? `<button class="secondary-action compact-action" type="button" data-remove-manager-property data-manager-id="${esc(manager.id)}" data-option-key="${esc(option.key)}">Remove</button>` : ""}
          </div>
        `).join("") : `<div class="region-mini-empty compact">No property managers are directly assigned to this property yet.</div>`}
      </div>
      <div class="region-manager-attach" data-property-manager-picker="${esc(option.key)}">
        <div class="region-section-head compact">
          <span>Attach Property Managers</span>
          <button class="primary-action compact-action" type="button" data-assign-property-manager data-option-key="${esc(option.key)}" ${attachOptions ? "" : "disabled"}><span>Attach Selected</span></button>
        </div>
        <div class="region-manager-option-grid">
          ${attachOptions || `<div class="region-mini-empty compact">Every property manager already has access to this property.</div>`}
        </div>
      </div>
    </div>
  `;
}

function renderRegionProperty(region, option) {
  const managerCount = managersForProperty(option, region.id).length;
  return `
    <details class="region-property-node">
      <summary>
        <span>
          <strong>${esc(option.name)}</strong>
          <small>${esc([option.address, option.sourceLabel].filter(Boolean).join(" - "))}</small>
        </span>
        <em>${esc(managerCount)} managers</em>
      </summary>
      <div class="region-property-body">
        <div class="region-inline-editor">
          <label>
            <span>Move to region</span>
            <select data-property-region-select="${esc(option.key)}">
              ${regionSelectOptions(region.id)}
            </select>
          </label>
          <button class="secondary-action" type="button" data-move-property-region data-option-key="${esc(option.key)}"><span>Move</span></button>
        </div>
        ${renderPropertyManagerRows(option, region)}
      </div>
    </details>
  `;
}

function renderRegionNode(region) {
  const properties = propertiesForRegion(region.id);
  const regionManagers = regionManagerCount(region.id);
  const regionState = regionStateName(region);
  return `
    <details class="region-region-node">
      <summary>
        <span>
          <strong>${esc(region.name)}</strong>
          <small>${esc(properties.length)} properties - ${esc(regionManagers)} region managers</small>
        </span>
        <em>${esc(displayStatus(region.status))}</em>
      </summary>
      <div class="region-region-body">
        <div class="region-inline-editor region-region-state-editor">
          <label>
            <span>Region State</span>
            <select data-region-state-select="${esc(region.id)}">
              ${stateOptionMarkup(regionState)}
            </select>
          </label>
          <button class="secondary-action" type="button" data-save-region-state="${esc(region.id)}"><span>Save State</span></button>
        </div>
        ${properties.length ? properties.map((option) => renderRegionProperty(region, option)).join("") : `
          <div class="region-mini-empty">No properties are assigned to this region yet. Use Property Region Assignment above to add one.</div>
        `}
      </div>
    </details>
  `;
}

function renderAccessTree() {
  const groups = stateGroups();
  return `
    <section class="region-card region-tree-card">
      <div class="region-card-head">
        <div>
          <h2>States, Regions, Properties</h2>
          <p>Open a state, then a region, then a property to manage property manager access.</p>
        </div>
      </div>
      <div class="region-state-list">
        ${groups.length ? groups.map((group) => {
          const propertyCount = group.regions.reduce((total, region) => total + propertiesForRegion(region.id).length, 0);
          return `
            <details class="region-state-node" open>
              <summary>
                <span>
                  <strong>${esc(stateDisplayLabel(group.stateName))}</strong>
                  <small>${esc(group.regions.length)} regions - ${esc(propertyCount)} properties</small>
                </span>
                <span class="region-node-actions">
                  <button class="secondary-action compact-action" type="button" data-add-region data-state-name="${esc(group.stateName)}">+ Region</button>
                  <button class="secondary-action compact-action danger-action" type="button" data-remove-state="${esc(group.stateName)}">Remove State</button>
                </span>
              </summary>
              <div class="region-state-body">
                ${group.regions.length ? group.regions.map(renderRegionNode).join("") : `<div class="region-mini-empty">No regions yet for this state.</div>`}
              </div>
            </details>
          `;
        }).join("") : `<div class="region-mini-empty">No states found from active contracts yet.</div>`}
      </div>
    </section>
  `;
}

function renderPropertyMovePanel() {
  const rows = unassignedProperties();
  return `
    <section class="region-card region-move-card">
      <div class="region-card-head">
        <div>
          <h2>Property Region Assignment</h2>
          <p>Assign unassigned active contract properties into the correct region.</p>
        </div>
      </div>
      <div class="region-assignment-row property-move-row">
        <span>
          <strong>Unassigned Properties</strong>
          <small>${esc(rows.length)} properties are not in a region.</small>
        </span>
        <select data-existing-property-select ${rows.length ? "" : "disabled"}>
          <option value="">${rows.length ? "Choose unassigned property..." : "No unassigned properties"}</option>
          ${unassignedPropertySelectOptions()}
        </select>
        <select data-existing-property-region ${rows.length ? "" : "disabled"}>
          <option value="">Choose region...</option>
          ${regionSelectOptions()}
        </select>
        <button class="primary-action" type="button" data-move-existing-property ${rows.length ? "" : "disabled"}><span>Add To Region</span></button>
      </div>
    </section>
  `;
}

function renderUnassignedManagersPanel() {
  const rows = unassignedManagers();
  return `
    <details class="region-card region-utility-panel" open>
      <summary>
        <span>
          <strong>Unassigned Property Managers</strong>
          <small>${esc(rows.length)} managers are not attached to a property or region</small>
        </span>
      </summary>
      <div class="region-utility-list">
        ${rows.length ? rows.map((manager) => `
          <div class="region-assignment-row">
            <span>
              <strong>${esc(managerName(manager))}</strong>
              <small>${esc([manager.email, manager.requested_property_name ? `Requested: ${manager.requested_property_name}` : ""].filter(Boolean).join(" - "))}</small>
            </span>
            <select data-unassigned-manager-property="${esc(manager.id)}">
              <option value="">Choose property...</option>
              ${propertySelectOptions()}
            </select>
            <button class="primary-action" type="button" data-assign-unassigned-manager data-manager-id="${esc(manager.id)}"><span>Assign Property</span></button>
          </div>
        `).join("") : `<div class="region-mini-empty">Every property manager already has property or region access.</div>`}
      </div>
    </details>
  `;
}

function renderAccessActions() {
  return `
    <section class="region-action-bar">
      <div>
        <strong>Access Structure</strong>
        <span>Manage states, regions, contract properties, and property managers from one list.</span>
      </div>
      <div>
        <button class="secondary-action" type="button" data-add-state><span>+ State</span></button>
        <button class="primary-action" type="button" data-add-region><span>+ Region</span></button>
      </div>
    </section>
  `;
}

function renderApp() {
  if (!root) return;
  if (!supabase) {
    root.innerHTML = `<section class="region-empty"><strong>Supabase config missing</strong><p>Add the portal environment values before using region access.</p></section>`;
    return;
  }
  if (state.loading) {
    root.innerHTML = renderLoading();
    return;
  }
  if (!state.profile || normalizeToken(state.profile.role) !== "admin") {
    root.innerHTML = renderAccessDenied();
    return;
  }
  const assignedPropertyKeys = allAssignedPropertyKeys();
  const unassignedProperties = state.propertyOptions.filter((option) => !assignedPropertyKeys.has(option.key)).length;
  root.innerHTML = `
    <section class="region-access-root">
      <section class="region-hero">
        <div>
          <p class="region-eyebrow">Access Control</p>
          <h2>States, Regions, Properties, and Managers</h2>
          <p>Manage active contract properties by state and region, then attach property managers to the exact property they should access.</p>
          <div class="region-workflow">
            <span class="region-workflow-step">1. Open state</span>
            <span class="region-workflow-step">2. Open region</span>
            <span class="region-workflow-step">3. Assign property managers</span>
          </div>
        </div>
        <div class="region-stat-grid">
          ${stat("Regions", state.regions.length, "managed groups")}
          ${stat("Properties", state.propertyOptions.length, "active records")}
          ${stat("Managers", state.managers.length, "property manager accounts")}
          ${stat("Unassigned", unassignedProperties, "not in a region")}
        </div>
      </section>
      ${renderMessage()}
      ${renderAccessActions()}
      <section class="region-main-stack">
        ${renderPropertyMovePanel()}
        ${renderAccessTree()}
        ${renderUnassignedManagersPanel()}
      </section>
    </section>
  `;
}

async function loadSession() {
  const { data: authData } = await supabase.auth.getUser();
  state.user = authData?.user || null;
  if (!state.user) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("id,role,full_name,email,status")
    .eq("id", state.user.id)
    .maybeSingle();
  if (error) throw error;
  state.profile = data || null;
  return state.profile;
}

async function loadTable(table, select = "*", options = {}) {
  let query = supabase.from(table).select(select);
  if (options.order) query = query.order(options.order, { ascending: options.ascending !== false });
  if (options.limit) query = query.limit(options.limit);
  const { data, error } = await query;
  if (error) throw new Error(`${table}: ${error.message}`);
  return data || [];
}

async function loadData() {
  if (!root || !supabase || state.loading) return;
  state.loading = true;
  renderApp();
  try {
    const profile = await loadSession();
    if (!profile || normalizeToken(profile.role) !== "admin") {
      state.loading = false;
      renderApp();
      return;
    }
    const [
      regions,
      regionLinks,
      managerRegionLinks,
      managerPropertyLinks,
      profiles,
      portalProperties,
      contracts
    ] = await Promise.all([
      loadTable("property_regions", "*", { order: "name", limit: 1000 }),
      loadTable("property_region_links", "*", { order: "created_at", limit: 5000 }),
      loadTable("property_manager_region_links", "*", { order: "created_at", limit: 5000 }),
      loadTable("property_manager_property_links", "*", { order: "created_at", limit: 5000 }),
      loadTable("profiles", "id,full_name,email,role,status,property_manager_property_id,requested_property_name,created_at", { order: "full_name", limit: 2000 }),
      loadTable("portal_properties", "*", { order: "property_name", limit: 2000 }),
      loadTable("client_contracts", "*", { order: "property_name", limit: 2000 })
    ]);
    const settingsRegion = regions.find(isStateSettingsRegion) || null;
    const settingsMeta = metadata(settingsRegion || {});
    state.stateSettingsRecordId = settingsRegion?.id || "";
    state.cityStateOverrides = settingsMeta.city_state_overrides || settingsMeta.city_state_map || {};
    state.hiddenStates = Array.isArray(settingsMeta.hidden_states)
      ? settingsMeta.hidden_states.map(cleanStateName)
      : [];
    state.regions = regions.filter((region) => !isStateSettingsRegion(region));
    state.regionLinks = regionLinks;
    state.managerRegionLinks = managerRegionLinks;
    state.managerPropertyLinks = managerPropertyLinks;
    state.managers = profiles.filter(isPropertyManager)
      .sort((a, b) => managerName(a).localeCompare(managerName(b), undefined, { sensitivity: "base" }));
    state.propertyOptions = contractPropertyOptions(portalProperties, contracts);
    if (!state.selectedRegionId || !regionById(state.selectedRegionId)) {
      state.selectedRegionId = state.regions[0]?.id || "";
    }
    if (!state.selectedManagerId || !managerById(state.selectedManagerId)) {
      state.selectedManagerId = state.managers[0]?.id || "";
    }
    resetPendingSelections();
    state.message = `Loaded ${state.regions.length} regions, ${state.propertyOptions.length} active contract properties, and ${state.managers.length} property managers.`;
    state.error = false;
  } catch (error) {
    console.error("[admin-regions] load failed", error);
    state.message = `Unable to load region access: ${error.message || "Unknown error"}.`;
    state.error = true;
  } finally {
    state.loading = false;
    renderApp();
  }
}

function selectedOptionRows(selector) {
  return Array.from(root.querySelectorAll(selector))
    .filter((input) => input.checked)
    .map((input) => optionByKey(input.dataset.optionKey))
    .filter(Boolean);
}

function optionRowsFromKeys(keys) {
  return Array.from(keys || []).map(optionByKey).filter(Boolean);
}

function managerRowsPayload(managerIds, regionId) {
  return managerIds.map((profileId) => ({
    profile_id: profileId,
    region_id: regionId,
    access_level: "manager",
    status: "active"
  }));
}

function propertyRowsPayload(options, extra = {}) {
  return options.map((option) => ({
    portal_property_id: option.portalPropertyId || null,
    contract_id: option.contractId || null,
    property_name: option.name,
    status: "active",
    metadata: {
      address: option.address,
      region: option.region,
      state: option.stateName,
      source_label: option.sourceLabel,
      ...extra
    }
  }));
}

async function saveStateSettings(overrides = state.cityStateOverrides, hiddenStates = state.hiddenStates) {
  const payload = {
    name: "State City Settings",
    status: "active",
    metadata: stateSettingsMetadata(overrides, hiddenStates)
  };
  let result;
  if (state.stateSettingsRecordId) {
    result = await supabase
      .from("property_regions")
      .update({ metadata: payload.metadata, status: "active" })
      .eq("id", state.stateSettingsRecordId);
  } else {
    result = await supabase
      .from("property_regions")
      .insert(payload)
      .select("id")
      .maybeSingle();
  }
  if (result.error) {
    setMessage(`Unable to save state settings: ${result.error.message}`, true);
    return false;
  }
  return true;
}

async function removeStateFromList(stateName) {
  const clean = cleanStateName(stateName);
  if (!clean || clean === "Unassigned State") return;
  if (!window.confirm(`Remove ${stateDisplayLabel(clean)} from the state list? Properties and regions in that state will be hidden from the state tree until their state is restored.`)) return;
  const nextHidden = unique([...(state.hiddenStates || []), clean]).map(cleanStateName);
  setMessage(`Removing ${stateDisplayLabel(clean)} from the state list...`);
  const saved = await saveStateSettings(state.cityStateOverrides, nextHidden);
  if (!saved) return;
  await loadData();
  setMessage(`${stateDisplayLabel(clean)} was removed from the visible state list.`);
}

async function saveCityState(city, targetState) {
  const cityKey = normalizeLookup(city);
  const cleanTarget = cleanStateName(targetState);
  if (!cityKey || !cleanTarget || cleanTarget === "Unassigned State") {
    setMessage("Choose a city and a valid state first.", true);
    return;
  }
  const nextOverrides = {
    ...(state.cityStateOverrides || {}),
    [cityKey]: cleanTarget
  };
  const nextHidden = (state.hiddenStates || []).map(cleanStateName).filter((item) => item !== cleanTarget);
  setMessage(`Assigning ${city} to ${cleanTarget}...`);
  const saved = await saveStateSettings(nextOverrides, nextHidden);
  if (!saved) return;
  await loadData();
  setMessage(`${city} is now assigned to ${cleanTarget}.`);
}

async function removeCityState(cityKey) {
  const key = normalizeLookup(cityKey);
  if (!key) return;
  const nextOverrides = { ...(state.cityStateOverrides || {}) };
  delete nextOverrides[key];
  setMessage("Removing city state mapping...");
  const saved = await saveStateSettings(nextOverrides, state.hiddenStates);
  if (!saved) return;
  await loadData();
  setMessage("City state mapping removed.");
}

async function updateRegionState(regionId, targetState) {
  const region = regionById(regionId);
  const cleanTarget = cleanStateName(targetState);
  if (!region || !cleanTarget || cleanTarget === "Unassigned State") {
    setMessage("Choose a valid region state first.", true);
    return;
  }
  const nextMetadata = {
    ...metadata(region),
    state: cleanTarget
  };
  setMessage(`Moving ${region.name} to ${stateDisplayLabel(cleanTarget)}...`);
  const { error } = await supabase
    .from("property_regions")
    .update({
      status: "active",
      metadata: nextMetadata
    })
    .eq("id", region.id);
  if (error) {
    setMessage(`Unable to update region state: ${error.message}`, true);
    return;
  }
  if (isHiddenState(cleanTarget)) {
    await saveStateSettings(
      state.cityStateOverrides,
      (state.hiddenStates || []).filter((item) => cleanStateName(item) !== cleanTarget)
    );
  }
  await loadData();
  setMessage(`${region.name} is now under ${stateDisplayLabel(cleanTarget)}.`);
}

function duplicateRegionNameError(error = {}) {
  return error.code === "23505" || /duplicate key|property_regions_name_key/i.test(error.message || "");
}

function existingRegionByName(name) {
  const target = normalizeLookup(name);
  return state.regions.find((region) => normalizeLookup(region.name) === target) || null;
}

async function findRegionByName(name) {
  const target = normalizeLookup(name);
  const { data, error } = await supabase
    .from("property_regions")
    .select("*")
    .ilike("name", String(name || "").trim())
    .limit(10);
  if (error) return { data: null, error };
  return {
    data: (data || []).find((region) => normalizeLookup(region.name) === target && !isStateSettingsRegion(region)) || null,
    error: null
  };
}

async function restoreExistingRegion(region, cleanState) {
  const nextMetadata = {
    ...metadata(region),
    state: cleanState
  };
  setMessage(`${region.name} already exists. Updating its state instead...`);
  const { error } = await supabase
    .from("property_regions")
    .update({
      status: "active",
      metadata: nextMetadata
    })
    .eq("id", region.id);
  if (error) {
    setMessage(`Unable to update existing region: ${error.message}`, true);
    return null;
  }
  if (isHiddenState(cleanState)) {
    await saveStateSettings(
      state.cityStateOverrides,
      (state.hiddenStates || []).filter((item) => cleanStateName(item) !== cleanState)
    );
  }
  state.selectedRegionId = region.id;
  await loadData();
  setMessage(`${region.name} already existed, so it was restored under ${cleanState}.`);
  return region;
}

async function addRegion(form) {
  const name = form.elements.name?.value?.trim() || "";
  if (!name) {
    setMessage("Enter a region name first.", true);
    return;
  }
  const stateName = window.prompt("State for this region:", stateGroups()[0]?.stateName || "NC");
  if (!stateName) return;
  await createRegion(name, stateName);
}

async function createRegion(name, stateName) {
  const cleanName = String(name || "").trim();
  const cleanState = cleanStateName(stateName);
  if (!cleanName) {
    setMessage("Enter a region name first.", true);
    return null;
  }
  if (!cleanState || cleanState === "Unassigned State") {
    setMessage("Choose a state before adding a region.", true);
    return null;
  }
  const existing = existingRegionByName(cleanName);
  if (existing) return restoreExistingRegion(existing, cleanState);

  setMessage("Adding region...");
  const { data, error } = await supabase
    .from("property_regions")
    .insert({
      name: cleanName,
      status: "active",
      metadata: { state: cleanState }
    })
    .select("*")
    .maybeSingle();
  if (error) {
    if (duplicateRegionNameError(error)) {
      const lookup = await findRegionByName(cleanName);
      if (lookup.data) return restoreExistingRegion(lookup.data, cleanState);
      setMessage(`A region named "${cleanName}" already exists. Region names must be unique, so use the existing region or choose a different name.`, true);
      return null;
    }
    setMessage(`Unable to add region: ${error.message}`, true);
    return null;
  }
  if (isHiddenState(cleanState)) {
    await saveStateSettings(
      state.cityStateOverrides,
      (state.hiddenStates || []).filter((item) => cleanStateName(item) !== cleanState)
    );
  }
  state.selectedRegionId = data?.id || state.selectedRegionId;
  await loadData();
  setMessage(`${cleanName} was added to ${cleanState}.`);
  return data;
}

async function addStateFromPrompt() {
  const stateName = window.prompt("State name or abbreviation:");
  if (!stateName) return;
  const regionName = window.prompt(`First region name for ${cleanStateName(stateName)}:`, `${cleanStateName(stateName)} Region`);
  if (!regionName) return;
  await createRegion(regionName, stateName);
}

async function addRegionFromPrompt(defaultStateName = "") {
  const fallbackState = cleanStateName(defaultStateName || stateGroups()[0]?.stateName || "NC");
  const stateName = window.prompt("State for this region:", fallbackState);
  if (!stateName) return;
  const regionName = window.prompt(`Region name for ${cleanStateName(stateName)}:`);
  if (!regionName) return;
  await createRegion(regionName, stateName);
}

async function saveRegion(form) {
  const id = form.elements.id?.value || state.selectedRegionId;
  const payload = {
    name: form.elements.name?.value?.trim() || "",
    status: form.elements.status?.value || "active",
    notes: form.elements.notes?.value?.trim() || ""
  };
  if (!payload.name) {
    setMessage("Region name cannot be blank.", true);
    return;
  }
  setMessage("Saving region...");
  const { error } = await supabase
    .from("property_regions")
    .update(payload)
    .eq("id", id);
  if (error) {
    setMessage(`Unable to save region: ${error.message}`, true);
    return;
  }
  await loadData();
  setMessage(`${payload.name} was saved.`);
}

async function archiveRegion(regionId) {
  const region = regionById(regionId);
  if (!region) return;
  setMessage("Archiving region...");
  const { error } = await supabase
    .from("property_regions")
    .update({ status: "archived" })
    .eq("id", regionId);
  if (error) {
    setMessage(`Unable to archive region: ${error.message}`, true);
    return;
  }
  await loadData();
  setMessage(`${region.name} was archived.`);
}

async function saveRegionProperties() {
  const regionId = state.selectedRegionId;
  if (!regionId) return;
  const options = optionRowsFromKeys(currentRegionPropertyKeys(regionId));
  setMessage("Saving region properties...");
  const deleteResult = await supabase
    .from("property_region_links")
    .delete()
    .eq("region_id", regionId);
  if (deleteResult.error) {
    setMessage(`Unable to clear old region properties: ${deleteResult.error.message}`, true);
    return;
  }
  if (options.length) {
    const rows = propertyRowsPayload(options, { assigned_from: "admin_regions_page" })
      .map((row) => ({ ...row, region_id: regionId }));
    const { error } = await supabase.from("property_region_links").insert(rows);
    if (error) {
      setMessage(`Unable to save region properties: ${error.message}`, true);
      return;
    }
  }
  await loadData();
  setMessage(`Saved ${options.length} properties/contracts for ${regionById(regionId)?.name || "this region"}.`);
}

async function saveRegionManagers() {
  const regionId = state.selectedRegionId;
  if (!regionId) return;
  const managerIds = Array.from(currentRegionManagerIds(regionId));
  setMessage("Saving region property managers...");
  const deleteResult = await supabase
    .from("property_manager_region_links")
    .delete()
    .eq("region_id", regionId);
  if (deleteResult.error) {
    setMessage(`Unable to clear old region managers: ${deleteResult.error.message}`, true);
    return;
  }
  if (managerIds.length) {
    const { error } = await supabase.from("property_manager_region_links").insert(managerRowsPayload(managerIds, regionId));
    if (error) {
      setMessage(`Unable to save region managers: ${error.message}`, true);
      return;
    }
    await syncPrimaryForManagers(managerIds, Array.from(regionPropertyKeys(regionId)), false);
  }
  await loadData();
  setMessage(`Saved ${managerIds.length} property managers for ${regionById(regionId)?.name || "this region"}.`);
}

async function saveManagerAccess() {
  const managerId = root.querySelector("[data-manager-selector]")?.value || state.selectedManagerId;
  if (!managerId) return;
  const options = optionRowsFromKeys(currentDirectPropertyKeys(managerId));
  const primaryKey = root.querySelector("[data-manager-primary-property]")?.value || "";
  setMessage("Saving manager access...");
  const deleteResult = await supabase
    .from("property_manager_property_links")
    .delete()
    .eq("profile_id", managerId);
  if (deleteResult.error) {
    setMessage(`Unable to clear old manager property access: ${deleteResult.error.message}`, true);
    return;
  }
  if (options.length) {
    const rows = propertyRowsPayload(options, { assigned_from: "admin_regions_page" })
      .map((row) => ({
        ...row,
        profile_id: managerId,
        access_level: "manager"
      }));
    const { error } = await supabase.from("property_manager_property_links").insert(rows);
    if (error) {
      setMessage(`Unable to save manager property access: ${error.message}`, true);
      return;
    }
  }
  const primaryOption = optionByKey(primaryKey) || options.find((option) => option.portalPropertyId) || null;
  if (primaryOption?.portalPropertyId) {
    await updateManagerPrimaryProperty(managerId, primaryOption, true);
  }
  state.selectedManagerId = managerId;
  await loadData();
  setMessage(`Saved access for ${managerName(managerById(managerId) || {})}.`);
}

async function deleteLinksForOption(table, option, extraFilters = {}) {
  if (!option) return { error: null };
  const knownRows = table === "property_region_links"
    ? state.regionLinks
    : table === "property_manager_property_links"
      ? state.managerPropertyLinks
      : [];
  const matchingIds = knownRows
    .filter((link) => Object.entries(extraFilters).every(([filterColumn, filterValue]) => String(link[filterColumn] || "") === String(filterValue)))
    .filter((link) => linkMatchesOption(link, option))
    .map((link) => link.id)
    .filter(Boolean);
  if (matchingIds.length) {
    const { error } = await supabase.from(table).delete().in("id", matchingIds);
    if (error) return { error };
  }
  const filters = [
    option.contractId ? ["contract_id", option.contractId] : null,
    option.portalPropertyId ? ["portal_property_id", option.portalPropertyId] : null,
    option.name ? ["property_name", option.name] : null
  ].filter(Boolean);
  const seen = new Set();
  for (const [column, value] of filters) {
    const key = `${column}:${value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    let query = supabase.from(table).delete();
    Object.entries(extraFilters).forEach(([filterColumn, filterValue]) => {
      query = query.eq(filterColumn, filterValue);
    });
    const { error } = await query.eq(column, value);
    if (error) return { error };
  }
  return { error: null };
}

async function deletePropertyRegionLinksForOption(option) {
  return deleteLinksForOption("property_region_links", option);
}

async function assignPropertyToRegion(optionKey, regionId) {
  const option = optionByKey(optionKey);
  const region = regionById(regionId);
  if (!option || !region) {
    setMessage("Choose a property and region first.", true);
    return;
  }
  setMessage(`Adding ${option.name} to ${region.name}...`);
  const deleteResult = await deletePropertyRegionLinksForOption(option);
  if (deleteResult.error) {
    setMessage(`Unable to move property: ${deleteResult.error.message}`, true);
    return;
  }
  const row = propertyRowsPayload([option], { assigned_from: "admin_regions_tree" })
    .map((payload) => ({ ...payload, region_id: region.id }))[0];
  const { error } = await supabase.from("property_region_links").insert(row);
  if (error) {
    setMessage(`Unable to add property to region: ${error.message}`, true);
    return;
  }
  await loadData();
  setMessage(`${option.name} is now in ${region.name}.`);
}

async function deleteManagerPropertyLink(managerId, option) {
  if (!managerId || !option) return { error: null };
  return deleteLinksForOption("property_manager_property_links", option, { profile_id: managerId });
}

async function assignManagerToProperty(managerId, optionKey) {
  return assignManagersToProperty([managerId], optionKey);
}

async function assignManagersToProperty(managerIds = [], optionKey) {
  const option = optionByKey(optionKey);
  const selectedManagers = unique(managerIds)
    .map((id) => managerById(id))
    .filter(Boolean);
  if (!selectedManagers.length || !option) {
    setMessage("Choose at least one property manager and a property first.", true);
    return;
  }
  setMessage(`Assigning ${selectedManagers.length} property manager${selectedManagers.length === 1 ? "" : "s"} to ${option.name}...`);
  for (const selectedManager of selectedManagers) {
    const deleteResult = await deleteManagerPropertyLink(selectedManager.id, option);
    if (deleteResult.error) {
      setMessage(`Unable to clear old property manager access: ${deleteResult.error.message}`, true);
      return;
    }
  }
  const baseRow = propertyRowsPayload([option], { assigned_from: "admin_regions_tree" })[0];
  const rows = selectedManagers.map((selectedManager) => ({
    ...baseRow,
    profile_id: selectedManager.id,
    access_level: "manager"
  }));
  const { error } = await supabase.from("property_manager_property_links").insert(rows);
  if (error) {
    setMessage(`Unable to assign property manager: ${error.message}`, true);
    return;
  }
  if (option.portalPropertyId) {
    for (const selectedManager of selectedManagers) {
      await updateManagerPrimaryProperty(selectedManager.id, option, false);
    }
  }
  await loadData();
  setMessage(`${selectedManagers.length} property manager${selectedManagers.length === 1 ? "" : "s"} can now access ${option.name}.`);
}

async function removeManagerFromProperty(managerId, optionKey) {
  const manager = managerById(managerId);
  const option = optionByKey(optionKey);
  if (!manager || !option) return;
  setMessage(`Removing ${managerName(manager)} from ${option.name}...`);
  const { error } = await deleteManagerPropertyLink(manager.id, option);
  if (error) {
    setMessage(`Unable to remove property manager: ${error.message}`, true);
    return;
  }
  await loadData();
  setMessage(`${managerName(manager)} was removed from ${option.name}.`);
}

async function updateManagerPrimaryProperty(managerId, option, force = false) {
  if (!managerId || !option?.portalPropertyId) return;
  const manager = managerById(managerId);
  if (!force && manager?.property_manager_property_id) return;
  const { error } = await supabase
    .from("profiles")
    .update({
      property_manager_property_id: option.portalPropertyId,
      requested_property_name: option.name,
      role: "property_manager",
      status: manager?.status || "active"
    })
    .eq("id", managerId);
  if (error) throw new Error(`Unable to update primary property: ${error.message}`);
}

async function syncPrimaryForManagers(managerIds = [], propertyKeys = [], force = false) {
  const option = propertyKeys.map(optionByKey).find((item) => item?.portalPropertyId);
  if (!option) return;
  for (const managerId of managerIds) {
    await updateManagerPrimaryProperty(managerId, option, force);
  }
}

function updateSearchValue(target) {
  if (target.matches("[data-region-property-search]")) {
    state.propertySearch = target.value || "";
  } else if (target.matches("[data-region-manager-search]")) {
    state.managerSearch = target.value || "";
  } else if (target.matches("[data-direct-property-search]")) {
    state.directPropertySearch = target.value || "";
  }
  renderApp();
  const next = root.querySelector(`[${target.getAttributeNames().find((name) => name.startsWith("data-"))}]`);
  next?.focus();
}

function applyBulkSelection(kind, action) {
  const shouldSelect = action === "select";
  if (kind === "region-properties") {
    if (!(state.pendingRegionPropertyKeys instanceof Set)) {
      state.pendingRegionPropertyKeys = currentRegionPropertyKeys();
    }
    visiblePropertyOptions(state.propertySearch).forEach((option) => {
      if (shouldSelect) state.pendingRegionPropertyKeys.add(option.key);
      else state.pendingRegionPropertyKeys.delete(option.key);
    });
  } else if (kind === "region-managers") {
    if (!(state.pendingRegionManagerIds instanceof Set)) {
      state.pendingRegionManagerIds = currentRegionManagerIds();
    }
    visibleManagers(state.managerSearch).forEach((manager) => {
      const id = String(manager.id);
      if (shouldSelect) state.pendingRegionManagerIds.add(id);
      else state.pendingRegionManagerIds.delete(id);
    });
  } else if (kind === "direct-properties") {
    const managerId = state.selectedManagerId;
    if (!managerId) return;
    if (!(state.pendingDirectPropertyKeysByManager[managerId] instanceof Set)) {
      state.pendingDirectPropertyKeysByManager[managerId] = currentDirectPropertyKeys(managerId);
    }
    visiblePropertyOptions(state.directPropertySearch).forEach((option) => {
      if (shouldSelect) state.pendingDirectPropertyKeysByManager[managerId].add(option.key);
      else state.pendingDirectPropertyKeysByManager[managerId].delete(option.key);
    });
  }
  renderApp();
}

function installHandlers() {
  root.addEventListener("submit", async (event) => {
    const form = event.target;
    if (form.matches("[data-region-add-form]")) {
      event.preventDefault();
      await addRegion(form);
    }
    if (form.matches("[data-region-detail-form]")) {
      event.preventDefault();
      await saveRegion(form);
    }
  });

  root.addEventListener("click", async (event) => {
    const addState = event.target.closest("[data-add-state]");
    if (addState) {
      event.preventDefault();
      await addStateFromPrompt();
      return;
    }
    const addRegion = event.target.closest("[data-add-region]");
    if (addRegion) {
      event.preventDefault();
      await addRegionFromPrompt(addRegion.dataset.stateName || "");
      return;
    }
    const removeState = event.target.closest("[data-remove-state]");
    if (removeState) {
      event.preventDefault();
      await removeStateFromList(removeState.dataset.removeState || "");
      return;
    }
    const saveRegionState = event.target.closest("[data-save-region-state]");
    if (saveRegionState) {
      const regionId = saveRegionState.dataset.saveRegionState || "";
      const select = Array.from(root.querySelectorAll("[data-region-state-select]"))
        .find((node) => node.dataset.regionStateSelect === regionId);
      await updateRegionState(regionId, select?.value || "");
      return;
    }
    const moveExistingProperty = event.target.closest("[data-move-existing-property]");
    if (moveExistingProperty) {
      const propertySelect = root.querySelector("[data-existing-property-select]");
      const regionSelect = root.querySelector("[data-existing-property-region]");
      await assignPropertyToRegion(propertySelect?.value || "", regionSelect?.value || "");
      return;
    }
    const moveProperty = event.target.closest("[data-move-property-region]");
    if (moveProperty) {
      const optionKey = moveProperty.dataset.optionKey || "";
      const select = Array.from(root.querySelectorAll("[data-property-region-select]"))
        .find((node) => node.dataset.propertyRegionSelect === optionKey);
      await assignPropertyToRegion(optionKey, select?.value || "");
      return;
    }
    const assignPropertyManager = event.target.closest("[data-assign-property-manager]");
    if (assignPropertyManager) {
      const optionKey = assignPropertyManager.dataset.optionKey || "";
      const picker = Array.from(root.querySelectorAll("[data-property-manager-picker]"))
        .find((node) => node.dataset.propertyManagerPicker === optionKey);
      const managerIds = Array.from(picker?.querySelectorAll("[data-property-manager-pick]:checked") || [])
        .map((node) => node.value)
        .filter(Boolean);
      await assignManagersToProperty(managerIds, optionKey);
      return;
    }
    const assignUnassignedManager = event.target.closest("[data-assign-unassigned-manager]");
    if (assignUnassignedManager) {
      const managerId = assignUnassignedManager.dataset.managerId || "";
      const select = Array.from(root.querySelectorAll("[data-unassigned-manager-property]"))
        .find((node) => node.dataset.unassignedManagerProperty === managerId);
      await assignManagerToProperty(managerId, select?.value || "");
      return;
    }
    const removeManagerProperty = event.target.closest("[data-remove-manager-property]");
    if (removeManagerProperty) {
      await removeManagerFromProperty(removeManagerProperty.dataset.managerId || "", removeManagerProperty.dataset.optionKey || "");
      return;
    }
    const selectRegion = event.target.closest("[data-region-select]");
    if (selectRegion) {
      state.selectedRegionId = selectRegion.dataset.regionSelect;
      state.pendingRegionPropertyKeys = null;
      state.pendingRegionManagerIds = null;
      renderApp();
      return;
    }
    const archive = event.target.closest("[data-region-archive]");
    if (archive) {
      await archiveRegion(archive.dataset.regionArchive);
      return;
    }
    const bulk = event.target.closest("[data-bulk-select]");
    if (bulk) {
      applyBulkSelection(bulk.dataset.bulkSelect, bulk.dataset.bulkAction || "select");
      return;
    }
    if (event.target.closest("[data-save-region-properties]")) {
      await saveRegionProperties();
      return;
    }
    if (event.target.closest("[data-save-region-managers]")) {
      await saveRegionManagers();
      return;
    }
    if (event.target.closest("[data-save-manager-access]")) {
      await saveManagerAccess();
    }
  });

  root.addEventListener("change", (event) => {
    if (event.target.matches("[data-manager-selector]")) {
      state.selectedManagerId = event.target.value || "";
      renderApp();
    }
    if (event.target.matches("[data-region-property]")) {
      if (!(state.pendingRegionPropertyKeys instanceof Set)) {
        state.pendingRegionPropertyKeys = regionPropertyKeys();
      }
      if (event.target.checked) state.pendingRegionPropertyKeys.add(event.target.dataset.optionKey);
      else state.pendingRegionPropertyKeys.delete(event.target.dataset.optionKey);
    }
    if (event.target.matches("[data-region-manager]")) {
      if (!(state.pendingRegionManagerIds instanceof Set)) {
        state.pendingRegionManagerIds = new Set(regionManagerLinks().map((link) => String(link.profile_id)));
      }
      if (event.target.checked) state.pendingRegionManagerIds.add(event.target.value);
      else state.pendingRegionManagerIds.delete(event.target.value);
    }
    if (event.target.matches("[data-direct-property]")) {
      const managerId = state.selectedManagerId;
      if (!managerId) return;
      if (!(state.pendingDirectPropertyKeysByManager[managerId] instanceof Set)) {
        state.pendingDirectPropertyKeysByManager[managerId] = managerDirectPropertyKeys(managerId);
      }
      if (event.target.checked) state.pendingDirectPropertyKeysByManager[managerId].add(event.target.dataset.optionKey);
      else state.pendingDirectPropertyKeysByManager[managerId].delete(event.target.dataset.optionKey);
    }
  });

  root.addEventListener("input", (event) => {
    if (event.target.matches("[data-region-property-search], [data-region-manager-search], [data-direct-property-search]")) {
      updateSearchValue(event.target);
    }
  });
}

function injectStyles() {
  if (document.getElementById("regionAccessStyles")) return;
  const style = document.createElement("style");
  style.id = "regionAccessStyles";
  style.textContent = `
    .region-access-root {
      display: grid;
      gap: 14px;
    }

    .region-hero,
    .region-card,
    .region-empty {
      background: var(--suite-panel);
      border: 1px solid var(--suite-border);
      border-radius: var(--suite-radius);
      box-shadow: var(--suite-shadow);
    }

    .region-hero {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(420px, 0.95fr);
      gap: 18px;
      align-items: center;
      padding: 22px;
    }

    .region-eyebrow {
      color: var(--suite-green);
      font-size: 0.76rem;
      font-weight: 800;
      margin: 0 0 8px;
      text-transform: uppercase;
    }

    .region-hero h2,
    .region-card h2,
    .region-card h3 {
      margin: 0;
    }

    .region-hero h2 {
      font-size: clamp(1.55rem, 2vw, 2.25rem);
    }

    .region-hero p,
    .region-card p,
    .region-card small,
    .region-message {
      color: var(--suite-soft);
    }

    .region-stat-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
    }

    .region-stat {
      background: rgba(5, 16, 28, 0.58);
      border: 1px solid var(--suite-border-soft);
      border-radius: 8px;
      display: grid;
      gap: 4px;
      padding: 12px;
    }

    .region-stat span,
    .region-stat small {
      color: var(--suite-muted);
      font-size: 0.78rem;
    }

    .region-stat strong {
      font-size: 1.55rem;
    }

    .region-workflow {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 16px;
    }

    .region-workflow-step {
      background: rgba(0, 214, 163, 0.1);
      border: 1px solid rgba(0, 214, 163, 0.24);
      border-radius: 999px;
      color: var(--suite-green);
      font-size: 0.78rem;
      font-weight: 800;
      padding: 7px 10px;
    }

    .region-layout {
      display: grid;
      grid-template-columns: 340px minmax(0, 1fr);
      gap: 14px;
      align-items: start;
    }

    .region-sidebar-stack {
      display: grid;
      gap: 14px;
      position: sticky;
      top: 76px;
    }

    .region-main-stack {
      display: grid;
      gap: 14px;
    }

    .region-card {
      padding: 16px;
    }

    .region-card-head,
    .region-section-head,
    .region-form-actions {
      align-items: center;
      display: flex;
      gap: 12px;
      justify-content: space-between;
    }

    .region-card-head p,
    .region-section-head p {
      margin: 5px 0 0;
    }

    .region-summary-row {
      display: grid;
      gap: 10px;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      margin-top: 14px;
    }

    .region-summary-row div,
    .region-settings,
    .region-assignment-grid .region-subsection,
    .region-access-preview,
    .region-manager-card,
    .region-property-preview {
      background: rgba(5, 16, 28, 0.42);
      border: 1px solid var(--suite-border-soft);
      border-radius: 10px;
    }

    .region-summary-row div {
      display: grid;
      gap: 4px;
      min-width: 0;
      padding: 12px;
    }

    .region-summary-row span,
    .region-access-preview span,
    .region-manager-card dt {
      color: var(--suite-muted);
      font-size: 0.72rem;
      font-weight: 800;
      text-transform: uppercase;
    }

    .region-summary-row strong {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .region-settings {
      margin-top: 14px;
      padding: 0;
    }

    .region-settings summary {
      align-items: center;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      list-style: none;
      padding: 13px 14px;
    }

    .region-settings summary::-webkit-details-marker {
      display: none;
    }

    .region-settings summary span {
      font-weight: 800;
    }

    .region-settings summary small {
      text-align: right;
    }

    .region-settings .region-form-grid {
      border-top: 1px solid var(--suite-border-soft);
      margin-top: 0;
      padding: 14px;
    }

    .region-assignment-grid {
      display: grid;
      gap: 12px;
      grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
      margin-top: 14px;
    }

    .region-assignment-grid .region-subsection {
      border-top: 1px solid var(--suite-border-soft);
      margin-top: 0;
      padding: 14px;
    }

    .region-selection-toolbar {
      align-items: center;
      background: rgba(0, 214, 163, 0.08);
      border: 1px solid rgba(0, 214, 163, 0.2);
      border-radius: 9px;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: space-between;
      padding: 9px 10px;
    }

    .region-selection-toolbar > span {
      color: var(--suite-text);
      font-weight: 800;
    }

    .region-selection-toolbar > div {
      display: flex;
      gap: 6px;
    }

    .compact-action {
      min-height: 32px;
      padding: 7px 10px;
    }

    .danger-action {
      border-color: rgba(255, 92, 122, 0.38);
      color: #ff8ba1;
    }

    .region-action-bar {
      align-items: center;
      background: var(--suite-panel);
      border: 1px solid var(--suite-border);
      border-radius: var(--suite-radius);
      box-shadow: var(--suite-shadow);
      display: flex;
      gap: 14px;
      justify-content: space-between;
      padding: 14px 16px;
    }

    .region-action-bar > div {
      display: grid;
      gap: 4px;
    }

    .region-action-bar > div:last-child {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: flex-end;
    }

    .region-action-bar span {
      color: var(--suite-soft);
    }

    .region-node-actions {
      align-items: center;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: flex-end;
    }

    .region-state-node > summary > .region-node-actions {
      display: flex;
    }

    .region-state-list,
    .region-state-body,
    .region-region-body,
    .region-utility-list,
    .region-property-manager-list {
      display: grid;
      gap: 10px;
    }

    .region-state-list {
      margin-top: 14px;
    }

    .region-state-node,
    .region-region-node,
    .region-property-node,
    .region-utility-panel {
      background: rgba(5, 16, 28, 0.34);
      border: 1px solid var(--suite-border-soft);
      border-radius: 10px;
      overflow: hidden;
    }

    .region-state-node > summary,
    .region-region-node > summary,
    .region-property-node > summary,
    .region-utility-panel > summary {
      align-items: center;
      cursor: pointer;
      display: flex;
      gap: 12px;
      justify-content: space-between;
      list-style: none;
      padding: 13px 14px;
    }

    .region-state-node > summary::-webkit-details-marker,
    .region-region-node > summary::-webkit-details-marker,
    .region-property-node > summary::-webkit-details-marker,
    .region-utility-panel > summary::-webkit-details-marker {
      display: none;
    }

    .region-state-node > summary > span,
    .region-region-node > summary > span,
    .region-property-node > summary > span,
    .region-utility-panel > summary > span,
    .region-assignment-row > span,
    .region-manager-chip > span:last-of-type {
      display: grid;
      gap: 4px;
      min-width: 0;
    }

    .region-state-node > summary {
      background: rgba(0, 214, 163, 0.09);
      border-bottom: 1px solid var(--suite-border-soft);
    }

    .region-state-node:not([open]) > summary,
    .region-region-node:not([open]) > summary,
    .region-property-node:not([open]) > summary,
    .region-utility-panel:not([open]) > summary {
      border-bottom: 0;
    }

    .region-state-body {
      padding: 12px;
    }

    .region-region-node {
      background: rgba(5, 16, 28, 0.5);
    }

    .region-region-body {
      border-top: 1px solid var(--suite-border-soft);
      padding: 12px;
    }

    .region-property-node {
      background: rgba(5, 16, 28, 0.44);
    }

    .region-property-node summary em,
    .region-region-node summary em {
      background: rgba(0, 214, 163, 0.1);
      border: 1px solid rgba(0, 214, 163, 0.24);
      border-radius: 999px;
      color: var(--suite-green);
      font-size: 0.74rem;
      font-style: normal;
      font-weight: 800;
      padding: 5px 8px;
      white-space: nowrap;
    }

    .region-property-body {
      border-top: 1px solid var(--suite-border-soft);
      display: grid;
      gap: 12px;
      padding: 12px;
    }

    .region-property-manager-block {
      display: grid;
      gap: 12px;
    }

    .region-manager-chip {
      align-items: center;
      background: rgba(5, 16, 28, 0.5);
      border: 1px solid var(--suite-border-soft);
      border-radius: 9px;
      display: grid;
      gap: 10px;
      grid-template-columns: auto minmax(0, 1fr) auto;
      padding: 10px;
    }

    .region-manager-avatar.small {
      font-size: 0.68rem;
      height: 30px;
      width: 30px;
    }

    .region-manager-attach {
      background: rgba(5, 16, 28, 0.4);
      border: 1px solid var(--suite-border-soft);
      border-radius: 9px;
      display: grid;
      gap: 10px;
      padding: 10px;
    }

    .region-section-head.compact > span {
      color: var(--suite-soft);
      font-size: 0.74rem;
      font-weight: 800;
      text-transform: uppercase;
    }

    .region-manager-option-grid {
      display: grid;
      gap: 8px;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      max-height: 240px;
      overflow: auto;
    }

    .region-manager-option {
      align-items: center;
      background: rgba(5, 16, 28, 0.5);
      border: 1px solid var(--suite-border-soft);
      border-radius: 8px;
      cursor: pointer;
      display: grid;
      gap: 9px;
      grid-template-columns: auto minmax(0, 1fr);
      padding: 9px 10px;
    }

    .region-manager-option input {
      accent-color: var(--suite-green);
      height: 16px;
      width: 16px;
    }

    .region-manager-option span {
      display: grid;
      gap: 2px;
      min-width: 0;
    }

    .region-manager-option strong,
    .region-manager-option small {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .region-inline-editor,
    .region-assignment-row {
      align-items: end;
      display: grid;
      gap: 10px;
      grid-template-columns: minmax(0, 1fr) auto;
    }

    .region-inline-editor label,
    .region-assignment-row label {
      display: grid;
      gap: 6px;
    }

    .region-inline-editor span,
    .region-assignment-row label span {
      color: var(--suite-soft);
      font-size: 0.74rem;
      font-weight: 800;
      text-transform: uppercase;
    }

    .region-inline-editor select,
    .region-assignment-row select {
      background: rgba(5, 16, 28, 0.72);
      border: 1px solid var(--suite-border);
      border-radius: 8px;
      color: var(--suite-text);
      min-height: 40px;
      padding: 9px 11px;
      width: 100%;
    }

    .region-utility-panel {
      padding: 0;
    }

    .region-utility-panel > summary {
      padding: 16px;
    }

    .region-utility-list {
      border-top: 1px solid var(--suite-border-soft);
      max-height: 520px;
      overflow: auto;
      padding: 12px;
    }

    .region-assignment-row {
      background: rgba(5, 16, 28, 0.42);
      border: 1px solid var(--suite-border-soft);
      border-radius: 9px;
      grid-template-columns: minmax(220px, 1fr) minmax(220px, 0.8fr) auto;
      padding: 10px;
    }

    .property-move-row {
      grid-template-columns: minmax(220px, 1fr) minmax(220px, 0.9fr) minmax(220px, 0.9fr) auto;
    }

    .region-region-state-editor {
      border-bottom: 1px solid var(--suite-border-soft);
      margin-bottom: 2px;
      padding-bottom: 12px;
    }

    .region-mini-empty.compact {
      padding: 10px;
    }

    .region-message {
      margin: 0;
      min-height: 20px;
    }

    .region-message.is-error {
      color: var(--suite-red);
    }

    .region-add-form,
    .region-form-grid,
    .region-manager-toolbar {
      display: grid;
      gap: 10px;
    }

    .region-add-form {
      grid-template-columns: minmax(0, 1fr) auto;
      margin: 14px 0;
    }

    .region-form-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      margin-top: 14px;
    }

    .region-manager-toolbar {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      margin-top: 14px;
    }

    .region-field,
    .region-field span {
      display: grid;
      gap: 6px;
    }

    .region-field span {
      color: var(--suite-soft);
      font-size: 0.76rem;
      font-weight: 800;
      text-transform: uppercase;
    }

    .region-field input,
    .region-field select,
    .region-field textarea,
    .region-filter {
      background: rgba(5, 16, 28, 0.72);
      border: 1px solid var(--suite-border);
      border-radius: 8px;
      color: var(--suite-text);
      min-height: 40px;
      padding: 9px 11px;
      width: 100%;
    }

    .region-field-wide,
    .region-form-actions {
      grid-column: 1 / -1;
    }

    .region-list {
      display: grid;
      gap: 8px;
      max-height: 430px;
      overflow: auto;
      padding-right: 3px;
    }

    .region-unassigned-list {
      display: grid;
      gap: 8px;
      margin-top: 12px;
    }

    .region-list-item,
    .region-check,
    .region-selected-summary {
      background: rgba(5, 16, 28, 0.42);
      border: 1px solid var(--suite-border-soft);
      border-radius: 8px;
      color: inherit;
    }

    .region-list-item {
      align-items: center;
      display: flex;
      justify-content: space-between;
      gap: 10px;
      padding: 12px;
      text-align: left;
      width: 100%;
    }

    .region-list-item.active,
    .region-list-item:hover {
      border-color: rgba(0, 214, 163, 0.62);
      background: rgba(0, 214, 163, 0.11);
    }

    .region-list-item span,
    .region-check span,
    .region-property-preview,
    .region-table td strong,
    .region-table td small {
      display: grid;
      gap: 4px;
      min-width: 0;
    }

    .region-list-item small,
    .region-check small,
    .region-property-preview small,
    .region-table small {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .region-property-preview {
      padding: 10px;
    }

    .region-list-item em,
    .region-pill {
      background: rgba(0, 214, 163, 0.12);
      border: 1px solid rgba(0, 214, 163, 0.3);
      border-radius: 999px;
      color: var(--suite-green);
      font-size: 0.72rem;
      font-style: normal;
      font-weight: 800;
      padding: 5px 8px;
      text-transform: uppercase;
      white-space: nowrap;
    }

    .region-pill.neutral {
      background: rgba(125, 150, 176, 0.14);
      border-color: rgba(125, 150, 176, 0.28);
      color: var(--suite-soft);
    }

    .region-subsection {
      border-top: 1px solid var(--suite-border-soft);
      display: grid;
      gap: 12px;
      margin-top: 16px;
      padding-top: 16px;
    }

    .region-section-head {
      align-items: end;
    }

    .region-filter {
      max-width: 260px;
    }

    .region-check-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
      max-height: 430px;
      overflow: auto;
      padding-right: 3px;
    }

    .region-assignment-grid .region-check-grid {
      grid-template-columns: 1fr;
      max-height: 365px;
    }

    .manager-check-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .region-check {
      align-items: start;
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: 10px;
      padding: 11px;
    }

    .region-check input {
      margin-top: 3px;
    }

    .region-selected-summary {
      align-items: center;
      display: flex;
      gap: 5px;
      margin: 12px 0;
      padding: 12px;
    }

    .region-selected-summary > div:last-child {
      display: grid;
      gap: 4px;
      min-width: 0;
    }

    .region-selected-summary span {
      color: var(--suite-soft);
    }

    .region-manager-avatar {
      align-items: center;
      background: linear-gradient(135deg, rgba(0, 214, 163, 0.95), rgba(44, 166, 255, 0.78));
      border-radius: 999px;
      color: #061321;
      display: inline-flex;
      flex: 0 0 auto;
      font-size: 0.78rem;
      font-weight: 900;
      height: 38px;
      justify-content: center;
      width: 38px;
    }

    .region-secondary-grid {
      display: grid;
      gap: 12px;
      grid-template-columns: minmax(0, 1.4fr) minmax(240px, 0.6fr);
      margin-top: 14px;
    }

    .region-secondary-grid .region-selected-summary {
      margin-bottom: 0;
    }

    .region-access-preview {
      display: grid;
      gap: 8px;
      padding: 13px;
    }

    .region-access-preview strong {
      color: var(--suite-text);
      line-height: 1.45;
    }

    .region-manager-card-grid {
      display: grid;
      gap: 10px;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      margin-top: 12px;
    }

    .region-manager-card {
      display: grid;
      gap: 12px;
      padding: 13px;
    }

    .region-manager-card-top {
      align-items: center;
      display: grid;
      gap: 10px;
      grid-template-columns: auto minmax(0, 1fr) auto;
    }

    .region-manager-card-top > div:nth-child(2) {
      display: grid;
      gap: 3px;
      min-width: 0;
    }

    .region-manager-card small,
    .region-manager-card dd {
      color: var(--suite-soft);
    }

    .region-manager-card dl {
      display: grid;
      gap: 9px;
      margin: 0;
    }

    .region-manager-card dl div {
      display: grid;
      gap: 3px;
      min-width: 0;
    }

    .region-manager-card dd {
      margin: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .region-table-wrap {
      overflow-x: auto;
      margin-top: 12px;
    }

    .region-table {
      border-collapse: collapse;
      min-width: 860px;
      width: 100%;
    }

    .region-table th,
    .region-table td {
      border-bottom: 1px solid var(--suite-border-soft);
      padding: 11px 9px;
      text-align: left;
      vertical-align: top;
    }

    .region-table th {
      color: var(--suite-muted);
      font-size: 0.75rem;
      text-transform: uppercase;
    }

    .region-mini-empty,
    .region-empty {
      color: var(--suite-soft);
      padding: 18px;
    }

    body.turnly-admin-suite[data-dashboard-theme="light"] .region-hero,
    body.turnly-admin-suite[data-dashboard-theme="light"] .region-card,
    body.turnly-admin-suite[data-dashboard-theme="light"] .region-empty,
    body.turnly-admin-suite[data-dashboard-theme="light"] .region-action-bar {
      background: #ffffff;
      border-color: #d6e0ea;
      color: #061321;
    }

    body.turnly-admin-suite[data-dashboard-theme="light"] .region-stat,
    body.turnly-admin-suite[data-dashboard-theme="light"] .region-list-item,
    body.turnly-admin-suite[data-dashboard-theme="light"] .region-check,
    body.turnly-admin-suite[data-dashboard-theme="light"] .region-selected-summary,
    body.turnly-admin-suite[data-dashboard-theme="light"] .region-workflow-step,
    body.turnly-admin-suite[data-dashboard-theme="light"] .region-summary-row div,
    body.turnly-admin-suite[data-dashboard-theme="light"] .region-settings,
    body.turnly-admin-suite[data-dashboard-theme="light"] .region-assignment-grid .region-subsection,
    body.turnly-admin-suite[data-dashboard-theme="light"] .region-access-preview,
    body.turnly-admin-suite[data-dashboard-theme="light"] .region-manager-card,
    body.turnly-admin-suite[data-dashboard-theme="light"] .region-property-preview,
    body.turnly-admin-suite[data-dashboard-theme="light"] .region-state-node,
    body.turnly-admin-suite[data-dashboard-theme="light"] .region-region-node,
    body.turnly-admin-suite[data-dashboard-theme="light"] .region-property-node,
    body.turnly-admin-suite[data-dashboard-theme="light"] .region-manager-chip,
    body.turnly-admin-suite[data-dashboard-theme="light"] .region-manager-attach,
    body.turnly-admin-suite[data-dashboard-theme="light"] .region-manager-option,
    body.turnly-admin-suite[data-dashboard-theme="light"] .region-assignment-row,
    body.turnly-admin-suite[data-dashboard-theme="light"] .region-utility-panel {
      background: #f7fafc;
      border-color: #d6e0ea;
    }

    body.turnly-admin-suite[data-dashboard-theme="light"] .region-state-node > summary {
      background: #ecfdf7;
      border-color: #b8f1dd;
    }

    body.turnly-admin-suite[data-dashboard-theme="light"] .region-selection-toolbar {
      background: #ecfdf7;
      border-color: #b8f1dd;
    }

    body.turnly-admin-suite[data-dashboard-theme="light"] .region-field input,
    body.turnly-admin-suite[data-dashboard-theme="light"] .region-field select,
    body.turnly-admin-suite[data-dashboard-theme="light"] .region-field textarea,
    body.turnly-admin-suite[data-dashboard-theme="light"] .region-filter,
    body.turnly-admin-suite[data-dashboard-theme="light"] .region-inline-editor select,
    body.turnly-admin-suite[data-dashboard-theme="light"] .region-assignment-row select {
      background: #ffffff;
      border-color: #d6e0ea;
      color: #061321;
    }

    body.turnly-admin-suite[data-dashboard-theme="light"] .region-hero p,
    body.turnly-admin-suite[data-dashboard-theme="light"] .region-card p,
    body.turnly-admin-suite[data-dashboard-theme="light"] .region-card small,
    body.turnly-admin-suite[data-dashboard-theme="light"] .region-message,
    body.turnly-admin-suite[data-dashboard-theme="light"] .region-selected-summary span,
    body.turnly-admin-suite[data-dashboard-theme="light"] .region-access-preview span,
    body.turnly-admin-suite[data-dashboard-theme="light"] .region-manager-card small,
    body.turnly-admin-suite[data-dashboard-theme="light"] .region-manager-card dd,
    body.turnly-admin-suite[data-dashboard-theme="light"] .region-manager-card dt,
    body.turnly-admin-suite[data-dashboard-theme="light"] .region-manager-option small,
    body.turnly-admin-suite[data-dashboard-theme="light"] .region-summary-row span,
    body.turnly-admin-suite[data-dashboard-theme="light"] .region-action-bar span,
    body.turnly-admin-suite[data-dashboard-theme="light"] .region-inline-editor span,
    body.turnly-admin-suite[data-dashboard-theme="light"] .region-section-head.compact > span {
      color: #456078;
    }

    body.turnly-admin-suite[data-dashboard-theme="light"] .region-access-preview strong,
    body.turnly-admin-suite[data-dashboard-theme="light"] .region-selection-toolbar > span {
      color: #061321;
    }

    body.turnly-admin-suite[data-dashboard-theme="light"] .danger-action {
      border-color: rgba(220, 38, 38, 0.35);
      color: #b91c1c;
    }

    @media (max-width: 1180px) {
      .region-hero,
      .region-layout,
      .region-assignment-grid,
      .region-secondary-grid {
        grid-template-columns: 1fr;
      }

      .region-stat-grid,
      .region-check-grid,
      .manager-check-grid,
      .region-manager-card-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .region-sidebar-stack {
        position: static;
      }
    }

    @media (max-width: 720px) {
      .region-stat-grid,
      .region-summary-row,
      .region-check-grid,
      .manager-check-grid,
      .region-manager-option-grid,
      .region-manager-card-grid,
      .region-form-grid,
      .region-manager-toolbar,
      .region-add-form,
      .region-assignment-row,
      .region-inline-editor,
      .region-manager-chip {
        grid-template-columns: 1fr;
      }

      .property-move-row {
        grid-template-columns: 1fr;
      }

      .region-card-head,
      .region-section-head,
      .region-form-actions,
      .region-action-bar,
      .region-state-node > summary,
      .region-region-node > summary,
      .region-property-node > summary,
      .region-utility-panel > summary {
        align-items: stretch;
        flex-direction: column;
      }

      .region-filter {
        max-width: none;
      }

      .region-selection-toolbar,
      .region-settings summary,
      .region-manager-card-top {
        align-items: stretch;
        grid-template-columns: 1fr;
      }
    }
  `;
  document.head.appendChild(style);
}

if (root) {
  injectStyles();
  installHandlers();
  loadData();
}
