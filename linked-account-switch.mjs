import {contractorHomeForBrowser} from './contractor-routing.js?v=20260831-contractor-dashboard-split';
const backupKey = 'turnlyLinkedAdminSession:v1';
const maxAge = 8 * 60 * 60 * 1000;

export async function installAccountSwitcher(client) {
  if (!client || document.getElementById('turnlyAccountSwitch')) return;
  const api = async (action, token) => {
    const response = await fetch('/api/linked-account', {method: 'POST', headers: {
      'Content-Type': 'application/json', Authorization: `Bearer ${token}`
    }, body: JSON.stringify({action})});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to switch views.');
    return data;
  };
  const current = (await client.auth.getSession()).data?.session;
  if (!current) { sessionStorage.removeItem(backupKey); return; }
  let info;
  try { info = await api('status', current.access_token); } catch { return; }
  if (!info.linked) { sessionStorage.removeItem(backupKey); return; }
  let saved;
  try { saved = JSON.parse(sessionStorage.getItem(backupKey) || 'null'); } catch { /* invalid backup */ }
  if (saved && (saved.admin_id !== info.admin_id || saved.contractor_id !== info.contractor_id || Date.now() - saved.created > maxAge)) {
    saved = null; sessionStorage.removeItem(backupKey);
  }
  const box = document.createElement('aside');
  box.id = 'turnlyAccountSwitch';
  box.setAttribute('aria-label', 'My account views');
  box.innerHTML = '<span></span><button type="button"></button><small role="status" aria-live="polite"></small>';
  const label = box.querySelector('span');
  const button = box.querySelector('button');
  const status = box.querySelector('small');
  label.textContent = info.view === 'admin' ? 'Admin view' : `Contractor · ${info.contractor_name || 'My account'}`;
  button.textContent = info.view === 'admin' ? 'Switch to my contractor account' : 'Switch to admin';
  button.title = info.view === 'admin' ? info.contractor_email : 'admin@turnlypros.com';
  const style = document.createElement('style');
  style.textContent = '#turnlyAccountSwitch{position:fixed;right:20px;bottom:20px;z-index:10000;display:flex;flex-wrap:wrap;align-items:center;gap:10px;max-width:calc(100vw - 40px);padding:10px 14px;border:1px solid #0b8199;border-radius:14px;background:#fff;color:#062b46;box-shadow:0 5px 22px #062b4626;font:600 13px system-ui}#turnlyAccountSwitch button{border:0;border-radius:8px;background:#073b60;color:#fff;padding:10px 14px;font:inherit;cursor:pointer}#turnlyAccountSwitch button:focus-visible{outline:3px solid #00bdb2;outline-offset:3px}#turnlyAccountSwitch button:disabled{opacity:.6;cursor:wait}#turnlyAccountSwitch small:not(:empty){flex-basis:100%;max-width:340px;color:#a12828}@media(max-width:700px){#turnlyAccountSwitch{bottom:calc(84px + env(safe-area-inset-bottom));right:10px;max-width:calc(100vw - 20px);padding:8px;font-size:12px}}';
  document.head.append(style); document.body.append(box);
  document.addEventListener('click', event => {
    if (event.target.closest('[data-contractor-logout],#logoutBtn,#topSignOutBtn')) sessionStorage.removeItem(backupKey);
  }, true);
  button.addEventListener('click', async () => {
    button.disabled = true; status.textContent = 'Switching views…';
    try {
      if (info.view === 'admin') {
        const session = (await client.auth.getSession()).data?.session;
        if (!session || session.user.id !== info.admin_id) throw new Error('Your account changed in another tab. Refresh before switching.');
        // Keep the original admin session in this tab only; never mint an admin session from contractor access.
        const backup = {admin_id: info.admin_id, contractor_id: info.contractor_id, created: Date.now(),
          access_token: session.access_token, refresh_token: session.refresh_token};
        sessionStorage.setItem(backupKey, JSON.stringify(backup));
        const next = await api('contractor', session.access_token);
        const result = await client.auth.setSession(next.session);
        if (result.error || result.data.user?.id !== info.contractor_id) throw new Error('Unable to open your contractor session. Refresh and retry.');
        localStorage.removeItem('turnlyAdminPreviewContext');
        location.assign(contractorHomeForBrowser());
      } else {
        if (!saved || Date.now() - saved.created > maxAge) { sessionStorage.removeItem(backupKey); location.assign('login.html'); return; }
        const result = await client.auth.setSession({access_token: saved.access_token, refresh_token: saved.refresh_token});
        if (result.error || result.data.user?.id !== info.admin_id) {
          saved = null; sessionStorage.removeItem(backupKey); location.assign('login.html'); return;
        }
        const check = await api('status', result.data.session.access_token);
        if (!check.linked || check.view !== 'admin') throw new Error('Admin access is unavailable. Please sign in again.');
        sessionStorage.removeItem(backupKey);
        localStorage.removeItem('turnlyAdminPreviewContext');
        location.assign('admin.html');
      }
    } catch (error) { status.textContent = error.message; button.disabled = false; }
  });
}
