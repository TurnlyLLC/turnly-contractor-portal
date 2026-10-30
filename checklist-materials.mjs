const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function materialsHtml(list, suppliesNotes = '') {
  const groups = Array.isArray(list?.groups) ? list.groups : [];
  return `<p>${esc(list?.title || 'Job supplies')}</p>
    ${groups.length ? groups.map(group => `<section><h3>${esc(group.title)}</h3><ul>${(Array.isArray(group.items) ? group.items : []).map(item => `<li><strong>${esc(item.name)}</strong>${item.note ? `<p>${esc(item.note)}</p>` : ''}</li>`).join('')}</ul></section>`).join('') : '<p>No materials list is attached to this checklist. Check the assignment notes and contact Turnly before arriving if supplies are unclear.</p>'}
    ${suppliesNotes ? `<section><h3>Job-specific supply notes</h3><p style="white-space:pre-wrap">${esc(suppliesNotes)}</p></section>` : ''}
    ${Array.isArray(list?.notes) ? `<section><h3>Before you begin</h3><ul>${list.notes.map(note => `<li>${esc(note)}</li>`).join('')}</ul></section>` : ''}`;
}

export function showMaterials(assignment, onClose) {
  document.getElementById('turnlyMaterialsDialog')?.remove();
  const opener = document.activeElement;
  const dialog = document.createElement('dialog');
  dialog.id = 'turnlyMaterialsDialog';
  dialog.setAttribute('aria-labelledby', 'turnlyMaterialsTitle');
  dialog.style.cssText = 'width:min(640px,calc(100vw - 32px));max-height:85dvh;box-sizing:border-box;overflow:auto;border:1px solid #526478;border-radius:16px;background:#0b1724;color:#eef5fb;padding:24px;font-family:system-ui,sans-serif;line-height:1.5';
  dialog.innerHTML = `<style>#turnlyMaterialsDialog::backdrop{background:rgba(2,8,15,.8)}#turnlyMaterialsDialog li{margin-bottom:10px}#turnlyMaterialsDialog li p{margin:2px 0;color:#c4d1de}#turnlyMaterialsDialog button{min-height:44px;padding:10px 18px;border-radius:8px;background:#1fe28a;color:#082519;border:0;font-weight:700;cursor:pointer}</style>
    <header style="position:sticky;top:-24px;background:#0b1724;padding:12px 0;display:flex;gap:12px;align-items:center;justify-content:space-between"><h2 id="turnlyMaterialsTitle" tabindex="-1" style="font-size:22px;margin:0">Materials &amp; chemicals</h2><button type="button" aria-label="Close materials">Close</button></header>
    ${materialsHtml(assignment?.materials_list, assignment?.supplies_notes)}
    <button type="button">Back to job details</button>`;
  document.body.append(dialog);
  dialog.querySelectorAll('button').forEach(button => button.addEventListener('click', () => dialog.close()));
  dialog.addEventListener('close', () => { dialog.remove(); opener?.focus(); onClose?.(); }, {once:true});
  dialog.showModal();
  dialog.querySelector('h2').focus();
}
