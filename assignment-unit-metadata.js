const ASSIGNMENT_UNIT_PATCH_KEY = "__turnlyAssignmentUnitMetadataPatch";

let restorePatchedFetch = null;

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

function mergeUnitMetadata(row, metadata) {
  if (!row || typeof row !== "object" || Array.isArray(row) || !metadata) return row;
  const existing = row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
    ? row.metadata
    : {};
  return {
    ...row,
    metadata: {
      ...existing,
      ...metadata
    }
  };
}

function installTemporaryFetchPatch(metadata) {
  if (!metadata || !window.fetch) return;
  if (restorePatchedFetch) restorePatchedFetch();

  window[ASSIGNMENT_UNIT_PATCH_KEY] = true;
  const originalFetch = window.fetch.bind(window);
  let timeoutId = 0;

  restorePatchedFetch = () => {
    if (window.fetch !== patchedFetch) return;
    window.fetch = originalFetch;
    window[ASSIGNMENT_UNIT_PATCH_KEY] = false;
    window.clearTimeout(timeoutId);
    restorePatchedFetch = null;
  };

  function patchedFetch(input, init = {}) {
    const url = typeof input === "string" ? input : input?.url || "";
    const method = String(init?.method || input?.method || "GET").toUpperCase();
    const body = init?.body;

    if (method === "POST" && /\/rest\/v1\/assignment_blocks/i.test(url) && body) {
      try {
        const parsed = JSON.parse(body);
        const patched = Array.isArray(parsed)
          ? parsed.map((row) => mergeUnitMetadata(row, metadata))
          : mergeUnitMetadata(parsed, metadata);
        init = { ...init, body: JSON.stringify(patched) };
      } catch (error) {
        console.warn("[assignments] Unable to attach unit metadata to assignment insert", error);
      } finally {
        window.setTimeout(() => {
          if (restorePatchedFetch) restorePatchedFetch();
        }, 0);
      }
    }

    return originalFetch(input, init);
  }

  window.fetch = patchedFetch;
  timeoutId = window.setTimeout(() => {
    if (restorePatchedFetch) restorePatchedFetch();
  }, 15000);
}

function bindUnitCapture() {
  document.addEventListener("submit", (event) => {
    if (event.target?.id !== "assignmentForm") return;
    installTemporaryFetchPatch(currentUnitMetadata());
  }, true);
}

bindUnitCapture();
