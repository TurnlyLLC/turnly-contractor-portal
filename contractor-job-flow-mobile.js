import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const env = window.__ENV || {};
const supabase = env.SUPABASE_URL && env.SUPABASE_ANON_KEY
  ? createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
  : null;

const EARTH_RADIUS_MILES = 3958.7613;
const geocodeCache = new Map();

let activeAssignment = null;
let activeUser = null;
let activeSite = null;
let activePosition = null;
let activeChecklistItems = [];
let activeChecklistModules = [];
let activeChecklistIndex = 0;
let activeChecklistDrafts = [];
let activeQaJobId = null;
let activeDirectoryDetails = null;
let activeIssueDraft = "";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function selectorValue(value) {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isCoordinate(latitude, longitude) {
  const lat = toNumber(latitude);
  const lng = toNumber(longitude);
  return lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

function distanceMiles(pointA, pointB) {
  const lat1 = toNumber(pointA?.latitude);
  const lon1 = toNumber(pointA?.longitude);
  const lat2 = toNumber(pointB?.latitude);
  const lon2 = toNumber(pointB?.longitude);
  if (!isCoordinate(lat1, lon1) || !isCoordinate(lat2, lon2)) return null;

  const rad = (degrees) => degrees * Math.PI / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) *
    Math.sin(dLon / 2) ** 2;

  return EARTH_RADIUS_MILES * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getAssignmentCoordinates(assignment) {
  if (isCoordinate(assignment?.site_latitude, assignment?.site_longitude)) {
    return {
      latitude: Number(assignment.site_latitude),
      longitude: Number(assignment.site_longitude)
    };
  }
  return null;
}

function getMapQuery(assignment) {
  const coordinates = getAssignmentCoordinates(assignment);
  if (coordinates) return `${coordinates.latitude},${coordinates.longitude}`;
  return resolvedAddress(assignment) || assignment?.address || assignment?.property_name || assignment?.title || "";
}

function mapUrl(assignment, embed = true) {
  const query = getMapQuery(assignment);
  if (!query) return "";
  const encoded = encodeURIComponent(query);
  return embed
    ? `https://www.google.com/maps?q=${encoded}&output=embed&t=k`
    : `https://www.google.com/maps/search/?api=1&query=${encoded}`;
}

function dateLabel(value) {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function dueLabel(assignment) {
  return dateLabel(
    assignment?.due_date ||
    assignment?.scheduled_date ||
    assignment?.service_date ||
    assignment?.start_window ||
    assignment?.start_time ||
    assignment?.starts_at ||
    assignment?.created_at
  );
}

function checklistTitle(assignment) {
  const service = assignment?.service_type || assignment?.title || "Turnly Standard Commercial";
  return /checklist/i.test(service) ? service : `${service} Checklist`;
}

function safeMediaFileName(name) {
  return String(name || "upload")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || "upload";
}

function checklistMediaKind(item = {}) {
  const raw = String([item.media_required, item.type, item.item_type].find((candidate) => {
    const normalized = String(candidate || "").trim().toLowerCase();
    return normalized && normalized !== "none" && normalized !== "false" && normalized !== "no";
  }) || "").toLowerCase();
  if (raw.includes("video")) return "video";
  if (raw.includes("photo") || raw.includes("image")) return "photo";
  return "";
}

function normalizeChecklistItem(item = {}) {
  const mediaKind = checklistMediaKind(item);
  const task = item.task || item.label || item.title || "Untitled task";
  const type = String(item.type || item.item_type || mediaKind || "check").toLowerCase();
  const required = Object.prototype.hasOwnProperty.call(item, "required")
    ? item.required !== false
    : type !== "optional";
  return {
    ...item,
    task,
    label: item.label || task,
    type,
    required,
    media_required: mediaKind || "none"
  };
}

function normalizeChecklistItems(items) {
  return Array.isArray(items) ? items.map(normalizeChecklistItem) : [];
}

function checklistMediaInput(item, index, kind) {
  const accept = kind === "video" ? "video/*" : "image/*";
  return `
    <label class="tc-upload">
      <span>Upload ${escapeHtml(kind === "video" ? "video" : "photo")}</span>
      <input type="file" data-tc-media="${index}" accept="${escapeHtml(accept)}" />
      <small data-tc-media-name>${escapeHtml(item.required === false ? "Optional file" : "Required file before completion")}</small>
    </label>
  `;
}

function checklistModuleTitle(item = {}, index = 0) {
  const categoryRoot = String(item.category || "")
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)[0];
  return item.module_name || item.module || item.section_title || categoryRoot || `Module ${index + 1}`;
}

function checklistModuleKey(item = {}, index = 0) {
  return [
    item.module_id || checklistModuleTitle(item, index),
    item.module_instance || "1"
  ].map((value) => String(value || "").trim()).join("::");
}

function buildChecklistModules(items = []) {
  const modules = [];
  const lookup = new Map();
  items.forEach((item, index) => {
    const key = checklistModuleKey(item, index);
    if (!lookup.has(key)) {
      lookup.set(key, {
        key,
        title: checklistModuleTitle(item, modules.length),
        module_id: item.module_id || "",
        module_instance: item.module_instance || null,
        items: []
      });
      modules.push(lookup.get(key));
    }
    lookup.get(key).items.push({ item, index });
  });
  return modules;
}

function ensureChecklistDrafts(items = []) {
  activeChecklistDrafts = items.map((item, index) => {
    const existing = activeChecklistDrafts[index] || {};
    return {
      item,
      index,
      checked: Boolean(existing.checked),
      note: existing.note || "",
      file: existing.file || null,
      completed_at: existing.completed_at || null
    };
  });
}

function checklistDraft(index) {
  if (!activeChecklistDrafts[index]) {
    const item = activeChecklistItems[index] || {};
    activeChecklistDrafts[index] = {
      item,
      index,
      checked: false,
      note: "",
      file: null,
      completed_at: null
    };
  }
  return activeChecklistDrafts[index];
}

function moduleProgress(module) {
  const items = module?.items || [];
  const required = items.filter(({ item }) => item.required !== false);
  const completed = items.filter(({ index }) => checklistDraft(index).checked);
  const requiredCompleted = required.filter(({ index }) => checklistDraft(index).checked);
  return {
    total: items.length,
    completed: completed.length,
    required: required.length,
    requiredCompleted: requiredCompleted.length,
    done: required.length ? requiredCompleted.length === required.length : completed.length === items.length
  };
}

function currentChecklistModule() {
  return activeChecklistModules[activeChecklistIndex] || null;
}

function setChecklistMessage(text = "", tone = "") {
  const message = document.getElementById("tcMessage");
  if (!message) return;
  message.textContent = text;
  message.dataset.tone = tone;
}

function captureChecklistInputs() {
  activeChecklistDrafts.forEach((draft) => {
    const check = document.querySelector(`[data-tc-check="${draft.index}"]`);
    if (check) {
      const wasChecked = draft.checked;
      draft.checked = Boolean(check.checked);
      if (draft.checked && !wasChecked) draft.completed_at = new Date().toISOString();
      if (!draft.checked) draft.completed_at = null;
    }
    const note = document.querySelector(`[data-tc-note="${draft.index}"]`);
    if (note) draft.note = note.value.trim();
  });
}

function validateChecklistModule(module = currentChecklistModule(), showMessage = true) {
  if (!module) return true;
  captureChecklistInputs();
  const missing = module.items.filter(({ item, index }) => item.required !== false && !checklistDraft(index).checked);
  if (missing.length) {
    if (showMessage) setChecklistMessage(`Complete ${missing.length} required item${missing.length === 1 ? "" : "s"} before moving on.`, "error");
    return false;
  }
  const missingMedia = module.items.filter(({ item, index }) => {
    const draft = checklistDraft(index);
    return checklistMediaKind(item) && draft.checked && !draft.file;
  });
  if (missingMedia.length) {
    if (showMessage) setChecklistMessage(`Upload ${missingMedia.length} required media file${missingMedia.length === 1 ? "" : "s"} before moving on.`, "error");
    return false;
  }
  setChecklistMessage("");
  return true;
}

function checklistOverviewHtml() {
  return activeChecklistModules.map((module, index) => {
    const progress = moduleProgress(module);
    const active = index === activeChecklistIndex ? "active" : "";
    const complete = progress.done ? "complete" : "";
    return `
      <button type="button" class="tc-module-link ${active} ${complete}" data-tc-module-index="${index}">
        <span>${escapeHtml(module.title)}</span>
        <strong>${progress.requiredCompleted}/${progress.required || progress.total}</strong>
      </button>
    `;
  }).join("");
}

function checklistUploadCard(item, index) {
  const kind = checklistMediaKind(item);
  if (!kind) return "";
  const draft = checklistDraft(index);
  const label = kind === "video" ? "Upload QA Video" : "Upload QA Photo";
  const accept = kind === "video" ? "video/*" : "image/*";
  const fileName = draft.file?.name || (item.required === false ? "Optional file" : "Required before completion");
  return `
    <label class="tc-upload-card ${draft.file ? "has-file" : ""}">
      <input type="file" data-tc-media="${index}" accept="${escapeHtml(accept)}" />
      <span class="tc-upload-frame">
        <span class="tc-upload-icon" aria-hidden="true">&#8593;</span>
        <strong>${escapeHtml(label)}</strong>
        <em>Tap to upload or drag and drop</em>
        <small>${escapeHtml(kind === "video" ? "MP4, MOV - Max 500MB" : "JPG, PNG, HEIC")}</small>
        <b data-tc-media-name>${escapeHtml(fileName)}</b>
      </span>
    </label>
  `;
}

function checklistTaskHtml(entry, itemNumber) {
  const { item, index } = entry;
  const draft = checklistDraft(index);
  const mediaKind = checklistMediaKind(item);
  return `
    <section class="tc-task-card">
      <label class="tc-check-row">
        <input type="checkbox" data-tc-check="${index}" ${draft.checked ? "checked" : ""} />
        <span class="tc-check-box" aria-hidden="true"></span>
        <span class="tc-check-copy">
          <strong>${itemNumber}. ${escapeHtml(item.task || item.label || "Untitled task")}</strong>
          <small>${escapeHtml(item.category || checklistModuleTitle(item, index))}${item.required === false ? " - optional" : " - required"}${mediaKind ? ` - ${mediaKind}` : ""}</small>
        </span>
      </label>
      ${item.notes ? `<p class="tc-standard">${escapeHtml(item.notes)}</p>` : ""}
      <label class="tc-item-note">
        <span>Completion note</span>
        <textarea rows="2" data-tc-note="${index}" placeholder="Optional notes, issues, blocked areas...">${escapeHtml(draft.note)}</textarea>
      </label>
      ${checklistUploadCard(item, index)}
    </section>
  `;
}

function renderChecklistStep() {
  const module = currentChecklistModule();
  const title = document.getElementById("tcModuleTitle");
  const counter = document.getElementById("tcStepCounter");
  const content = document.getElementById("tcStepContent");
  const overview = document.getElementById("tcOverviewList");
  const progress = document.getElementById("tcProgressFill");
  const back = document.getElementById("tcBack");
  const next = document.getElementById("tcNext");
  if (!title || !counter || !content || !overview || !progress || !back || !next) return;

  if (!activeChecklistModules.length) {
    title.textContent = "Checklist";
    counter.textContent = "No modules assigned";
    progress.style.width = "0%";
    content.innerHTML = `
      <section class="tc-empty">
        <strong>No checklist assigned</strong>
        <p>This assignment needs a property or unit checklist before it can be completed.</p>
      </section>
    `;
    overview.innerHTML = "";
    back.disabled = true;
    next.disabled = true;
    return;
  }

  const total = activeChecklistModules.length;
  const percent = Math.round(((activeChecklistIndex + 1) / total) * 100);
  const progressSummary = moduleProgress(module);
  title.textContent = module.title;
  counter.textContent = `${activeChecklistIndex + 1} of ${total} modules - ${progressSummary.requiredCompleted}/${progressSummary.required || progressSummary.total} required done`;
  progress.style.width = `${percent}%`;
  content.innerHTML = `
    <section class="tc-checklist-card">
      <div class="tc-card-title">
        <span class="tc-card-icon" aria-hidden="true">&#9745;</span>
        <div>
          <strong>Checklist</strong>
          <small>${escapeHtml(resolvedPropertyName(activeAssignment))}${assignmentUnit(activeAssignment) ? ` - ${escapeHtml(assignmentUnit(activeAssignment))}` : ""}</small>
        </div>
      </div>
      <div class="tc-task-list">
        ${module.items.map((entry, index) => checklistTaskHtml(entry, index + 1)).join("")}
      </div>
    </section>
  `;
  overview.innerHTML = checklistOverviewHtml();
  back.disabled = activeChecklistIndex === 0;
  next.disabled = false;
  next.querySelector("[data-tc-next-label]").textContent = activeChecklistIndex === total - 1 ? "Complete" : "Next";
}

function toggleChecklistOverview(open) {
  const panel = document.getElementById("tcOverview");
  const toggle = document.getElementById("tcMenuToggle");
  if (!panel || !toggle) return;
  const shouldOpen = typeof open === "boolean" ? open : panel.hidden;
  panel.hidden = !shouldOpen;
  toggle.setAttribute("aria-expanded", String(shouldOpen));
}

async function moveChecklistStep(direction) {
  if (!activeChecklistModules.length) return;
  if (direction > 0 && !validateChecklistModule()) return;
  captureChecklistInputs();
  if (direction > 0 && activeChecklistIndex === activeChecklistModules.length - 1) {
    await completeJob();
    return;
  }
  activeChecklistIndex = Math.max(0, Math.min(activeChecklistModules.length - 1, activeChecklistIndex + direction));
  renderChecklistStep();
}

function fileDuration(file) {
  return new Promise((resolve) => {
    if (!file || !String(file.type || "").startsWith("video/")) {
      resolve(null);
      return;
    }
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(video.duration) ? video.duration : null);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    video.src = url;
  });
}

function activeContractorName() {
  return activeUser?.user_metadata?.full_name || activeUser?.email?.split("@")[0] || "Contractor";
}

function mediaAssignmentPropertyId(assignment = activeAssignment || {}) {
  return assignment.property_id || assignment.portal_property_id || assignment.metadata?.property_id || assignment.metadata?.portal_property_id || null;
}

function assignmentQaJobId(assignment = activeAssignment || {}) {
  const metadata = assignment?.metadata && typeof assignment.metadata === "object" ? assignment.metadata : {};
  return assignment?.qa_job_id || metadata.qa_job_id || "";
}

async function ensureAssignmentQaJob() {
  if (activeQaJobId) return activeQaJobId;
  if (!supabase || !activeAssignment?.id) throw new Error("Assignment is missing for QA upload.");

  const { data, error } = await supabase.rpc("ensure_assignment_qa_job", {
    target_assignment_id: activeAssignment.id
  });
  if (error) throw error;
  if (!data) throw new Error("Supabase did not return a QA job for this assignment.");

  activeQaJobId = data;
  return activeQaJobId;
}

async function submitAssignmentForQa(responses, completedAt) {
  const qaJobId = await ensureAssignmentQaJob();
  const { data, error } = await supabase.rpc("submit_assignment_for_qa", {
    target_assignment_id: activeAssignment.id,
    checklist_payload: responses,
    submitted_at: completedAt
  });
  if (!error) {
    activeQaJobId = data || qaJobId;
    return;
  }

  console.warn("[contractor-job-flow] submit_assignment_for_qa fallback", error);
  const metadata = activeAssignment.metadata && typeof activeAssignment.metadata === "object"
    ? { ...activeAssignment.metadata }
    : {};
  metadata.qa_job_id = qaJobId;
  metadata.qa_submitted_at = completedAt;

  const fallbackResult = await supabase
    .from("assignment_blocks")
    .update({
      status: "qa_pending",
      visibility: "closed",
      payment_status: "pending_qa",
      pay_status: "pending_qa",
      payout_status: "qa_review",
      checklist_responses: responses,
      checklist_completed_at: completedAt,
      completed_at: completedAt,
      completed_by: activeUser.id,
      metadata
    })
    .eq("id", activeAssignment.id)
    .eq("claimed_by", activeUser.id)
    .eq("status", "in_progress");

  if (fallbackResult.error) throw fallbackResult.error;
}

function checklistMediaBasePayload(item, file, kind, index, storagePath, completedAt, note) {
  const label = item.task || item.label || `${kind === "video" ? "Video" : "Photo"} checklist item`;
  return {
    title: `${resolvedPropertyName(activeAssignment)} - ${label}`,
    label,
    property_id: mediaAssignmentPropertyId(),
    property_name: resolvedPropertyName(activeAssignment),
    unit_name: assignmentUnit(activeAssignment),
    assignment_id: activeAssignment?.id || null,
    contractor_id: activeUser?.id || null,
    contractor_name: activeContractorName(),
    recorded_at: completedAt,
    notes: note || "",
    tags: ["checklist", kind],
    storage_bucket: kind === "video" ? "qa-videos" : "qa-photos",
    storage_path: storagePath,
    file_name: file.name || "",
    mime_type: file.type || "",
    file_size: file.size || 0,
    uploaded_by: activeUser?.id || null,
    uploaded_by_name: activeUser?.email || activeContractorName(),
    source: "contractor_checklist",
    metadata: {
      checklist_index: index,
      checklist_task: label,
      checklist_category: item.category || "General",
      checklist_item_id: item.id || item.source_item_id || "",
      module_id: item.module_id || "",
      module_name: item.module_name || "",
      module_instance: item.module_instance || null,
      original_file_name: file.name || "",
      upload_user_agent: navigator.userAgent || ""
    }
  };
}

async function uploadChecklistMedia(item, file, kind, index, completedAt, note) {
  const bucket = kind === "video" ? "qa-videos" : "qa-photos";
  const table = kind === "video" ? "qa_videos" : "qa_photos";
  const datePath = new Date().toISOString().slice(0, 10);
  const path = `${activeUser.id}/${datePath}/${activeAssignment.id}-${index + 1}-${kind}-${Date.now()}-${safeMediaFileName(file.name)}`;

  const uploadResult = await supabase.storage
    .from(bucket)
    .upload(path, file, {
      contentType: file.type || (kind === "video" ? "video/mp4" : "image/jpeg"),
      upsert: false
    });
  if (uploadResult.error) throw uploadResult.error;

  const payload = checklistMediaBasePayload(item, file, kind, index, path, completedAt, note);
  if (kind === "video") {
    payload.qa_job_id = await ensureAssignmentQaJob();
    payload.room_name = item.module_name || item.category || assignmentUnit(activeAssignment) || "";
    payload.file_size_bytes = file.size || 0;
    payload.video_phase = "other";
    payload.duration_seconds = await fileDuration(file);
  } else {
    payload.photo_phase = "other";
  }

  const insertResult = await supabase
    .from(table)
    .insert(payload)
    .select("*")
    .single();
  if (insertResult.error) throw insertResult.error;

  return {
    kind,
    table,
    id: insertResult.data?.id || "",
    bucket,
    path,
    file_name: file.name || "",
    mime_type: file.type || "",
    file_size: file.size || 0
  };
}

function description(assignment) {
  return assignment?.scope ||
    assignment?.description ||
    assignment?.special_instructions ||
    assignment?.notes ||
    "Complete the assigned checklist for this property before finishing the job.";
}

function formatStatus(value) {
  return String(value || "Not set").replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function metadataValue(assignment, keys) {
  const metadata = assignment?.metadata && typeof assignment.metadata === "object" ? assignment.metadata : {};
  for (const key of keys) {
    const value = assignment?.[key] ?? metadata[key];
    if (Array.isArray(value) && value.length) return value.join(", ");
    if (value !== null && value !== undefined && String(value).trim()) return String(value);
  }
  return "";
}

function compactAddress(row) {
  if (row?.billing_address) return String(row.billing_address).trim();
  return [row?.address, row?.city, row?.state, row?.postal_code]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(", ") || String(row?.region || row?.market || "").trim();
}

function directoryPropertyTitle(row, includeName = false) {
  return row?.property_name || row?.company_name || row?.property_title || row?.title || (includeName ? row?.name : "") || "";
}

function directoryPersonTitle(row) {
  return row?.name || row?.primary_contact_name || row?.property_manager_name || row?.contact_name || "";
}

function assignmentPropertyTitle(assignment) {
  return assignment?.property_name || metadataValue(assignment, ["property_title", "propertyName", "property_name", "company_name"]);
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function directoryAccessNotes(row) {
  return row?.access_notes || row?.entry_notes || row?.gate_code || row?.special_instructions || "";
}

function assignmentUnit(assignment) {
  return metadataValue(assignment, ["unit_name", "unit_number", "property_unit_name", "unit"]);
}

function assignmentUnitId(assignment) {
  return metadataValue(assignment, ["unit_id", "property_unit_id", "unitId", "propertyUnitId"]);
}

function assignmentAddress(assignment) {
  return metadataValue(assignment, ["address", "property_address", "site_address", "street_address"]);
}

function assignmentUnitPropertyKeys(assignment) {
  const metadata = assignment?.metadata && typeof assignment.metadata === "object" ? assignment.metadata : {};
  return [
    assignment?.property_id,
    assignment?.portal_property_id,
    metadata.property_id,
    metadata.portal_property_id,
    activeDirectoryDetails?.portalProperty?.id,
    activeDirectoryDetails?.portalProperty?.client_id
  ].filter(Boolean).map(String).filter((value, index, values) => values.indexOf(value) === index);
}

function assignmentDirectoryNames(assignment) {
  return [
    assignment?.property_name,
    assignment?.title,
    metadataValue(assignment, ["client_name", "company_name", "property_title"])
  ].map(normalizeText).filter(Boolean);
}

function directoryMatchesAssignment(row, assignment) {
  const assignmentNames = assignmentDirectoryNames(assignment);
  if (!assignmentNames.length) return false;
  const rowNames = [
    row?.property_name,
    row?.name,
    row?.company_name,
    row?.title
  ].map(normalizeText).filter(Boolean);
  return rowNames.some((name) => assignmentNames.includes(name));
}

async function fetchTableRow(table, column, value) {
  if (!supabase || !value) return null;
  const { data, error } = await supabase
    .from(table)
    .select("*")
    .eq(column, value)
    .maybeSingle();
  if (error) {
    console.warn(`[contractor-job-flow] Unable to load ${table}`, error);
    return null;
  }
  return data || null;
}

async function fetchClientById(clientId) {
  return fetchTableRow("clients", "id", clientId);
}

async function fetchContractById(contractId) {
  return fetchTableRow("client_contracts", "id", contractId);
}

async function fetchDirectoryDetails(assignment) {
  const metadata = assignment?.metadata && typeof assignment.metadata === "object" ? assignment.metadata : {};
  const details = { client: null, contract: null, portalProperty: null };
  const propertyId = assignment?.property_id || assignment?.portal_property_id || assignment?.metadata?.property_id || "";
  const contractId = assignment?.contract_id || metadata.contract_id || "";

  if (contractId) {
    details.contract = await fetchContractById(contractId);
  }

  if (propertyId) {
    details.portalProperty = await fetchTableRow("portal_properties", "id", propertyId);
    details.client = await fetchClientById(details.portalProperty?.client_id || propertyId);
    if (!details.contract) {
      details.contract = await fetchContractById(details.portalProperty?.client_id || propertyId);
    }
  }

  if (!details.client) {
    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .limit(500);
    if (!error) {
      details.client = (data || []).find((row) => directoryMatchesAssignment(row, assignment)) || null;
    } else {
      console.warn("[contractor-job-flow] Unable to search clients", error);
    }
  }

  if (!details.contract && details.client?.id) {
    details.contract = await fetchContractById(details.client.id);
  }

  if (!details.contract) {
    const { data, error } = await supabase
      .from("client_contracts")
      .select("*")
      .limit(500);
    if (!error) {
      details.contract = (data || []).find((row) => directoryMatchesAssignment(row, assignment)) || null;
    } else {
      console.warn("[contractor-job-flow] Unable to search client contracts", error);
    }
  }

  return details;
}

function resolvedPropertyName(assignment) {
  const portalTitle = directoryPropertyTitle(activeDirectoryDetails?.portalProperty, true);
  const clientTitle = directoryPropertyTitle(activeDirectoryDetails?.client);
  const assignmentTitle = assignmentPropertyTitle(assignment);
  const clientPerson = directoryPersonTitle(activeDirectoryDetails?.client);
  if (portalTitle) return portalTitle;
  if (assignmentTitle && normalizeText(assignmentTitle) !== normalizeText(clientPerson)) return assignmentTitle;
  return clientTitle
    || assignmentTitle
    || directoryPersonTitle(activeDirectoryDetails?.client)
    || assignment?.title
    || "Assignment";
}

function resolvedAddress(assignment) {
  return assignmentAddress(assignment)
    || compactAddress(activeDirectoryDetails?.contract)
    || compactAddress(activeDirectoryDetails?.portalProperty)
    || compactAddress(activeDirectoryDetails?.client)
    || "";
}

function resolvedAccessNotes(assignment) {
  return directoryAccessNotes(activeDirectoryDetails?.contract)
    || metadataValue(assignment, ["access_notes", "entry_notes", "gate_code", "special_instructions"])
    || directoryAccessNotes(activeDirectoryDetails?.client)
    || directoryAccessNotes(activeDirectoryDetails?.portalProperty)
    || "";
}

function detailGrid(rows) {
  return `
    <div class="tj-detail-grid">
      ${rows.map(([label, value]) => `
        <div>
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value || "Not listed")}</strong>
        </div>
      `).join("")}
    </div>
  `;
}

function detailNote(label, value, fallback = "Not listed") {
  return `
    <div class="tj-detail-note">
      <span>${escapeHtml(label)}</span>
      <p>${escapeHtml(value || fallback)}</p>
    </div>
  `;
}

function detailTextarea(label, id, value, placeholder) {
  return `
    <label class="tj-detail-field">
      <span>${escapeHtml(label)}</span>
      <textarea id="${escapeHtml(id)}" rows="4" placeholder="${escapeHtml(placeholder)}">${escapeHtml(value || "")}</textarea>
    </label>
  `;
}

function startDetailContent(tabKey) {
  const assignment = activeAssignment || {};
  const issueText = metadataValue(assignment, [
    "issue_notes",
    "issues",
    "damage_notes",
    "blocked_areas",
    "access_issue",
    "property_issue"
  ]);
  const unit = assignmentUnit(assignment);
  const attachmentCount = getDetailCount(assignment, ["attachments", "files", "photos", "videos"]);

  if (tabKey === "issues") {
    return `
      ${detailGrid([
        ["Current Status", formatStatus(assignment.status)],
        ["Priority", formatStatus(assignment.priority || "normal")],
        ["Blocked Areas", metadataValue(assignment, ["blocked_areas"]) || "None logged"],
        ["Attachments", String(attachmentCount)]
      ])}
      ${detailNote("Known Issues", issueText, "No known property issues have been logged for this assignment.")}
      ${detailTextarea("Report Issues Found So Far", "tjIssueNotes", activeIssueDraft, "Leaks, damage, access problems, safety concerns, missing supplies, etc.")}
    `;
  }

  if (tabKey === "property") {
    return `
      ${detailGrid([
        ["Property Name", resolvedPropertyName(assignment)],
        ["Unit", unit || "No unit selected"],
        ["Address", resolvedAddress(assignment) || "Address not set"]
      ])}
      ${detailNote("Access Notes", resolvedAccessNotes(assignment), "No access notes are listed.")}
    `;
  }

  return "";
}

function getDetailCount(assignment, keys) {
  const metadata = assignment?.metadata && typeof assignment.metadata === "object" ? assignment.metadata : {};
  for (const key of keys) {
    const value = assignment?.[key] ?? metadata[key];
    if (Array.isArray(value)) return value.length;
    if (value && typeof value === "object") return Object.keys(value).length;
    if (Number.isFinite(Number(value))) return Number(value);
  }
  return 0;
}

function setStartDetailPanel(tabKey = "property", forceOpen = true) {
  if (!activeAssignment) return;
  const targetButton = document.querySelector(`[data-tj-detail="${selectorValue(tabKey)}"]`);
  const isCurrentlyOpen = targetButton?.getAttribute("aria-expanded") === "true";
  const shouldOpenTarget = forceOpen || !isCurrentlyOpen;

  document.querySelectorAll("[data-tj-detail]").forEach((button) => {
    const key = button.dataset.tjDetail;
    const panel = document.querySelector(`[data-tj-panel="${selectorValue(key)}"]`);
    const isActive = key === tabKey && shouldOpenTarget;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-expanded", String(isActive));
    if (panel) {
      panel.hidden = !isActive;
      panel.innerHTML = isActive
        ? `<div class="tj-detail-panel-inner">${startDetailContent(key)}</div>`
        : "";
    }
  });
}

async function geocodeAddress(address) {
  const trimmed = String(address || "").trim();
  if (!trimmed) return null;
  const cacheKey = trimmed.toLowerCase();
  if (geocodeCache.has(cacheKey)) return geocodeCache.get(cacheKey);

  try {
    const params = new URLSearchParams({ format: "json", limit: "1", q: trimmed });
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      headers: { Accept: "application/json" }
    });
    if (!response.ok) return null;

    const results = await response.json();
    const first = Array.isArray(results) ? results[0] : null;
    if (!isCoordinate(first?.lat, first?.lon)) return null;

    const coordinates = { latitude: Number(first.lat), longitude: Number(first.lon) };
    geocodeCache.set(cacheKey, coordinates);
    return coordinates;
  } catch {
    return null;
  }
}

