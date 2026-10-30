const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function contractorAvatar(person, size = 44) {
 const name = person.name || person.full_name || person.email || 'Contractor';
 const initials = name.trim().split(/\s+/).slice(0,2).map(part => part[0] || '').join('').toUpperCase();
 const url = person.avatar_url || person.raw?.avatar_url || '';
 const safe = /^https:\/\//i.test(url);
 const pixels = [44,64,80].includes(size) ? size : 44;
 return '<span data-contractor-avatar style="display:inline-flex;position:relative;vertical-align:middle;flex-shrink:0;align-items:center;justify-content:center;width:'+pixels+'px;height:'+pixels+'px;border-radius:50%;overflow:hidden;background:#e6edf3;color:#183147;font-size:'+(pixels/3)+'px;font-weight:700;margin-right:10px"><span aria-hidden="true">'+esc(initials)+'</span>'+(safe ? '<img src="'+esc(url)+'" alt="'+esc(name)+' profile picture" loading="lazy" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" />' : '')+'</span>';
}
if (typeof document !== 'undefined') document.addEventListener('error', event => {
 if (event.target?.matches?.('[data-contractor-avatar] > img')) event.target.remove();
}, true);
