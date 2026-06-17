import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const env = window.__ENV || {};
const supabase = env.SUPABASE_URL && env.SUPABASE_ANON_KEY
  ? createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
  : null;

const form = document.getElementById("assignmentForm");
const propertySelect = document.getElementById("propertySelect");
const message = document.getElementById("message");

function showMessage(text) {
  if (message) message.textContent = text;
}

function normalizeChecklistItems(items) {
  return Array.isArray(items) ? items : [];
}

function isCoordinate(latitude, longitude) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

function getPropertyCoordinates(property) {
  const coordinatePairs = [
    ["site_latitude", "site_longitude"],
    ["property_latitude", "property_longitude"],
    ["latitude", "longitude"]
  ];

  for (const [latKey, lngKey] of coordinatePairs) {
    if (isCoordinate(property?.[latKey], property?.[lngKey])) {
      return {
        latitude: Number(property[latKey]),
        longitude: Number(property[lngKey])
      };
    }
  }

  return null;
}

function isMissingSnapshotColumnError(error) {
  const text = String(error?.message || "").toLowerCase();
  return [
    "property_id",
    "property_checklist_items",
    "site_latitude",
    "site_longitude",
    "schema cache",
    "could not find"
  ].some((part) => text.includes(part));
}

function renderChecklistPreview(property) {
  const preview = document.getElementById("assignmentChecklistPreview");
  if (!preview) return;

  const checklistItems = normalizeChecklistItems(property?.checklist_items);
  if (!property) {
    preview.innerHTML = "";
    return;
  }

  if (!checklistItems.length) {
    preview.innerHTML = "<strong>Checklist:</strong><p>No checklist is assigned to this property yet.</p>";
    return;
  }

  preview.innerHTML = `
    <strong>Assigned Checklist Snapshot</strong>
    <p>${checklistItems.length} item(s) will be attached to this assignment.</p>
    <ul>
      ${checklistItems.slice(0, 6).map((item) => (
        `<li>${String(item.category || "General")}: ${String(item.task || "Untitled task")}</li>`
      )).join("")}
    </ul>
    ${checklistItems.length > 6 ? `<p>${checklistItems.length - 6} more checklist item(s)</p>` : ""}
  `;
}

async function getSelectedProperty() {
  const propertyId = propertySelect?.value || document.getElementById("property_id")?.value || null;
  if (!propertyId) return null;

  const { data, error } = await supabase
    .from("properties")
    .select("*")
    .eq("id", propertyId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function postAssignment(event) {
  if (!form || !supabase) return;

  event.preventDefault();
  event.stopImmediatePropagation();

  showMessage("Posting assignment...");

  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  let selectedProperty = null;
  try {
    selectedProperty = await getSelectedProperty();
  } catch (error) {
    showMessage("Error loading property checklist: " + error.message);
    return;
  }

  const propertyId = selectedProperty?.id || propertySelect?.value || null;
  const coordinates = getPropertyCoordinates(selectedProperty);
  const baseAssignment = {
    title: document.getElementById("title").value,
    property_name: document.getElementById("property_name").value,
    address: document.getElementById("address").value,
    service_type: document.getElementById("service_type").value,
    scope: document.getElementById("scope").value,
    pay_amount: document.getElementById("pay_amount").value || null,
    start_window: document.getElementById("start_window").value || null,
    end_window: document.getElementById("end_window").value || null,
    supplies_notes: document.getElementById("supplies_notes").value,
    special_instructions: document.getElementById("special_instructions").value,
    status: "open",
    created_by: user.id
  };

  const assignmentWithSnapshot = {
    ...baseAssignment,
    property_id: propertyId,
    property_checklist_items: normalizeChecklistItems(selectedProperty?.checklist_items),
    site_latitude: coordinates?.latitude || null,
    site_longitude: coordinates?.longitude || null
  };

  let { error } = await supabase
    .from("assignment_blocks")
    .insert([assignmentWithSnapshot]);

  if (error && isMissingSnapshotColumnError(error)) {
    ({ error } = await supabase
      .from("assignment_blocks")
      .insert([baseAssignment]));
  }

  if (error) {
    showMessage("Error: " + error.message);
    return;
  }

  showMessage("Assignment posted successfully.");
  form.reset();
  renderChecklistPreview(null);
  setTimeout(() => window.location.reload(), 700);
}

if (form && supabase) {
  document.addEventListener("submit", (event) => {
    if (event.target === form) {
      postAssignment(event);
    }
  }, true);

  propertySelect?.addEventListener("change", async () => {
    try {
      renderChecklistPreview(await getSelectedProperty());
    } catch {
      renderChecklistPreview(null);
    }
  });
}
