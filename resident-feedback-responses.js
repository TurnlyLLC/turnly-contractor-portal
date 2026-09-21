import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const env = window.__ENV || {};
const client = env.SUPABASE_URL && env.SUPABASE_ANON_KEY
  ? createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY) : null;
const fields = 'id,created_at,property_name,property_code,card_number,rating,message';
const pageSize = 25;
const state = { rows: [], page: 1, total: 0, loading: false, error: '', request: 0 };
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]);
const root = document.getElementById('adminSuiteApp');

function renderRows() {
  const list = document.getElementById('residentResponseList');
  if (!list) return;
  const status = document.getElementById('residentResponseStatus');
  status.textContent = state.error || (state.loading ? 'Loading resident feedback…' : `${state.total.toLocaleString()} response${state.total === 1 ? '' : 's'} · Newest first`);
  status.classList.toggle('error', Boolean(state.error));
  list.setAttribute('aria-busy', String(state.loading));
  list.innerHTML = state.rows.map(row => {
    const rating = Math.max(0, Math.min(5, Number(row.rating) || 0));
    const date = new Date(row.created_at);
    return `<article class="resident-response-card">
      <header><div><h3>${esc(row.property_name)}</h3><p>Card ${esc(row.property_code)}-${esc(String(row.card_number).padStart(3, '0'))}</p></div>
        <div class="resident-response-rating"><span class="resident-feedback-rating" aria-hidden="true">${'★'.repeat(rating)}<span>${'★'.repeat(5 - rating)}</span></span><strong>${rating} / 5</strong></div>
      </header>
      <p class="resident-response-date"><time datetime="${esc(row.created_at)}">${esc(date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }))}</time></p>
      <h4>Resident’s feedback</h4>
      ${row.message ? `<blockquote>${esc(row.message)}</blockquote>` : '<p class="resident-response-no-comment">Rating only — no written feedback provided.</p>'}
    </article>`;
  }).join('') || `<div class="resident-response-empty"><h3>${state.loading ? 'Loading responses…' : state.error ? 'Feedback could not be loaded' : 'No resident feedback yet'}</h3><p>${state.loading ? 'Checking for submitted answers.' : state.error ? 'Use Refresh to try again.' : 'Submitted ratings and comments will appear here when residents complete a QR feedback form.'}</p></div>`;
  document.getElementById('residentResponsePage').textContent = state.total
    ? `${((state.page - 1) * pageSize + 1).toLocaleString()}–${Math.min(state.page * pageSize, state.total).toLocaleString()} of ${state.total.toLocaleString()}` : '';
  document.getElementById('residentResponsePrevious').disabled = state.loading || state.page <= 1 || Boolean(state.error);
  document.getElementById('residentResponseNext').disabled = state.loading || state.page * pageSize >= state.total || Boolean(state.error);
  document.getElementById('residentResponseRefresh').disabled = state.loading;
}

async function load(page = 1) {
  const request = ++state.request;
  state.loading = true;
  state.error = '';
  state.rows = [];
  renderRows();
  try {
    if (!client) throw new Error('Feedback service is unavailable. Refresh to try again.');
    const admin = await client.rpc('current_profile_is_admin');
    if (request !== state.request) return;
    if (admin.error) throw new Error('Unable to verify admin access. Sign in again or refresh to retry.');
    if (admin.data !== true) throw new Error('Sign in with an admin account to view resident feedback.');
    const query = currentPage => client.from('resident_feedback_responses').select(fields, { count: 'exact' })
      .order('created_at', { ascending: false }).order('id', { ascending: false })
      .range((currentPage - 1) * pageSize, currentPage * pageSize - 1);
    let result = await query(page);
    if (request !== state.request) return;
    if (result.error) throw new Error('Unable to load resident feedback. Refresh to try again.');
    const lastPage = Math.max(1, Math.ceil((result.count || 0) / pageSize));
    if (page > lastPage) {
      page = lastPage;
      result = await query(page);
      if (request !== state.request) return;
      if (result.error) throw new Error('Unable to load resident feedback. Refresh to try again.');
    }
    state.rows = result.data || [];
    state.total = result.count || 0;
    state.page = page;
  } catch (error) {
    if (request !== state.request) return;
    state.rows = [];
    state.total = 0;
    state.page = 1;
    state.error = error.message || 'Unable to load resident feedback.';
  } finally {
    if (request === state.request) { state.loading = false; renderRows(); }
  }
}

function mountPage() {
  const mount = root?.querySelector('#residentFeedbackResponsesMount');
  if (!mount || mount.dataset.rendered === 'true') return false;
  mount.dataset.rendered = 'true';
  mount.innerHTML = `<section aria-labelledby="residentResponseTitle">
    <div class="resident-response-toolbar"><div><h2 id="residentResponseTitle">Resident responses</h2><p id="residentResponseStatus" class="resident-feedback-notice" role="status" aria-live="polite"></p></div><div class="resident-feedback-batch-actions"><a class="secondary-action" href="qr-tracker.html">QR Tracker</a><button class="primary-action" id="residentResponseRefresh" type="button">Refresh</button></div></div>
    <div id="residentResponseList" class="resident-response-list"></div>
    <nav class="resident-response-pagination" aria-label="Feedback pages"><button class="secondary-action" id="residentResponsePrevious" type="button" disabled>Previous</button><span id="residentResponsePage"></span><button class="secondary-action" id="residentResponseNext" type="button" disabled>Next</button></nav>
  </section>`;
  document.getElementById('residentResponseRefresh').addEventListener('click', () => void load());
  document.getElementById('residentResponsePrevious').addEventListener('click', () => void load(state.page - 1));
  document.getElementById('residentResponseNext').addEventListener('click', () => void load(state.page + 1));
  void load();
  return true;
}

client?.auth.onAuthStateChange(event => {
  if (event === 'SIGNED_OUT') {
    ++state.request;
    Object.assign(state, { rows: [], total: 0, page: 1, loading: false, error: 'Sign in with an admin account to view resident feedback.' });
    renderRows();
  }
});
const observer = new MutationObserver(() => { if (mountPage()) observer.disconnect(); });
if (!mountPage() && root) observer.observe(root, { childList: true, subtree: true });