function resolveSite(assignment) {
  activeSite = getAssignmentCoordinates(assignment);
  if (!activeSite) {
    geocodeAddress(resolvedAddress(assignment) || assignment?.address).then((site) => {
      if (site) activeSite = site;
    });
  }
}

async function currentUser() {
  const { data } = await supabase.auth.getUser();
  return data?.user || null;
}

async function fetchAssignment(assignmentId) {
  const { data, error } = await supabase
    .from("assignment_blocks")
    .select("*")
    .eq("id", assignmentId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function checklistItems(assignment) {
  if (Array.isArray(assignment?.property_checklist_items) && assignment.property_checklist_items.length) {
    return normalizeChecklistItems(assignment.property_checklist_items);
  }
  const unitItems = await unitChecklistItems(assignment);
  if (unitItems.length) return normalizeChecklistItems(unitItems);
  const propertyId = assignment?.property_id || assignment?.portal_property_id || assignment?.metadata?.property_id || assignment?.metadata?.portal_property_id || "";
  if (!propertyId) return [];

  for (const table of ["portal_properties", "properties"]) {
    const { data, error } = await supabase
      .from(table)
      .select("checklist_items")
      .eq("id", propertyId)
      .maybeSingle();

    if (!error && Array.isArray(data?.checklist_items)) return normalizeChecklistItems(data.checklist_items);
  }

  return [];
}

async function unitChecklistItems(assignment) {
  if (!supabase) return [];
  const unitId = assignmentUnitId(assignment);
  if (unitId) {
    const { data, error } = await supabase
      .from("property_units")
      .select("checklist_items")
      .eq("id", unitId)
      .maybeSingle();
    if (!error && Array.isArray(data?.checklist_items) && data.checklist_items.length) {
      return data.checklist_items;
    }
    if (error) console.warn("[contractor-job-flow] Unable to load unit checklist", error);
  }

  const unitLabel = normalizeText(assignmentUnit(assignment));
  if (!unitLabel) return [];

  let query = supabase
    .from("property_units")
    .select("property_id,unit_name,checklist_items")
    .limit(500);
  const propertyKeys = assignmentUnitPropertyKeys(assignment);
  if (propertyKeys.length) query = query.in("property_id", propertyKeys);

  const { data, error } = await query;
  if (error) {
    console.warn("[contractor-job-flow] Unable to search unit checklists", error);
    return [];
  }

  const match = (data || []).find((row) => normalizeText(row.unit_name) === unitLabel && Array.isArray(row.checklist_items) && row.checklist_items.length);
  return match?.checklist_items || [];
}

function showPageMessage(text) {
  const target = document.getElementById("claimMessage") || document.getElementById("message");
  if (target) target.textContent = text;
}

function injectStyles() {
  if (document.getElementById("turnlyMobileJobFlowStyles")) return;
  document.head.insertAdjacentHTML("beforeend", `
    <style id="turnlyMobileJobFlowStyles">
      .tj-modal {
        align-items: center;
        background: rgba(2, 8, 15, .78);
        backdrop-filter: blur(12px);
        display: flex;
        inset: 0;
        justify-content: center;
        padding: 18px;
        position: fixed;
        z-index: 300;
      }
      .tj-modal[hidden] { display: none; }
      .tj-panel {
        background: #0b1724;
        border: 1px solid rgba(144, 164, 183, .22);
        border-radius: 12px;
        box-shadow: 0 30px 90px rgba(0, 0, 0, .45);
        color: #eef5fb;
        max-height: calc(100vh - 36px);
        overflow: auto;
        width: min(100%, 940px);
      }
      .tj-map {
        background: rgba(8, 19, 33, .92);
        min-height: 330px;
        overflow: hidden;
        position: relative;
      }
      .tj-map iframe,
      .tj-map-empty {
        border: 0;
        height: 100%;
        inset: 0;
        position: absolute;
        width: 100%;
      }
      .tj-map-empty {
        align-items: center;
        background: linear-gradient(135deg, rgba(31, 226, 138, .12), rgba(11, 23, 36, .98));
        display: flex;
        justify-content: center;
        padding: 24px;
        text-align: center;
      }
      .tj-map-action {
        align-items: center;
        background: rgba(6, 16, 28, .76);
        border: 1px solid rgba(255, 255, 255, .16);
        border-radius: 999px;
        color: #fff;
        display: inline-flex;
        font-size: 24px;
        font-weight: 900;
        height: 54px;
        justify-content: center;
        position: absolute;
        text-decoration: none;
        top: 20px;
        width: 54px;
        z-index: 2;
      }
      .tj-map-action:hover {
        border-color: rgba(31, 226, 138, .58);
        color: var(--admin-green, #1fe28a);
      }
      .tj-back { left: 20px; }
      .tj-directions { right: 20px; }
      .tj-map-label {
        background: linear-gradient(180deg, rgba(7, 16, 27, 0), rgba(7, 16, 27, .94));
        bottom: 0;
        display: grid;
        gap: 8px;
        left: 0;
        padding: 70px 28px 26px;
        position: absolute;
        right: 0;
        z-index: 1;
      }
      .tj-map-label strong {
        font-size: clamp(24px, 4vw, 38px);
        line-height: 1.05;
        text-transform: uppercase;
      }
      .tj-map-label span {
        color: rgba(255, 255, 255, .82);
        font-size: 18px;
      }
      .tj-details,
      .tj-actions {
        background: linear-gradient(180deg, rgba(19, 33, 49, .98), rgba(11, 23, 36, .98));
        display: grid;
        gap: 22px;
        padding: 26px;
      }
      .tj-title {
        align-items: start;
        display: grid;
        gap: 14px;
        grid-template-columns: minmax(0, 1fr) auto;
      }
      .tj-title h2 {
        color: #fff;
        font-size: clamp(28px, 4vw, 46px);
        line-height: 1.08;
        margin: 0;
      }
      .tj-badge {
        background: rgba(31, 226, 138, .14);
        border: 1px solid rgba(31, 226, 138, .42);
        border-radius: 999px;
        color: var(--admin-green, #1fe28a);
        font-size: 12px;
        font-weight: 900;
        padding: 10px 14px;
        text-transform: uppercase;
        white-space: nowrap;
      }
      .tj-block {
        display: grid;
        gap: 8px;
      }
      .tj-block h3,
      .tj-section h3 {
        color: #fff;
        font-size: 18px;
        margin: 0;
      }
      .tj-block p,
      .tj-location {
        color: var(--admin-muted, #9aaabc);
        line-height: 1.65;
        margin: 0;
      }
      .tj-due {
        color: #d8e2ee;
        font-size: 16px;
        font-weight: 800;
      }
      .tj-stats {
        display: grid;
        gap: 12px;
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
      .tj-stat {
        background: rgba(255, 255, 255, .045);
        border: 1px solid rgba(255, 255, 255, .08);
        border-radius: 8px;
        display: grid;
        gap: 8px;
        justify-items: center;
        min-height: 112px;
        padding: 16px;
        text-align: center;
      }
      .tj-stat strong {
        color: var(--admin-green, #1fe28a);
        font-size: 22px;
      }
      .tj-stat span {
        color: var(--admin-muted, #9aaabc);
        font-weight: 800;
      }
      .tj-section {
        border-top: 1px solid rgba(255, 255, 255, .08);
        display: grid;
        gap: 8px;
        padding-top: 18px;
      }
      .tj-row {
        align-items: center;
        background: transparent;
        border-bottom: 1px solid rgba(255, 255, 255, .08);
        border-left: 0;
        border-right: 0;
        border-top: 0;
        color: #fff;
        cursor: pointer;
        display: grid;
        font: inherit;
        gap: 12px;
        grid-template-columns: minmax(0, 1fr) auto;
        min-height: 60px;
        padding: 0;
        text-align: left;
        width: 100%;
      }
      .tj-row:hover,
      .tj-row.active {
        color: var(--admin-green, #1fe28a);
      }
      .tj-row span {
        color: var(--admin-muted, #9aaabc);
        font-size: 20px;
        transition: transform .16s ease, color .16s ease;
      }
      .tj-row.active span {
        color: var(--admin-green, #1fe28a);
        transform: rotate(90deg);
      }
      .tj-detail-panel {
        padding: 0 0 10px;
      }
      .tj-detail-panel[hidden] { display: none; }
      .tj-detail-panel-inner {
        background: rgba(255, 255, 255, .045);
        border: 1px solid rgba(255, 255, 255, .08);
        border-radius: 8px;
        display: grid;
        gap: 12px;
        padding: 14px;
      }
      .tj-detail-grid span,
      .tj-detail-note span,
      .tj-detail-field span {
        color: var(--admin-muted, #9aaabc);
        font-size: 12px;
        font-weight: 900;
        text-transform: uppercase;
      }
      .tj-detail-grid {
        display: grid;
        gap: 10px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .tj-detail-grid div,
      .tj-detail-note {
        background: rgba(5, 14, 24, .56);
        border: 1px solid rgba(255, 255, 255, .055);
        border-radius: 8px;
        padding: 12px;
      }
      .tj-detail-grid strong {
        display: block;
        margin-top: 5px;
      }
      .tj-detail-note p {
        color: #d8e2ee;
        line-height: 1.55;
        margin: 6px 0 0;
      }
      .tj-detail-field {
        display: grid;
        gap: 8px;
      }
      .tj-actions {
        background: rgba(7, 16, 27, .96);
        border-top: 1px solid rgba(255, 255, 255, .08);
        gap: 12px;
      }
      .tj-note,
      .tc-note {
        color: #d8e2ee;
        display: grid;
        font-weight: 800;
        gap: 8px;
      }
      .tj-note textarea,
      .tc-note textarea,
      .tj-detail-field textarea {
        background: rgba(5, 14, 24, .86);
        border: 1px solid rgba(144, 164, 183, .22);
        border-radius: 8px;
        color: #eef5fb;
        font: inherit;
        line-height: 1.45;
        min-height: 96px;
        padding: 12px;
        resize: vertical;
        width: 100%;
      }
      .tj-note textarea::placeholder,
      .tc-note textarea::placeholder,
      .tj-detail-field textarea::placeholder {
        color: rgba(154, 170, 188, .8);
      }
      .tj-action-row,
      .tc-action-row,
      .tj-location-row {
        align-items: center;
        display: flex;
        gap: 12px;
        justify-content: space-between;
      }
      .tc-panel {
        background: linear-gradient(145deg, rgba(30, 45, 64, .98), rgba(13, 25, 40, .98));
        border: 1px solid rgba(144, 164, 183, .22);
        border-radius: 12px;
        box-shadow: 0 30px 90px rgba(0, 0, 0, .45);
        color: #eef5fb;
        display: grid;
        gap: 16px;
        max-height: calc(100vh - 36px);
        overflow: auto;
        padding: 18px;
        width: min(100%, 760px);
      }
      .tc-header,
      .tc-summary {
        align-items: center;
        display: flex;
        gap: 12px;
        justify-content: space-between;
      }
      .tc-kicker {
        color: var(--admin-green, #1fe28a);
        font-size: 12px;
        font-weight: 900;
        letter-spacing: .08em;
        margin: 0;
        text-transform: uppercase;
      }
      .tc-summary {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .tc-summary div,
      .tc-item,
      .tj-active-panel {
        background: rgba(255, 255, 255, .045);
        border: 1px solid rgba(255, 255, 255, .055);
        border-radius: 8px;
        padding: 13px;
      }
      .tc-summary span {
        color: var(--admin-muted, #9aaabc);
        display: block;
        font-size: 12px;
        font-weight: 800;
        margin-bottom: 5px;
        text-transform: uppercase;
      }
      .tc-form,
      .tc-item,
      .tj-active-panel {
        display: grid;
        gap: 12px;
      }
      .tc-task {
        align-items: start;
        display: grid;
        gap: 12px;
        grid-template-columns: 22px minmax(0, 1fr) auto;
      }
      .tc-task input {
        height: 20px;
        width: 20px;
      }
      .tc-task small {
        color: var(--admin-muted, #9aaabc);
        display: block;
        font-size: 12px;
        margin-top: 4px;
      }
      .tc-media {
        border: 1px solid currentColor;
        border-radius: 999px;
        color: var(--admin-blue, #32aaff);
        font-size: 12px;
        font-weight: 900;
        padding: 8px 10px;
        text-transform: capitalize;
      }
      .tc-upload {
        background: rgba(5, 14, 24, .58);
        border: 1px dashed rgba(50, 170, 255, .4);
        border-radius: 8px;
        color: #d8e2ee;
        display: grid;
        font-weight: 800;
        gap: 8px;
        padding: 12px;
      }
      .tc-upload input {
        background: rgba(5, 14, 24, .88);
        border: 1px solid rgba(144, 164, 183, .22);
        border-radius: 8px;
        color: #eef5fb;
        font: inherit;
        min-height: 42px;
        padding: 9px;
        width: 100%;
      }
      .tc-upload small {
        color: var(--admin-muted, #9aaabc);
        display: block;
        font-size: 12px;
        font-weight: 700;
      }
      .tc-panel {
        background:
          linear-gradient(180deg, rgba(6, 17, 29, .96), rgba(4, 14, 24, .98)),
          radial-gradient(circle at 50% 10%, rgba(50, 170, 255, .16), transparent 34%);
        border: 1px solid rgba(144, 164, 183, .22);
        border-radius: 8px;
        box-sizing: border-box;
        color: #f4f8fc;
        display: grid;
        grid-template-rows: auto 1fr auto;
        height: min(100vh, 920px);
        max-height: calc(100vh - 24px);
        overflow: hidden;
        padding: 0;
        position: relative;
        width: min(100vw, 560px);
      }
      .tc-panel *,
      .tc-panel *::before,
      .tc-panel *::after {
        box-sizing: border-box;
      }
      .tc-shell {
        display: grid;
        gap: 20px;
        min-width: 0;
        overflow: auto;
        padding: 26px 18px 150px;
        width: 100%;
      }
      .tc-topbar {
        align-items: center;
        display: grid;
        gap: 12px;
        grid-template-columns: 54px minmax(0, 1fr) 54px;
        min-width: 0;
      }
      .tc-topbar h2 {
        color: #fff;
        font-size: clamp(28px, 7vw, 42px);
        line-height: 1.08;
        margin: 0;
        min-width: 0;
        overflow-wrap: anywhere;
        text-align: center;
      }
      .tc-icon-button {
        align-items: center;
        background: rgba(13, 28, 45, .72);
        border: 1px solid rgba(144, 164, 183, .28);
        border-radius: 8px;
        color: #f4f8fc;
        cursor: pointer;
        display: inline-flex;
        font: inherit;
        font-size: 26px;
        font-weight: 900;
        height: 54px;
        justify-content: center;
        padding: 0;
        width: 54px;
      }
      .tc-icon-button:hover {
        border-color: rgba(18, 217, 155, .62);
        color: var(--cp-green, #12d99b);
      }
      .tc-hamburger {
        display: grid;
        gap: 5px;
        justify-items: center;
      }
      .tc-hamburger span {
        background: currentColor;
        border-radius: 999px;
        display: block;
        height: 3px;
        width: 24px;
      }
      .tc-progress {
        display: grid;
        gap: 8px;
      }
      .tc-progress small {
        color: #9db2c9;
        font-size: 13px;
        font-weight: 800;
        text-align: center;
      }
      .tc-progress-track {
        background: rgba(144, 164, 183, .14);
        border-radius: 999px;
        height: 8px;
        overflow: hidden;
      }
      .tc-progress-track span {
        background: linear-gradient(90deg, #12d99b, #08c7d7);
        display: block;
        height: 100%;
        transition: width .22s ease;
        width: 0;
      }
      .tc-step-content {
        display: grid;
        gap: 18px;
        min-width: 0;
      }
      .tc-checklist-card,
      .tc-empty {
        background: rgba(18, 34, 53, .74);
        border: 1px solid rgba(144, 164, 183, .24);
        border-radius: 8px;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, .03), 0 22px 70px rgba(0, 0, 0, .28);
        display: grid;
        gap: 18px;
        min-width: 0;
        padding: 18px;
      }
      .tc-card-title {
        align-items: center;
        display: grid;
        gap: 12px;
        grid-template-columns: 44px minmax(0, 1fr);
        min-width: 0;
      }
      .tc-card-title strong {
        color: #fff;
        display: block;
        font-size: 24px;
      }
      .tc-card-title small {
        color: #9db2c9;
        display: block;
        margin-top: 4px;
      }
      .tc-card-icon {
        align-items: center;
        border: 1px solid rgba(18, 217, 155, .38);
        border-radius: 8px;
        color: var(--cp-green, #12d99b);
        display: inline-flex;
        font-size: 22px;
        height: 44px;
        justify-content: center;
        width: 44px;
      }
      .tc-task-list {
        display: grid;
        min-width: 0;
      }
      .tc-task-card {
        border-top: 1px solid rgba(144, 164, 183, .14);
        display: grid;
        gap: 12px;
        min-width: 0;
        padding: 14px 0;
      }
      .tc-task-card:first-child {
        border-top: 0;
        padding-top: 0;
      }
      .tc-check-row {
        align-items: start;
        cursor: pointer;
        display: grid;
        gap: 12px;
        grid-template-columns: 30px minmax(0, 1fr);
        min-width: 0;
      }
      .tc-check-row input {
        height: 1px;
        opacity: 0;
        position: absolute;
        width: 1px;
      }
      .tc-check-box {
        border: 2px solid rgba(157, 178, 201, .88);
        border-radius: 8px;
        height: 28px;
        margin-top: 2px;
        width: 28px;
      }
      .tc-check-row input:checked + .tc-check-box {
        background: linear-gradient(135deg, #12d99b, #08c7d7);
        border-color: transparent;
        box-shadow: inset 0 0 0 6px rgba(6, 17, 29, .9);
      }
      .tc-check-copy strong {
        color: #f4f8fc;
        display: block;
        font-size: 20px;
        line-height: 1.35;
        overflow-wrap: anywhere;
      }
      .tc-check-copy small,
      .tc-standard,
      .tc-item-note span {
        color: #9db2c9;
      }
      .tc-check-copy small {
        display: block;
        font-size: 12px;
        font-weight: 800;
        margin-top: 5px;
        text-transform: uppercase;
      }
      .tc-standard {
        line-height: 1.5;
        margin: 0 0 0 42px;
      }
      .tc-item-note {
        display: grid;
        gap: 7px;
        margin-left: 42px;
      }
      .tc-item-note span {
        font-size: 12px;
        font-weight: 900;
        text-transform: uppercase;
      }
      .tc-item-note textarea {
        background: rgba(5, 14, 24, .78);
        border: 1px solid rgba(144, 164, 183, .22);
        border-radius: 8px;
        color: #eef5fb;
        font: inherit;
        min-height: 68px;
        padding: 10px 12px;
        resize: vertical;
      }
      .tc-upload-card {
        background: rgba(18, 34, 53, .78);
        border: 1px solid rgba(144, 164, 183, .24);
        border-radius: 8px;
        cursor: pointer;
        display: block;
        margin-top: 4px;
        padding: 14px;
        width: 100%;
      }
      .tc-upload-card input {
        height: 1px;
        opacity: 0;
        position: absolute;
        width: 1px;
      }
      .tc-upload-frame {
        align-items: center;
        border: 2px dashed rgba(94, 126, 159, .72);
        border-radius: 8px;
        display: grid;
        justify-items: center;
        min-height: clamp(190px, 34vh, 230px);
        padding: 30px 18px;
        text-align: center;
        width: 100%;
      }
      .tc-upload-icon {
        align-items: center;
        background: rgba(18, 217, 155, .08);
        border: 1px solid rgba(18, 217, 155, .35);
        border-radius: 50%;
        color: var(--cp-green, #12d99b);
        display: inline-flex;
        font-size: 42px;
        height: 92px;
        justify-content: center;
        margin-bottom: 18px;
        width: 92px;
      }
      .tc-upload-frame strong {
        color: #fff;
        font-size: clamp(22px, 6vw, 28px);
        overflow-wrap: anywhere;
      }
      .tc-upload-frame em,
      .tc-upload-frame small {
        color: #9db2c9;
        font-style: normal;
        margin-top: 10px;
      }
      .tc-upload-frame small {
        font-size: 16px;
      }
      .tc-upload-frame b {
        color: var(--cp-green, #12d99b);
        font-size: 13px;
        margin-top: 12px;
        overflow-wrap: anywhere;
      }
      .tc-step-actions {
        background: linear-gradient(180deg, rgba(4, 14, 24, 0), rgba(4, 14, 24, .98) 18%);
        bottom: 0;
        display: grid;
        gap: 12px;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        left: 0;
        padding: 28px 18px 20px;
        position: absolute;
        right: 0;
        width: 100%;
      }
      .tc-step-actions button {
        align-items: center;
        border-radius: 8px;
        cursor: pointer;
        display: inline-flex;
        font: inherit;
        font-size: clamp(18px, 5.6vw, 22px);
        font-weight: 900;
        gap: 12px;
        justify-content: center;
        min-height: 68px;
        min-width: 0;
        white-space: nowrap;
      }
      .tc-step-actions button:disabled {
        cursor: not-allowed;
        opacity: .45;
      }
      .tc-back-btn {
        background: rgba(13, 28, 45, .72);
        border: 1px solid rgba(144, 164, 183, .28);
        color: #f4f8fc;
      }
      .tc-next-btn {
        background: linear-gradient(135deg, #16ddb0, #05c7a9);
        border: 0;
        color: #03151e;
      }
      .tc-message {
        color: #9db2c9;
        font-weight: 800;
        margin: 0;
        min-height: 22px;
        text-align: center;
      }
      .tc-message[data-tone="error"] {
        color: var(--cp-red, #ff6470);
      }
      .tc-overview {
        background: rgba(2, 8, 15, .72);
        inset: 0;
        position: absolute;
        z-index: 4;
      }
      .tc-overview[hidden] {
        display: none;
      }
      .tc-overview-panel {
        background: #091827;
        border-left: 1px solid rgba(144, 164, 183, .24);
        box-shadow: -18px 0 60px rgba(0, 0, 0, .32);
        display: grid;
        gap: 16px;
        height: 100%;
        margin-left: auto;
        overflow: auto;
        padding: 22px 18px;
        width: min(86vw, 360px);
      }
      .tc-overview-head {
        align-items: center;
        display: flex;
        justify-content: space-between;
      }
      .tc-overview-head h3 {
        color: #fff;
        margin: 0;
      }
      .tc-module-list {
        display: grid;
        gap: 9px;
      }
      .tc-module-link {
        align-items: center;
        background: rgba(18, 34, 53, .72);
        border: 1px solid rgba(144, 164, 183, .18);
        border-radius: 8px;
        color: #f4f8fc;
        cursor: pointer;
        display: grid;
        font: inherit;
        gap: 10px;
        grid-template-columns: minmax(0, 1fr) auto;
        padding: 14px;
        text-align: left;
      }
      .tc-module-link.active {
        border-color: rgba(18, 217, 155, .62);
      }
      .tc-module-link.complete strong {
        color: var(--cp-green, #12d99b);
      }
      .tj-active-panel {
        margin: 10px 0 18px;
      }
      .tj-active-panel button {
        justify-self: start;
      }
      @media (max-width: 760px) {
        .tj-modal {
          align-items: stretch;
          padding: 0;
        }
        .tj-panel,
        .tc-panel {
          border: 0;
          border-radius: 0;
          height: 100dvh;
          max-height: 100dvh;
          width: 100vw;
        }
        .tc-shell {
          padding: calc(18px + env(safe-area-inset-top, 0px)) max(14px, env(safe-area-inset-right, 0px)) calc(132px + env(safe-area-inset-bottom, 0px)) max(14px, env(safe-area-inset-left, 0px));
        }
        .tc-topbar {
          grid-template-columns: 50px minmax(0, 1fr) 50px;
        }
        .tc-icon-button {
          height: 50px;
          width: 50px;
        }
        .tc-step-actions {
          padding: 22px max(14px, env(safe-area-inset-right, 0px)) calc(16px + env(safe-area-inset-bottom, 0px)) max(14px, env(safe-area-inset-left, 0px));
        }
        .tc-step-actions button {
          min-height: 62px;
        }
        .tj-map {
          min-height: 42vh;
        }
        .tj-map-action {
          height: 48px;
          top: 16px;
          width: 48px;
        }
        .tj-back { left: 16px; }
        .tj-directions { right: 16px; }
        .tj-map-label {
          padding: 62px 20px 20px;
        }
        .tj-map-label strong {
          font-size: 28px;
        }
        .tj-title,
        .tj-stats,
        .tj-detail-grid,
        .tc-summary,
        .tc-task,
        .tj-action-row,
        .tc-action-row,
        .tj-location-row {
          align-items: stretch;
          display: grid;
          grid-template-columns: 1fr;
        }
        .tj-badge,
        .tc-media {
          justify-self: start;
        }
        .tj-details,
        .tj-actions {
          padding: 22px 18px;
        }
      }
    </style>
  `);
}

function ensureStartModal() {
  injectStyles();
  let modal = document.getElementById("turnlyMobileStartModal");
  if (modal) return modal;

  document.body.insertAdjacentHTML("beforeend", `
    <div id="turnlyMobileStartModal" class="tj-modal" role="dialog" aria-modal="true" hidden>
      <div class="tj-panel">
        <section class="tj-map" aria-label="Job site map">
          <div id="tjMapFrame"></div>
          <button type="button" class="tj-map-action tj-back" data-tj-close aria-label="Back">&larr;</button>
          <a id="tjDirections" class="tj-map-action tj-directions" href="#" target="_blank" rel="noopener" aria-label="Open directions">&#x21B1;</a>
          <div class="tj-map-label">
            <strong id="tjProperty">Assignment</strong>
            <span id="tjAddress">Address not set</span>
          </div>
        </section>

        <section class="tj-details">
          <div class="tj-title">
            <h2 id="tjTitle">Turnly Checklist</h2>
            <span id="tjBadge" class="tj-badge">Ready</span>
          </div>

          <div class="tj-block">
            <h3>Due on</h3>
            <div id="tjDue" class="tj-due">Not scheduled</div>
          </div>

          <div class="tj-block">
            <h3>Description</h3>
            <p id="tjDescription">Complete the assigned checklist for this property before finishing the job.</p>
          </div>

          <div class="tj-stats">
            <div class="tj-stat"><strong id="tjRequirements">0/0</strong><span>Requirements</span></div>
            <div class="tj-stat"><strong id="tjAttachments">0</strong><span>Attachments</span></div>
            <div class="tj-stat"><strong id="tjComments">0</strong><span>Comments</span></div>
          </div>

          <div class="tj-section">
            <h3>Property</h3>
            <button class="tj-row" type="button" data-tj-detail="issues" aria-expanded="false" aria-controls="tjIssuesPanel"><strong>Issues</strong><span class="tj-row-arrow" aria-hidden="true">&rsaquo;</span></button>
            <div id="tjIssuesPanel" class="tj-detail-panel" data-tj-panel="issues" hidden></div>
            <button class="tj-row" type="button" data-tj-detail="property" aria-expanded="false" aria-controls="tjPropertyPanel"><strong>Property details</strong><span class="tj-row-arrow" aria-hidden="true">&rsaquo;</span></button>
            <div id="tjPropertyPanel" class="tj-detail-panel" data-tj-panel="property" hidden></div>
          </div>
        </section>

        <section class="tj-actions">
          <label class="tj-note">
            Start note
            <textarea id="tjStartNotes" rows="3" placeholder="Gate code used, supply issue, site condition, etc."></textarea>
          </label>
          <div class="tj-location-row">
            <button type="button" class="secondary-btn" id="tjUseLocation">Use Current Location</button>
            <p id="tjLocation" class="tj-location">Location is optional. You can start this job now.</p>
          </div>
          <p id="tjMessage" class="status-message" aria-live="polite"></p>
          <div class="tj-action-row">
            <button type="button" class="secondary-btn" data-tj-close>Not Yet</button>
            <button type="button" class="primary-btn" id="tjStart">Start Job</button>
          </div>
        </section>
      </div>
    </div>
  `);

  modal = document.getElementById("turnlyMobileStartModal");
  modal.querySelectorAll("[data-tj-close]").forEach((button) => {
    button.addEventListener("click", closeStartModal);
  });
  document.getElementById("tjUseLocation")?.addEventListener("click", captureLocation);
  document.getElementById("tjStart")?.addEventListener("click", startJob);
  modal.addEventListener("click", (event) => {
    const detailButton = event.target.closest("[data-tj-detail]");
    if (detailButton && modal.contains(detailButton)) {
      setStartDetailPanel(detailButton.dataset.tjDetail, false);
    }
  });
  modal.addEventListener("input", (event) => {
    if (event.target?.id === "tjIssueNotes") {
      activeIssueDraft = event.target.value || "";
    }
  });
  return modal;
}

async function captureLocation() {
  const status = document.getElementById("tjLocation");
  const button = document.getElementById("tjUseLocation");

  if (!navigator.geolocation) {
    if (status) status.textContent = "Location is not available on this device.";
    return;
  }

  if (button) button.disabled = true;
  if (status) status.textContent = "Getting current location...";

  try {
    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 12000
      });
    });
    activePosition = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy
    };
    if (status) status.textContent = `Location captured (${Math.round(position.coords.accuracy)}m accuracy).`;
  } catch (error) {
    activePosition = null;
    if (status) status.textContent = error?.message || "Location was not shared. You can still start this job.";
  } finally {
    if (button) button.disabled = false;
  }
}

