// Keep the calling order independent of mutable activity timestamps.
export function reconcileQueue(previous, rows) {
  const available = new Map(rows.map(row => [row.id, row]));
  const ids = previous.filter(id => available.has(id));
  const seen = new Set(ids);
  for (const row of [...rows].sort((a,b) => String(a.created_at || '').localeCompare(String(b.created_at || '')) || String(a.id).localeCompare(String(b.id)))) {
    if (!seen.has(row.id)) { ids.push(row.id); seen.add(row.id); }
  }
  return ids;
}
export function adjacentLead(ids, selectedId, direction, eligibleIds) {
  const start = ids.indexOf(selectedId);
  if (start < 0) return null;
  for (let i = start + direction; i >= 0 && i < ids.length; i += direction) {
    if (eligibleIds.has(ids[i])) return ids[i];
  }
  return null;
}
