import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const env = window.__ENV || {};
const supabase = env.SUPABASE_URL && env.SUPABASE_ANON_KEY
  ? createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
  : null;

const FIELD_ID = "clientBillingAddress";
const SYNC_ATTR = "data-client-billing-address-ready";

const formState = new WeakMap();
let pendingAddAddress = "";
let activeClientForm = null;

function currentState(form) {
  if (!formState.has(form)) {
    formState.set(form, { clientId: "", lastSaved: "", loading: false, timer: 0 });
  }
  return formState.get(form);
}

function fieldFor(form) {
  return form?.querySelector(`[data-client-billing-address-field] input`) || form?.querySelector(`#${FIELD_ID}`);
}

function clientIdFor(form) {
  return form?.querySelector("#clientId")?.value || "";
}

function scheduleSave(form) {
  markActiveForm(form);
  const state = currentState(form);
  window.clearTimeout(state.timer);
  state.timer = window.setTimeout(() => {
    void saveAddress(form);
  }, 500);
}

function markActiveForm(form) {
  if (form?.id === "clientForm") {
    activeClientForm = form;
  }
}

async function loadAddress(form) {
  if (!supabase || !form) return;
  const input = fieldFor(form);
  const clientId = clientIdFor(form);
  if (!input || !clientId) return;

  const state = currentState(form);
  if (state.loading || state.clientId === clientId) return;
  state.loading = true;
  state.clientId = clientId;

  const { data, error } = await supabase
    .from("clients")
    .select("billing_address")
    .eq("id", clientId)
    .maybeSingle();

  if (error) {
    console.warn("[clients] Unable to load billing address", error);
  }

  let savedAddress = data?.billing_address || "";
  if (!savedAddress) {
    const { data: propertyData, error: propertyError } = await supabase
      .from("portal_properties")
      .select("address")
      .eq("id", clientId)
      .maybeSingle();

    if (propertyError) {
      console.warn("[clients] Unable to load portal property address", propertyError);
    }
    savedAddress = propertyData?.address || "";
  }

  const hasUserTyped = input.dataset.dirty === "true" || document.activeElement === input;
  const nextAddress = pendingAddAddress && !savedAddress ? pendingAddAddress : savedAddress;
  state.loading = false;
  if (!hasUserTyped) {
    input.value = nextAddress;
  }
  input.placeholder = nextAddress ? "" : "Street address, city, state, ZIP";
  state.lastSaved = savedAddress;

  if (pendingAddAddress && nextAddress === pendingAddAddress) {
    pendingAddAddress = "";
    await saveAddress(form, { force: true });
  } else if (hasUserTyped && input.value.trim() && input.value.trim() !== savedAddress) {
    await saveAddress(form, { force: true });
  }
}

async function saveAddress(form, options = {}) {
  if (!supabase || !form) return;
  const input = fieldFor(form);
  const clientId = clientIdFor(form);
  if (!input || !clientId) return;

  markActiveForm(form);
  const state = currentState(form);
  const address = input.value.trim();
  if (!options.force && address === state.lastSaved) return;

  const { error } = await supabase
    .from("clients")
    .update({ billing_address: address || null })
    .eq("id", clientId);

  if (error) {
    console.warn("[clients] Unable to save billing address", error);
    return;
  }

  state.lastSaved = address;
  input.dataset.dirty = "false";
  await savePortalPropertyAddress(clientId, address);
}

async function savePortalPropertyAddress(clientId, address) {
  if (!supabase || !clientId) return;
  const { error } = await supabase
    .from("portal_properties")
    .update({ address: address || null })
    .eq("id", clientId);

  if (error) {
    console.warn("[clients] Unable to save portal property address", error);
  }
}