async function openStartModal(assignmentId) {
  activeUser = await currentUser();
  if (!activeUser) throw new Error("Please sign in again before starting this job.");

  activeAssignment = await fetchAssignment(assignmentId);
  if (!activeAssignment) throw new Error("This assignment could not be loaded.");
  activePosition = null;
  activeSite = null;
  activeQaJobId = assignmentQaJobId(activeAssignment);
  activeDirectoryDetails = await fetchDirectoryDetails(activeAssignment);
  activeIssueDraft = "";
  const items = await checklistItems(activeAssignment);
  activeChecklistItems = items;
  const property = resolvedPropertyName(activeAssignment);
  const address = resolvedAddress(activeAssignment) || "Address not set";
  const embed = mapUrl(activeAssignment, true);

  const modal = ensureStartModal();
  document.getElementById("tjMapFrame").innerHTML = embed
    ? `<iframe title="Pinned job site map" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="${escapeHtml(embed)}"></iframe>`
    : `<div class="tj-map-empty"><strong>Property address is needed before a map can be shown.</strong></div>`;
  document.getElementById("tjDirections").href = mapUrl(activeAssignment, false) || "#";
  document.getElementById("tjProperty").textContent = property;
  document.getElementById("tjAddress").textContent = address;
  document.getElementById("tjTitle").textContent = checklistTitle(activeAssignment);
  document.getElementById("tjBadge").textContent = activeAssignment.priority || activeAssignment.service_type || "Ready";
  document.getElementById("tjDue").textContent = dueLabel(activeAssignment);
  document.getElementById("tjDescription").textContent = description(activeAssignment);
  document.getElementById("tjRequirements").textContent = `${items.length}/${items.length}`;
  document.getElementById("tjAttachments").textContent = String(getDetailCount(activeAssignment, ["attachments", "files", "photos", "videos"]));
  document.getElementById("tjComments").textContent = String(getDetailCount(activeAssignment, ["comments", "notes_thread", "messages"]));
  document.getElementById("tjStartNotes").value = "";
  document.getElementById("tjMessage").textContent = "";
  document.getElementById("tjLocation").textContent = "Location is optional. You can start this job now.";
  setStartDetailPanel("property");
  modal.hidden = false;
  resolveSite(activeAssignment);
}

