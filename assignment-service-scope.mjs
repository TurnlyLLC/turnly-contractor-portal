// Classify by stored booking/checklist metadata, never by a customer's name.
export function assignmentServiceScope(row) {
  let metadata = row?.metadata || {};
  if (typeof metadata === 'string') { try { metadata = JSON.parse(metadata) || {}; } catch { metadata = {}; } }
  if (metadata.source === 'residential_booking' || metadata.scope_type === 'residential' || metadata.residential_booking_id) return 'residential';
  return 'commercial';
}

export function assignmentAwaitsApproval(row) {
  // Approval metadata can remain on historical rows; current status is authoritative.
  return String(row?.status || '').toLowerCase() === 'pending';
}
