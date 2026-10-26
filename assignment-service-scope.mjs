// Classify by stored booking/checklist metadata, never by a customer's name.
export function assignmentServiceScope(row) {
  const metadata = row?.metadata || {};
  if (metadata.source === 'residential_booking' || metadata.scope_type === 'residential' || metadata.residential_booking_id) return 'residential';
  return 'commercial';
}