function closeStartModal() {
  const modal = document.getElementById("turnlyMobileStartModal");
  if (modal) modal.hidden = true;
  activeChecklistItems = [];
  activeChecklistModules = [];
  activeChecklistDrafts = [];
  activeQaJobId = null;
  activeDirectoryDetails = null;
  activeIssueDraft = "";
}

async function startJob() {
  const button = document.getElementById("tjStart");
  const message = document.getElementById("tjMessage");
  if (!activeAssignment || !activeUser) {
    if (message) message.textContent = "This job could not be loaded. Try opening it again.";
    return;
  }

  if (button) button.disabled = true;
  if (message) message.textContent = "Starting job...";

  const now = new Date().toISOString();
  const issueNotes = (document.getElementById("tjIssueNotes")?.value || activeIssueDraft || "").trim();
  const userName = activeUser.user_metadata?.full_name || activeUser.email?.split("@")[0] || "Contractor";
  const payload = {
    status: "in_progress",
    claimed_by: activeUser.id,
    claimed_by_name: userName,
    claimed_by_email: activeUser.email || null,
    claimed_at: activeAssignment.claimed_at || now,
    started_at: now,
    started_by: activeUser.id,
    start_notes: document.getElementById("tjStartNotes")?.value.trim() || null
  };

  const accessNotes = resolvedAccessNotes(activeAssignment);
  if (issueNotes || accessNotes) {
    const metadata = activeAssignment.metadata && typeof activeAssignment.metadata === "object"
      ? { ...activeAssignment.metadata }
      : {};
    if (issueNotes) {
      metadata.contractor_start_issues = issueNotes;
      metadata.latest_contractor_issue = issueNotes;
      metadata.issue_reported_at = now;
      metadata.issue_reported_by = activeUser.id;
    }
    if (accessNotes) metadata.access_notes = accessNotes;
    payload.metadata = metadata;
  }

  if (activePosition) {
    payload.start_latitude = activePosition.latitude;
    payload.start_longitude = activePosition.longitude;
    payload.start_location_accuracy = activePosition.accuracy;
  }
  if (activeSite) {
    payload.site_latitude = activeSite.latitude;
    payload.site_longitude = activeSite.longitude;
  }

  const miles = activePosition && activeSite ? distanceMiles(activePosition, activeSite) : null;
  if (miles !== null) payload.start_distance_miles = Number(miles.toFixed(4));

  const { data, error } = await supabase
    .from("assignment_blocks")
    .update(payload)
    .eq("id", activeAssignment.id)
    .or(`claimed_by.eq.${activeUser.id},assigned_to.eq.${activeUser.id}`)
    .in("status", ["claimed", "scheduled", "open", "preferred_pending"])
    .select("*")
    .maybeSingle();

  if (button) button.disabled = false;
  if (error) {
    if (message) message.textContent = "Error: " + error.message;
    return;
  }
  if (!data) {
    if (message) message.textContent = "This job could not be started from its current status or owner. Refresh My Jobs and try again.";
    return;
  }

  closeStartModal();
  showPageMessage("Job started. Complete the checklist to finish the job.");
  await openChecklistModal(data);
}