function clientIdFromUrl(url) {
  try {
    const parsed = new URL(url, window.location.origin);
    const filter = parsed.searchParams.get("id");
    if (filter?.startsWith("eq.")) return decodeURIComponent(filter.slice(3));
  } catch {
    const match = String(url || "").match(/[?&]id=eq\.([^&]+)/i);
    if (match) return decodeURIComponent(match[1]);
  }
  return "";
}

function formForClientSave(url) {
  const clientId = clientIdFromUrl(url);
  if (clientId) {
    const matchingForm = [...document.querySelectorAll("form#clientForm")]
      .find((form) => clientIdFor(form) === clientId);
    if (matchingForm) return matchingForm;
  }
  const focusedForm = document.activeElement?.closest?.("form#clientForm");
  return focusedForm || activeClientForm || document.querySelector("form#clientForm");
}

function installClientFetchPatch() {
  if (window.__turnlyClientBillingAddressFetchPatch || !window.fetch) return;
  window.__turnlyClientBillingAddressFetchPatch = true;
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input?.url || "";
    const method = String(init?.method || input?.method || "GET").toUpperCase();
    const body = init?.body;
    let patchedAddress = "";
    let patchedClientId = "";

    if (/\/rest\/v1\/clients\b/i.test(url) && ["POST", "PATCH"].includes(method) && body) {
      const saveForm = formForClientSave(url);
      const address = fieldFor(saveForm)?.value?.trim() || pendingAddAddress;
      if (address) {
        try {
          const parsed = JSON.parse(body);
          const withAddress = (row) => ({ ...row, billing_address: row.billing_address || address });
          const patchedBody = Array.isArray(parsed) ? parsed.map(withAddress) : withAddress(parsed);
          init = { ...init, body: JSON.stringify(patchedBody) };
          patchedAddress = address;
          patchedClientId = clientIdFor(saveForm) || clientIdFromUrl(url);
        } catch (error) {
          console.warn("[clients] Unable to attach billing address to client save", error);
        }
      }
    }

    const response = await originalFetch(input, init);
    if (response.ok && patchedAddress && patchedClientId) {
      void savePortalPropertyAddress(patchedClientId, patchedAddress);
    }
    return response;
  };
}

function ensureAddressField(form) {
  if (!form || form.getAttribute(SYNC_ATTR) === "true") return;
  const region = form.querySelector("#clientRegion");
  if (!region) return;
  const regionField = region.closest(".suite-field");
  if (!regionField) return;

  regionField.insertAdjacentHTML("afterend", `
    <label class="suite-field wide" data-client-billing-address-field>
      <span>Property Address</span>
      <input id="${FIELD_ID}" type="text" autocomplete="street-address" placeholder="Street address, city, state, ZIP" />
    </label>
  `);
  form.setAttribute(SYNC_ATTR, "true");

  const input = fieldFor(form);
  input?.addEventListener("focus", () => markActiveForm(form));
  input?.addEventListener("input", () => {
    markActiveForm(form);
    input.dataset.dirty = "true";
    scheduleSave(form);
  });
  input?.addEventListener("change", () => {
    markActiveForm(form);
    input.dataset.dirty = "true";
    scheduleSave(form);
  });
  input?.addEventListener("blur", () => {
    void saveAddress(form);
  });
  void loadAddress(form);
}

function syncForms() {
  document.querySelectorAll("form#clientForm").forEach((form) => {
    ensureAddressField(form);
    void loadAddress(form);
  });
}

document.addEventListener("submit", (event) => {
  const form = event.target?.closest?.("form#clientForm");
  if (!form) return;
  markActiveForm(form);
  pendingAddAddress = fieldFor(form)?.value?.trim() || pendingAddAddress;
  void saveAddress(form);
}, true);

window.addEventListener("load", () => {
  if (document.body?.dataset?.adminPage !== "client-directory") return;
  installClientFetchPatch();
  syncForms();
  const observer = new MutationObserver(syncForms);
  observer.observe(document.body, { childList: true, subtree: true });
  window.setInterval(syncForms, 1500);
});
