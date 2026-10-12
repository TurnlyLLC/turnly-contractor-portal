// Keep canceled residential jobs out of every schedule view and its filters.
export function visibleScheduleAssignment(row) {
  let metadata = row?.metadata || {};
  if (typeof metadata === 'string') {
    try { metadata = JSON.parse(metadata); } catch { metadata = {}; }
  }
  const normalize = value => String(value || '').trim().toLowerCase().replace(/[-\s]+/g, '_');
  const residential = normalize(metadata?.source) === 'residential_booking' || Boolean(metadata?.residential_booking_id);
  if (!residential) return true;
  return !['cancelled', 'canceled', 'declined'].includes(normalize(row.status))
    && !row.assignment_deleted_at && !metadata?.assignment_deleted_at;
}