function ensureChecklistModal() {
  injectStyles();
  let modal = document.getElementById("turnlyMobileChecklistModal");
  if (modal) return modal;

  document.body.insertAdjacentHTML("beforeend", `
    <div id="turnlyMobileChecklistModal" class="tj-modal" role="dialog" aria-modal="true" hidden>
      <div class="tc-panel">
        <div class="tc-shell">
          <header class="tc-topbar">
            <button type="button" class="tc-icon-button" data-tc-close aria-label="Close checklist">&#8249;</button>
            <h2 id="tcModuleTitle">Checklist</h2>
            <button type="button" class="tc-icon-button tc-hamburger" id="tcMenuToggle" data-tc-overview-toggle aria-label="Checklist modules" aria-expanded="false">
              <span></span><span></span><span></span>
            </button>
          </header>
          <div class="tc-progress">
            <small id="tcStepCounter">Loading checklist...</small>
            <div class="tc-progress-track" aria-hidden="true"><span id="tcProgressFill"></span></div>
          </div>
          <main id="tcStepContent" class="tc-step-content"></main>
          <p id="tcMessage" class="tc-message" aria-live="polite"></p>
        </div>
        <aside id="tcOverview" class="tc-overview" hidden>
          <div class="tc-overview-panel">
            <div class="tc-overview-head">
              <h3>Modules</h3>
              <button type="button" class="tc-icon-button" data-tc-overview-close aria-label="Close modules">&#215;</button>
            </div>
            <div id="tcOverviewList" class="tc-module-list"></div>
          </div>
        </aside>
        <div class="tc-step-actions">
          <button type="button" class="tc-back-btn" id="tcBack">&#8592; Back</button>
          <button type="button" class="tc-next-btn" id="tcNext"><span data-tc-next-label>Next</span> &#8594;</button>
        </div>
      </div>
    </div>
  `);

  modal = document.getElementById("turnlyMobileChecklistModal");
  modal.addEventListener("click", async (event) => {
    const closeButton = event.target.closest("[data-tc-close]");
    if (closeButton && modal.contains(closeButton)) {
      modal.hidden = true;
      return;
    }
    const overviewToggle = event.target.closest("[data-tc-overview-toggle]");
    if (overviewToggle && modal.contains(overviewToggle)) {
      toggleChecklistOverview();
      return;
    }
    const overviewClose = event.target.closest("[data-tc-overview-close]");
    if (overviewClose && modal.contains(overviewClose)) {
      toggleChecklistOverview(false);
      return;
    }
    if (event.target === document.getElementById("tcOverview")) {
      toggleChecklistOverview(false);
      return;
    }
    const moduleButton = event.target.closest("[data-tc-module-index]");
    if (moduleButton && modal.contains(moduleButton)) {
      captureChecklistInputs();
      activeChecklistIndex = Number(moduleButton.dataset.tcModuleIndex) || 0;
      toggleChecklistOverview(false);
      renderChecklistStep();
      return;
    }
    if (event.target.closest("#tcBack")) {
      await moveChecklistStep(-1);
      return;
    }
    if (event.target.closest("#tcNext")) {
      await moveChecklistStep(1);
    }
  });
  modal.addEventListener("change", (event) => {
    const check = event.target?.matches("[data-tc-check]") ? event.target : null;
    if (check) {
      const draft = checklistDraft(Number(check.dataset.tcCheck));
      draft.checked = Boolean(check.checked);
      draft.completed_at = draft.checked ? (draft.completed_at || new Date().toISOString()) : null;
      renderChecklistStep();
      return;
    }
    const input = event.target?.matches("[data-tc-media]") ? event.target : null;
    if (!input) return;
    const draft = checklistDraft(Number(input.dataset.tcMedia));
    draft.file = input.files?.[0] || null;
    const name = input.closest(".tc-upload-card")?.querySelector("[data-tc-media-name]");
    if (name) name.textContent = input.files?.[0]?.name || "No file selected";
    input.closest(".tc-upload-card")?.classList.toggle("has-file", Boolean(draft.file));
  });
  modal.addEventListener("input", (event) => {
    const note = event.target?.matches("[data-tc-note]") ? event.target : null;
    if (!note) return;
    checklistDraft(Number(note.dataset.tcNote)).note = note.value.trim();
  });
  return modal;
}

