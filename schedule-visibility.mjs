import { assignmentServiceScope } from './assignment-service-scope.mjs?v=20261027-calendar';
// Keep canceled residential jobs out of every schedule view and its filters.
export function visibleScheduleAssignment(row, scope = 'all') {
  if (['residential', 'commercial'].includes(scope) && assignmentServiceScope(row) !== scope) return false;
  let metadata = row?.metadata || {};
  if (typeof metadata === 'string') {
    try { metadata = JSON.parse(metadata); } catch { metadata = {}; }
  }
  const normalize = value => String(value || '').trim().toLowerCase().replace(/[-\s]+/g, '_');
  const residential = assignmentServiceScope(row) === 'residential';
  if (!residential) return true;
  return !['cancelled', 'canceled', 'declined'].includes(normalize(row.status))
    && !row.assignment_deleted_at && !metadata?.assignment_deleted_at;
}
