import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const supabase = createClient(
  window.__ENV.SUPABASE_URL,
  window.__ENV.SUPABASE_ANON_KEY
);

const stages = [
  { id: "new_leads", label: "New Leads", badge: "New" },
  { id: "walkthrough", label: "Walkthrough", badge: "Walkthrough" },
  { id: "quote_sent", label: "Quote Sent", badge: "Quote" },
  { id: "contract_out", label: "Contract Out", badge: "Contract" },
  { id: "active", label: "Active", badge: "Active" }
];

let properties = [];
let draggedPropertyId = null;

const pipelineBoard = document.getElementById("propertyPipeline");
const pipelineMessage = document.getElementById("pipelineMessage");

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizeStage(stage) {
  return stages.some((item) => item.id === stage) ? stage : "new_leads";
}

function getStage(stageId) {
  return stages.find((stage) => stage.id === stageId) || stages[0];
}

function getNextStageId(stageId) {
  const currentIndex = stages.findIndex((stage) => stage.id === normalizeStage(stageId));
  return stages[currentIndex + 1]?.id || null;
}

function showPipelineMessage(text) {
  if (pipelineMessage) pipelineMessage.textContent = text;
}

function formatPropertyDetail(property) {
  const parts = [
    property.default_service_type,
    property.recurring_enabled ? `${property.recurring_frequency || "weekly"} recurring` : ""
  ].filter(Boolean);

  return parts.join(" | ") || "Property details pending";
}

async function loadPipelineProperties() {
  showPipelineMessage("Loading properties...");

  const { data, error } = await supabase
    .from("properties")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    showPipelineMessage("Error loading properties: " + error.message);
    return;
  }

  properties = (data || []).map((property) => ({
    ...property,
    pipeline_stage: normalizeStage(property.pipeline_stage)
  }));

  renderPipeline();
  showPipelineMessage(
    properties.length
      ? "Drag a property card into another stage to update it."
      : "No properties have been added yet."
  );
}

function renderPipeline() {
  stages.forEach((stage) => {
    const stageProperties = properties.filter((property) => (
      normalizeStage(property.pipeline_stage) === stage.id
    ));
    const dropzone = document.querySelector(`[data-stage-dropzone="${stage.id}"]`);
    const count = document.querySelector(`[data-stage-count="${stage.id}"]`);
    const metric = document.querySelector(`[data-pipeline-metric="${stage.id}"]`);

    if (count) count.textContent = String(stageProperties.length);
    if (metric) metric.textContent = String(stageProperties.length);
    if (!dropzone) return;

    dropzone.innerHTML = stageProperties.length
      ? stageProperties.map(renderPropertyCard).join("")
      : `<div class="pipeline-empty">Drop properties here</div>`;
  });
}

function renderPropertyCard(property) {
  const stage = getStage(normalizeStage(property.pipeline_stage));
  const nextStageId = getNextStageId(stage.id);
  const address = property.address || "Address not set";
  const detail = formatPropertyDetail(property);
  const moveButton = nextStageId
    ? `<button type="button" class="move-next-btn" data-move-next="${escapeHtml(property.id)}">Move next</button>`
    : "";

  return `
    <div class="pipeline-item draggable-property" draggable="true" data-property-id="${escapeHtml(property.id)}">
      <strong>${escapeHtml(property.name || "Untitled Property")}</strong>
      <small>${escapeHtml(address)}</small>
      <span>${escapeHtml(detail)}</span>
      <em>${escapeHtml(stage.badge)}</em>
      ${moveButton}
    </div>
  `;
}

async function updatePropertyStage(propertyId, nextStageId) {
  const nextStage = normalizeStage(nextStageId);
  const property = properties.find((item) => item.id === propertyId);

  if (!property) return;

  const previousStage = normalizeStage(property.pipeline_stage);
  if (previousStage === nextStage) return;

  property.pipeline_stage = nextStage;
  renderPipeline();
  showPipelineMessage(`Moving ${property.name || "property"} to ${getStage(nextStage).label}...`);

  const { error } = await supabase
    .from("properties")
    .update({ pipeline_stage: nextStage })
    .eq("id", propertyId);

  if (error) {
    property.pipeline_stage = previousStage;
    renderPipeline();
    showPipelineMessage(
      error.message.includes("pipeline_stage")
        ? "Run the latest Supabase migration before moving pipeline cards."
        : "Error updating stage: " + error.message
    );
    return;
  }

  showPipelineMessage(`${property.name || "Property"} moved to ${getStage(nextStage).label}.`);
}

function getEventTarget(event) {
  return event.target instanceof Element ? event.target : null;
}

pipelineBoard?.addEventListener("dragstart", (event) => {
  const target = getEventTarget(event);
  const card = target?.closest("[data-property-id]");

  if (!card || !event.dataTransfer) return;

  draggedPropertyId = card.dataset.propertyId;
  card.classList.add("is-dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", draggedPropertyId);
});

pipelineBoard?.addEventListener("dragend", (event) => {
  const target = getEventTarget(event);
  target?.closest("[data-property-id]")?.classList.remove("is-dragging");
  draggedPropertyId = null;

  document.querySelectorAll(".pipeline-column.is-over").forEach((column) => {
    column.classList.remove("is-over");
  });
});

pipelineBoard?.addEventListener("dragover", (event) => {
  const target = getEventTarget(event);
  const column = target?.closest("[data-pipeline-stage]");

  if (!column || !event.dataTransfer) return;

  event.preventDefault();
  column.classList.add("is-over");
  event.dataTransfer.dropEffect = "move";
});

pipelineBoard?.addEventListener("dragleave", (event) => {
  const target = getEventTarget(event);
  const column = target?.closest("[data-pipeline-stage]");
  const relatedTarget = event.relatedTarget instanceof Node ? event.relatedTarget : null;

  if (column && !column.contains(relatedTarget)) {
    column.classList.remove("is-over");
  }
});

pipelineBoard?.addEventListener("drop", async (event) => {
  const target = getEventTarget(event);
  const column = target?.closest("[data-pipeline-stage]");

  if (!column) return;

  event.preventDefault();
  column.classList.remove("is-over");

  const propertyId = event.dataTransfer?.getData("text/plain") || draggedPropertyId;
  if (propertyId) await updatePropertyStage(propertyId, column.dataset.pipelineStage);
});

pipelineBoard?.addEventListener("click", async (event) => {
  const target = getEventTarget(event);
  const button = target?.closest("[data-move-next]");
  const property = properties.find((item) => item.id === button?.dataset.moveNext);
  const nextStageId = getNextStageId(property?.pipeline_stage);

  if (button && nextStageId) {
    await updatePropertyStage(button.dataset.moveNext, nextStageId);
  }
});

if (pipelineBoard) {
  loadPipelineProperties();
}