async function openChecklistModal(assignmentOrId) {
  activeUser = activeUser || await currentUser();
  if (!activeUser) return;

  activeAssignment = typeof assignmentOrId === "string" ? await fetchAssignment(assignmentOrId) : assignmentOrId;
  activeDirectoryDetails = await fetchDirectoryDetails(activeAssignment);
  activeQaJobId = assignmentQaJobId(activeAssignment);
  activeChecklistItems = await checklistItems(activeAssignment);
  activeChecklistModules = buildChecklistModules(activeChecklistItems);
  activeChecklistIndex = 0;
  activeChecklistDrafts = [];
  ensureChecklistDrafts(activeChecklistItems);
  const modal = ensureChecklistModal();
  modal.hidden = false;
  toggleChecklistOverview(false);
  renderChecklistStep();
}

async function completeJob() {
  const button = document.getElementById("tcNext");
  const message = document.getElementById("tcMessage");
  captureChecklistInputs();

  if (!activeChecklistItems.length) {
    if (message) message.textContent = "This assignment needs a checklist before it can be completed.";
    return;
  }

  const drafts = activeChecklistItems.map((item, index) => {
    const draft = checklistDraft(index);
    const mediaKind = checklistMediaKind(item);
    return {
      item,
      index,
      mediaKind,
      mediaFile: draft.file || null,
      response: {
        category: item.category || "General",
        task: item.task || "Untitled task",
        module_id: item.module_id || "",
        module_name: item.module_name || checklistModuleTitle(item, index),
        module_instance: item.module_instance || null,
        source_item_id: item.source_item_id || item.id || "",
        required: item.required !== false,
        media_required: item.media_required || "none",
        completed: Boolean(draft.checked),
        note: draft.note || "",
        completed_at: draft.checked ? (draft.completed_at || new Date().toISOString()) : null
      }
    };
  });

  const missing = drafts.filter((draft) => draft.response.required && !draft.response.completed);
  if (missing.length) {
    if (message) message.textContent = `Complete ${missing.length} required checklist item(s) before finishing the job.`;
    return;
  }

  const missingMedia = drafts.filter((draft) => draft.mediaKind && draft.response.completed && !draft.mediaFile);
  if (missingMedia.length) {
    if (message) message.textContent = `Upload ${missingMedia.length} required photo/video file${missingMedia.length === 1 ? "" : "s"} before finishing the job.`;
    return;
  }

  if (button) button.disabled = true;
  if (message) message.textContent = "Uploading checklist media...";

  const completedAt = new Date().toISOString();
  const responses = [];
  try {
    for (const draft of drafts) {
      const response = { ...draft.response };
      if (draft.mediaKind && draft.response.completed && draft.mediaFile) {
        response.media = await uploadChecklistMedia(draft.item, draft.mediaFile, draft.mediaKind, draft.index, completedAt, draft.response.note);
      }
      responses.push(response);
    }
  } catch (error) {
    if (button) button.disabled = false;
    if (message) message.textContent = "Unable to upload checklist media: " + (error?.message || "Unknown error");
    return;
  }

  if (message) message.textContent = "Submitting job to QA review...";
  let submitError = null;
  try {
    await submitAssignmentForQa(responses, completedAt);
  } catch (error) {
    submitError = error;
  }

  if (button) button.disabled = false;
  if (submitError) {
    if (message) message.textContent = "Error: " + submitError.message;
    return;
  }

  showPageMessage("Job submitted to QA for review.");
  window.location.reload();
}

