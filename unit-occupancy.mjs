export function unitOccupancy(row) {
  let metadata = row?.metadata;
  if (typeof metadata === 'string') {
    try { metadata = JSON.parse(metadata); } catch { return ''; }
  }
  return ['occupied', 'vacant'].includes(metadata?.unit_occupancy) ? metadata.unit_occupancy : '';
}

export function unitOccupancyBadge(row) {
  const occupancy = unitOccupancy(row);
  if (!occupancy) return '';
  const colors = occupancy === 'occupied' ? 'background:#fff3cd;color:#624a00;border-color:#d6b85c' : 'background:#dff3ed;color:#145440;border-color:#82bca8';
  return `<span class="status-badge unit-occupancy-badge" style="${colors};display:inline-flex;padding:4px 9px;border:1px solid;border-radius:999px;font-weight:700" aria-label="Unit occupancy: ${occupancy}">${occupancy === 'occupied' ? 'Occupied' : 'Vacant'}</span>`;
}
