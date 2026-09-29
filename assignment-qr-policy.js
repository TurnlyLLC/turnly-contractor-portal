const QR_CUTOFF_BUILDING = 2330;
const QR_CUTOFF_UNIT = 2;

function metadataFor(row = {}) {
  const value = row?.metadata;
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim()) {
    try { return JSON.parse(value) || {}; } catch { return {}; }
  }
  return {};
}

export function assignmentQrUnit(row = {}) {
  const metadata = metadataFor(row);
  return String(
    row?.unit_number
      || row?.unit_name
      || metadata.unit_number
      || metadata.unit_name
      || ""
  ).replace(/\s+/g, " ").trim();
}

export function assignmentIsLeasingOffice(row = {}) {
  const text = [row?.title, row?.service_type, row?.unit_number, row?.unit_name, assignmentQrUnit(row)]
    .filter(Boolean).join(" ");
  return /\b(leasing|lease\s+office|leasing\s+office|leasing\s+and\s+staging|staging\s+unit|clubhouse|model\s+unit)\b/i.test(text);
}

export function assignmentIsClean(row = {}) {
  const text = [row?.title, row?.service_type, row?.scope].filter(Boolean).join(" ");
  return /\b(clean|cleaning|turnover|make[- ]?ready|housekeeping)\b/i.test(text);
}

export function assignmentQrUnitAfterCutoff(row = {}) {
  const match = assignmentQrUnit(row).match(/^(\d+)\s*[-/]\s*(\d+)$/);
  if (!match) return false;
  const building = Number(match[1]);
  const unit = Number(match[2]);
  return building > QR_CUTOFF_BUILDING || (building === QR_CUTOFF_BUILDING && unit > QR_CUTOFF_UNIT);
}

export function assignmentQrEligible(row = {}) {
  return assignmentIsClean(row) && !assignmentIsLeasingOffice(row) && assignmentQrUnitAfterCutoff(row);
}

export function assignmentQrTrackerId(row = {}) {
  const metadata = metadataFor(row);
  return String(row?.qr_tracker_id || metadata.qr_tracker_id || "").trim();
}

export function normalizeAssignmentQrTrackerId(value) {
  return String(value || "").trim().toUpperCase();
}

export function qrTrackerEligibilityMessage(row = {}) {
  if (assignmentIsLeasingOffice(row)) return "Leasing office and staging assignments cannot have a QR tracker ID.";
  if (!assignmentIsClean(row)) return "QR tracker IDs are limited to cleaning or apartment turnover assignments.";
  if (!assignmentQrUnitAfterCutoff(row)) return "QR tracker IDs begin after unit 2330-2.";
  return "";
}

export function applyAssignmentQrTrackerPolicy(payload = {}, baseRow = {}) {
  const row = { ...baseRow, ...payload };
  const requested = normalizeAssignmentQrTrackerId(payload.qr_tracker_id || "");
  const eligible = assignmentQrEligible(row);
  const next = { ...payload };
  if (!eligible) {
    next.qr_tracker_id = null;
  } else {
    next.qr_tracker_id = requested || null;
  }
  return next;
}

export { QR_CUTOFF_BUILDING, QR_CUTOFF_UNIT };
