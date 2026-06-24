import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const env = window.__ENV || {};
const supabase = env.SUPABASE_URL && env.SUPABASE_ANON_KEY
  ? createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
  : null;

const preparedForms = new WeakSet();

function workspace() {
  return document.querySelector("[data-property-units-page]");
}

function inWorkspace(node) {
  const root = workspace();
  return Boolean(root && node && root.contains(node));
}

function selectedProperty() {
  const select = document.getElementById("propertyUnitPropertySelect");
  const id = select?.value || "";
  const title = select?.selectedOptions?.[0]?.textContent?.trim() || "Client Directory Property";
  return { id, title };
}

function setMessage(text, isError = false) {
  const message = document.getElementById("propertyUnitMessage");
  if (!message) return;
  message.textContent = text || "";
  message.classList.toggle("error", Boolean(isError));
  message.classList.toggle("is-error", Boolean(isError));
}

function duplicateKeyError(error) {
  const message = String(error?.message || "").toLowerCase();
  return error?.code === "23505" || message.includes("duplicate key");
}

function missingColumnName(error) {
  const message = String(error?.message || "");
  return message.match(/Could not find the '([^']+)' column/)?.[1]
    || message.match(/column "([^"]+)" of relation/)?.[1]
    || "";
}

async function currentUserId() {
  try {
    const result = await supabase.auth.getUser();
    return result.data?.user?.id || "";
  } catch {
    return "";
  }
}

async function insertLegacyProperty(payload) {
  const nextPayload = { ...payload };

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const result = await supabase
      .from("portal_properties")
      .insert(nextPayload)
      .select("id")
      .maybeSingle();

    if (!result.error || duplicateKeyError(result.error)) return;

    const missingColumn = missingColumnName(result.error);
    if (missingColumn && missingColumn in nextPayload && Object.keys(nextPayload).length > 2) {
      delete nextPayload[missingColumn];
      continue;
    }

    throw result.error;
  }
}

async function ensureLegacyProperty() {
  if (!supabase) return;
  const property = selectedProperty();
  if (!property.id) return;

  const payload = {
    id: property.id,
    property_name: property.title,
    name: property.title,
    company_name: property.title,
    pipeline_stage: "client_directory"
  };

  const userId = await currentUserId();
  if (userId) payload.created_by = userId;
  await insertLegacyProperty(payload);
}

function redispatchSubmit(form) {
  preparedForms.add(form);
  form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}

document.addEventListener("submit", (event) => {
  const form = event.target?.closest?.("#propertyUnitQuickForm, [data-property-unit-row]");
  if (!form || !inWorkspace(form)) return;

  if (preparedForms.has(form)) {
    preparedForms.delete(form);
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  setMessage("Preparing property record...");
  ensureLegacyProperty()
    .then(() => redispatchSubmit(form))
    .catch((error) => {
      console.warn("[property-units] Unable to prepare property record", error);
      setMessage("Unable to prepare property record: " + (error?.message || "Unknown error"), true);
    });
}, true);
