const ASSIGNMENT_UNIT_PATCH_KEY = "__turnlyAssignmentUnitMetadataPatch";

let pendingUnitMetadata = null;
let pendingUnitTimer = 0;

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function squareFeetFromLabel(value) {
  const match = cleanText(value).match(/([\d,.]+)\s*sq\s*ft/i);
  return match?.[1] ? match[1].replace(/,/g, "") : "";
}

function unitNameFromLabel(value) {
  const text = cleanText(value);
  if (!text) return "";
  return text.replace(/\s+-\s+[\d,.]+\s*sq\s*ft\b/i, "").trim();
}

function selectedUnitLabel(select) {
  const selected = select?.selectedOptions?.[0];
  return cleanText(selected?.textContent || "");
}

function currentUnitMetadata() {
  const field = document.getElementById("assignmentUnitField");
  if (!field || field.hidden) return null;

  const search = document.getElementById("assignmentUnitSearch");
  const select = document.getElementById("assignmentUnitSelect");
  const typedLabel = cleanText(search?.value);
  const optionLabel = selectedUnitLabel(select);
  const label = typedLabel || optionLabel;
  const unitName = unitNameFromLabel(label);
  const unitId = cleanText(select?.value);

  if (!unitName && !unitId) return null;

  return {
    unit_id: unitId || null,
    unit_name: unitName || unitId,
    unit_number: unitName || unitId,
    unit_square_feet: squareFeetFromLabel(label),
    unit_contractor_pay: cleanText(document.getElementById("pay_amount")?.value),
    unit_notes: cleanText(document.getElementById("special_instructions")?.value)
  };
}

function captureUnitMetadata() {
  window.clearTimeout(pendingUnitTimer);
  pendingUnitMetadata = currentUnitMetadata();
  if (pendingUnitMetadata) {
    pendingUnitTimer = window.setTimeout(() => {
      pendingUnitMetadata = null;
    }, 15000);
  }
}

function mergeUnitMetadata(row) {
  if (!row || typeof row !== "object" || Array.isArray(row) || !pendingUnitMetadata) return row;
  const existing = row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
    ? row.metadata
    : {};
  return {
    ...row,
    metadata: {
      ...existing,
      ...pendingUnitMetadata
    }
  };
}

function patchFetch() {
  if (window[ASSIGNMENT_UNIT_PATCH_KEY] || !window.fetch) return;
  window[ASSIGNMENT_UNIT_PATCH_KEY] = true;
  const originalFetch = window.fetch.bind(window);

  window.fetch = (input, init = {}) => {
    const url = typeof input === "string" ? input : input?.url || "";
    const method = String(init?.method || input?.method || "GET").toUpperCase();
    const body = init?.body;

    if (method === "POST" && /\/rest\/v1\/assignment_blocks/i.test(url) && body && pendingUnitMetadata) {
      try {
        const parsed = JSON.parse(body);
        const patched = Array.isArray(parsed) ? parsed.map(mergeUnitMetadata) : mergeUnitMetadata(parsed);
        init = { ...init, body: JSON.stringify(patched) };
      } catch (error) {
        console.warn("[assignments] Unable to attach unit metadata to assignment insert", error);
      }
    }

    return originalFetch(input, init);
  };
}

function bindUnitCapture() {
  document.addEventListener("submit", (event) => {
    if (event.target?.id === "assignmentForm") captureUnitMetadata();
  }, true);
}

patchFetch();
bindUnitCapture();
