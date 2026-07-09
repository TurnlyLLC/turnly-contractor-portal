import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const env = window.__ENV || {};
const supabase = env.SUPABASE_URL && env.SUPABASE_ANON_KEY
  ? createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
  : null;

let addressRequestId = 0;

function selectedPropertyId() {
  return document.getElementById("propertySelect")?.value || document.getElementById("property_id")?.value || "";
}

async function syncSelectedPropertyAddress() {
  if (!supabase) return;
  const propertyId = selectedPropertyId();
  const addressField = document.getElementById("address");
  if (!propertyId || !addressField) return;

  const requestId = addressRequestId + 1;
  addressRequestId = requestId;

  const { data, error } = await supabase
    .from("clients")
    .select("billing_address")
    .eq("id", propertyId)
    .maybeSingle();

  if (requestId !== addressRequestId) return;
  if (error) {
    console.warn("[assignments] Unable to load client billing address", error);
    return;
  }

  const address = String(data?.billing_address || "").trim();
  if (address) {
    addressField.value = address;
  }
}

function scheduleAddressSync(delay = 0) {
  window.setTimeout(() => {
    void syncSelectedPropertyAddress();
  }, delay);
}

document.addEventListener("change", (event) => {
  if (event.target?.id === "propertySelect") {
    scheduleAddressSync(75);
  }
});

document.addEventListener("submit", (event) => {
  if (event.target?.id === "assignmentForm") {
    scheduleAddressSync();
  }
}, true);

window.addEventListener("load", () => {
  if (document.body?.dataset?.adminPage !== "assignments") return;
  scheduleAddressSync(400);
  scheduleAddressSync(1200);
  const observer = new MutationObserver(() => scheduleAddressSync(50));
  observer.observe(document.body, { childList: true, subtree: true });
});
