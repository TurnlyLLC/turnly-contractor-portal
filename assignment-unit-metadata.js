import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const env = window.__ENV || {};
const supabase = env.SUPABASE_URL && env.SUPABASE_ANON_KEY
  ? createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
  : null;

let isSavingAssignment = false;

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function value(id) {
  return cleanText(document.getElementById(id)?.value);
}

function normalizeToken(value) {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function parseDateTime(inputValue) {
  if (!inputValue) return null;
  const date = new Date(inputValue);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toDateInput(date) {
  if (!date) return null;
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function endOfDate(date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function recurrenceEndDate(frequency, startDate) {
  if (frequency === "one_time") return startDate;
  const fieldValue = value("recurrence_end_date");
  if (fieldValue) return endOfDate(new Date(`${fieldValue}T12:00:00`));
  const date = new Date(startDate);
  if (frequency === "daily") date.setDate(date.getDate() + 6);
  if (frequency === "weekly") date.setDate(date.getDate() + 28);
  if (frequency === "monthly") date.setMonth(date.getMonth() + 5);
  return endOfDate(date);
}

function advanceWindow(start, end, frequency) {
  const nextStart = new Date(start);
  const nextEnd = new Date(end);
  if (frequency === "daily") {
    nextStart.setDate(nextStart.getDate() + 1);
    nextEnd.setDate(nextEnd.getDate() + 1);
  } else if (frequency === "weekly") {
    nextStart.setDate(nextStart.getDate() + 7);
    nextEnd.setDate(nextEnd.getDate() + 7);
  } else if (frequency === "monthly") {
    nextStart.setMonth(nextStart.getMonth() + 1);
    nextEnd.setMonth(nextEnd.getMonth() + 1);
  }
  return { start: nextStart, end: nextEnd };
}

function buildWindows(start, end, frequency, recurrenceEnd) {
  const windows = [];
  let cursorStart = new Date(start);
  let cursorEnd = new Date(end);
  const limit = frequency === "daily" ? 366 : frequency === "weekly" ? 104 : frequency === "monthly" ? 36 : 1;
  const cutoff = frequency === "one_time" ? end : recurrenceEnd;

  while (windows.length < limit && cursorStart <= cutoff) {
    windows.push({ start: new Date(cursorStart), end: new Date(cursorEnd) });
    if (frequency === "one_time") break;
    const next = advanceWindow(cursorStart, cursorEnd, frequency);
    cursorStart = next.start;
    cursorEnd = next.end;
  }

  return windows;
}

function randomGroupId() {
  return window.crypto?.randomUUID?.() || `assignment-${Date.now()}-${Math.round(Math.random() * 100000)}`;
}

function selectedContractors() {
  return Array.from(document.querySelectorAll("#assignmentForm [data-assignment-contractor-option]:checked"))
    .map((input) => ({
      id: input.dataset.contractorId || "",
      name: input.dataset.contractorName || "",
      email: input.dataset.contractorEmail || ""
    }))
    .filter((contractor) => contractor.id || contractor.name);
}

function selectedUnitLabel(select) {
  return cleanText(select?.selectedOptions?.[0]?.textContent);
}

function unitMetadata() {
  const field = document.getElementById("assignmentUnitField");
  if (!field || field.hidden) return {};

  const select = document.getElementById("assignmentUnitSelect");
  const label = value("assignmentUnitSearch") || selectedUnitLabel(select);
  const unitId = value("assignmentUnitSelect");
  const unitName = label.replace(/\s+-\s+[\d,.]+\s*sq\s*ft\b/i, "").trim();
  const squareFeetMatch = label.match(/([\d,.]+)\s*sq\s*ft/i);

  if (!unitName && !unitId) return {};

  const metadata = {
    unit_id: unitId || null,
    unit_name: unitName || unitId,
    unit_number: unitName || unitId
  };
  if (squareFeetMatch?.[1]) metadata.unit_square_feet = squareFeetMatch[1].replace(/,/g, "");
  if (value("pay_amount")) metadata.unit_contractor_pay = value("pay_amount");
  if (value("special_instructions")) metadata.unit_notes = value("special_instructions");
  return metadata;
}

function setMessage(text, isError = false) {
  const message = document.getElementById("assignmentFormMessage")
    || document.getElementById("assignmentMessage")
    || document.getElementById("message");
  if (!message) return;
  message.textContent = text || "";
  message.classList.toggle("error", Boolean(isError));
}

function setSaving(isSaving) {
  const button = document.getElementById("assignmentSaveBtn") || document.querySelector("#assignmentForm button[type='submit']");
  if (!button) return;
  button.disabled = isSaving;
  const label = button.querySelector("span") || button;
  label.textContent = isSaving ? "Posting..." : "Post Assignment";
}

function closeModal() {
  const modal = document.getElementById("assignmentModal");
  if (modal) modal.hidden = true;
  document.body.classList.remove("property-modal-open");
}

function clearForm() {
  const form = document.getElementById("assignmentForm");
  if (!form) return;
  form.reset();
  document.getElementById("assignmentUnitField")?.setAttribute("hidden", "");
}

async function currentUserId() {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id || null;
}

async function saveAssignment(event) {
  if (event.target?.id !== "assignmentForm") return;
  event.preventDefault();
  event.stopImmediatePropagation();

  if (!supabase || isSavingAssignment) return;
  isSavingAssignment = true;
  setSaving(true);
  setMessage("Saving assignment to Supabase...");

  const start = parseDateTime(value("start_window"));
  const end = parseDateTime(value("end_window"));
  if (!start || !end || end <= start) {
    isSavingAssignment = false;
    setSaving(false);
    setMessage(!start || !end ? "Start Window and End Window are required." : "End Window must be after Start Window.", true);
    return;
  }

  const frequency = normalizeToken(value("assignment_frequency") || "one_time") || "one_time";
  const recurrenceEnd = recurrenceEndDate(frequency, start);
  const windows = buildWindows(start, end, frequency, recurrenceEnd);
  if (!windows.length) {
    isSavingAssignment = false;
    setSaving(false);
    setMessage("Renew Until must be on or after the Start Window date.", true);
    return;
  }

  const contractors = selectedContractors();
  const preferredFirst = Boolean(document.getElementById("preferred_first")?.checked && contractors.length);
  const payAmount = Number(value("pay_amount"));
  const metadata = unitMetadata();
  const userId = await currentUserId();
  const groupId = frequency === "one_time" ? null : randomGroupId();

  const basePayload = {
    title: value("title"),
    property_id: value("property_id") || null,
    property_name: value("property_name"),
    address: value("address"),
    service_type: value("service_type"),
    pay_amount: Number.isFinite(payAmount) && payAmount >= 0 ? payAmount : 0,
    scope: value("scope"),
    supplies_notes: value("supplies_notes"),
    special_instructions: value("special_instructions"),
    priority: value("priority") || "normal",
    status: preferredFirst ? "preferred_pending" : "open",
    assignment_type: frequency,
    recurrence_frequency: frequency,
    recurrence_interval: 1,
    recurrence_end_date: frequency === "one_time" ? null : toDateInput(recurrenceEnd),
    auto_renewal: frequency !== "one_time" && Boolean(document.getElementById("auto_renewal")?.checked),
    recurring_group_id: groupId,
    preferred_first: preferredFirst,
    preferred_contractor_ids: contractors.map((contractor) => contractor.id).filter(Boolean),
    preferred_contractor_names: contractors.map((contractor) => contractor.name).filter(Boolean),
    preferred_until: value("preferred_until") ? parseDateTime(value("preferred_until"))?.toISOString() || null : null,
    visibility: preferredFirst ? "preferred" : "open",
    declined_contractor_ids: [],
    metadata,
    created_by: userId
  };

  const payloads = windows.map((window) => ({
    ...basePayload,
    start_window: window.start.toISOString(),
    end_window: window.end.toISOString()
  }));

  const { data, error } = await supabase
    .from("assignment_blocks")
    .insert(payloads)
    .select("*");

  isSavingAssignment = false;
  setSaving(false);
  if (error) {
    setMessage("Unable to save assignment: " + error.message, true);
    return;
  }

  clearForm();
  closeModal();
  document.dispatchEvent(new CustomEvent("turnly:assignments-updated"));
  setMessage(`${data?.length || payloads.length} assignment block${(data?.length || payloads.length) === 1 ? "" : "s"} posted to Supabase.`);
}

document.addEventListener("submit", saveAssignment, true);