async function renderActiveChecklistPanel() {
  if (!supabase || !document.getElementById("myAssignments")) return;
  const user = await currentUser();
  if (!user) return;

  const { data } = await supabase
    .from("assignment_blocks")
    .select("id, title, property_name")
    .or(`claimed_by.eq.${user.id},assigned_to.eq.${user.id}`)
    .eq("status", "in_progress")
    .order("started_at", { ascending: false });

  if (!data?.length || document.getElementById("turnlyActiveChecklistPanel")) return;

  const panel = document.createElement("div");
  panel.id = "turnlyActiveChecklistPanel";
  panel.className = "tj-active-panel";
  panel.innerHTML = `
    <h3>Active checklist</h3>
    <p>Finish required checklist items before completing your job.</p>
    ${data.map((item) => `
      <button type="button" class="primary-btn" data-tj-open-checklist="${escapeHtml(item.id)}">
        ${escapeHtml(item.property_name || item.title || "Open Checklist")}
      </button>
    `).join("")}
  `;
  document.getElementById("myAssignments").before(panel);
}

document.addEventListener("click", async (event) => {
  const startButton = event.target.closest("[data-start-assignment-id]");
  if (startButton) {
    event.preventDefault();
    event.stopImmediatePropagation();
    startButton.disabled = true;
    showPageMessage("Opening job details...");
    try {
      await openStartModal(startButton.dataset.startAssignmentId);
      showPageMessage("");
    } catch (error) {
      console.error("[contractor-job-flow] Unable to open start modal", error);
      showPageMessage("Unable to open job details: " + (error?.message || "Unknown error"));
    } finally {
      startButton.disabled = false;
    }
    return;
  }

  const checklistButton = event.target.closest("[data-tj-open-checklist]");
  if (checklistButton) {
    event.preventDefault();
    event.stopImmediatePropagation();
    await openChecklistModal(checklistButton.dataset.tjOpenChecklist);
  }
}, true);

if (supabase) {
  renderActiveChecklistPanel();
  setTimeout(renderActiveChecklistPanel, 1200);
}
