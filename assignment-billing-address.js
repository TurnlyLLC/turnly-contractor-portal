import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const env = window.__ENV || {};
const supabase = env.SUPABASE_URL && env.SUPABASE_ANON_KEY
  ? createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
  : null;

let addressRequestId = 0;
let addressSaveTimer = 0;
const addressCache = new Map();

function selectedPropertyId() {
  return document.getElementById("propertySelect")?.value || document.getElementById("property_id")?.value || "";
}

async function loadBillingAddress(propertyId) {
  if (!supabase) return "";
  if (!propertyId) return "";
  if (addressCache.has(propertyId)) return addressCache.get(propertyId);

  const { data, error } = await supabase
    .from("clients")
    .select("billing_address")
    .eq("id", propertyId)
    .maybeSingle();

  if (error) {
    console.warn("[assignments] Unable to load client billing address", error);
  }

  let address = String(data?.billing_address || "").trim();
  if (!address) {
    const { data: propertyData, error: propertyError } = await supabase
      .from("portal_properties")
      .select("address")
      .eq("id", propertyId)
      .maybeSingle();

    if (propertyError) {
      console.warn("[assignments] Unable to load portal property address", propertyError);
    }
    address = String(propertyData?.address || "").trim();
  }

  addressCache.set(propertyId, address);
  return address;
}

async function saveBillingAddress(propertyId, address) {
  if (!supabase || !propertyId) return;
  const cleanAddress = String(address || "").trim();
  if (!cleanAddress) return;

  const { error } = await supabase
    .from("clients")
    .update({ billing_address: cleanAddress })
    .eq("id", propertyId);

  if (error) {
    console.warn("[assignments] Unable to save client billing address", error);
    return;
  }

  addressCache.set(propertyId, cleanAddress);
  await supabase
    .from("portal_properties")
    .update({ address: cleanAddress })
    .eq("id", propertyId);
}

async function syncSelectedPropertyAddress() {
  const propertyId = selectedPropertyId();
  const addressField = document.getElementById("address");
  if (!propertyId || !addressField) return;

  const requestId = addressRequestId + 1;
  addressRequestId = requestId;

  const address = await loadBillingAddress(propertyId);
  if (requestId !== addressRequestId) return;
  if (address) {
    addressField.value = address;
    addressField.placeholder = "";
  } else {
    addressField.placeholder = "No address saved yet. Enter it once to save for this property.";
  }
}

async function patchAssignmentRow(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return row;
  const enteredAddress = String(row.address || "").trim();
  if (enteredAddress) {
    await saveBillingAddress(row.property_id || selectedPropertyId(), enteredAddress);
    return row;
  }
  const address = await loadBillingAddress(row.property_id || selectedPropertyId());
  return address ? { ...row, address } : row;
}

function installAssignmentAddressFetchPatch() {
  if (window.__turnlyAssignmentBillingAddressFetchPatch || !window.fetch) return;
  window.__turnlyAssignmentBillingAddressFetchPatch = true;
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input?.url || "";
    const method = String(init?.method || input?.method || "GET").toUpperCase();
    const body = init?.body;

    if (/\/rest\/v1\/assignment_blocks\b/i.test(url) && ["POST", "PATCH"].includes(method) && body) {
      try {
        const parsed = JSON.parse(body);
        const patchedBody = Array.isArray(parsed)
          ? await Promise.all(parsed.map(patchAssignmentRow))
          : await patchAssignmentRow(parsed);
        init = { ...init, body: JSON.stringify(patchedBody) };
      } catch (error) {
        console.warn("[assignments] Unable to attach billing address to assignment save", error);
      }
    }

    return originalFetch(input, init);
  };
}

function scheduleAddressSync(delay = 0) {
  window.setTimeout(() => {
    void syncSelectedPropertyAddress();
  }, delay);
}

function scheduleAddressSave(delay = 500) {
  window.clearTimeout(addressSaveTimer);
  addressSaveTimer = window.setTimeout(() => {
    const propertyId = selectedPropertyId();
    const address = document.getElementById("address")?.value || "";
    void saveBillingAddress(propertyId, address);
  }, delay);
}

document.addEventListener("change", (event) => {
  if (event.target?.id === "propertySelect") {
    scheduleAddressSync(75);
  }
});

document.addEventListener("submit", (event) => {
  if (event.target?.id === "assignmentForm") {
    scheduleAddressSave(0);
    scheduleAddressSync();
  }
}, true);

document.addEventListener("input", (event) => {
  if (event.target?.id === "address") {
    scheduleAddressSave();
  }
});

document.addEventListener("blur", (event) => {
  if (event.target?.id === "address") {
    scheduleAddressSave(0);
  }
}, true);

window.addEventListener("load", () => {
  if (document.body?.dataset?.adminPage !== "assignments") return;
  installAssignmentAddressFetchPatch();
  scheduleAddressSync(400);
  scheduleAddressSync(1200);
  const observer = new MutationObserver(() => scheduleAddressSync(50));
  observer.observe(document.body, { childList: true, subtree: true });
});
