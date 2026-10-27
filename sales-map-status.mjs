export const leadRingColor = status => ({contacted:'#facc15',interested:'#facc15',follow_up:'#facc15',purchased:'#22c55e',not_interested:'#ef4444',do_not_contact:'#ef4444'}[status] || '#ffffff');

export function leadClusterRing(markers) {
  const counts = new Map();
  for (const marker of markers) {
    const color = leadRingColor(marker.record?.status);
    counts.set(color, (counts.get(color) || 0) + 1);
  }
  let position = 0;
  return `conic-gradient(${[...counts].map(([color, count]) => {
    const start = position;
    position += count / markers.length * 100;
    return `${color} ${start}% ${position}%`;
  }).join(',') || '#ffffff 0% 100%'})`;
}
