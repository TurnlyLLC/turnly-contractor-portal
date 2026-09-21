export function createResidentFeedbackWidget({ client, panel, esc }) {
  const state = { rows: [], loading: true, error: '', request: 0 };
  const fields = 'id,created_at,property_name,property_code,card_number,rating,message';
  const stamp = value => new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

  function render() {
    return panel('Resident Feedback', `
      <div class="resident-feedback-widget-toolbar">
        <span id="residentFeedbackWidgetStatus" class="request-message" role="status"></span>
        <button class="secondary-action" type="button" data-resident-feedback-refresh>Refresh</button>
      </div>
      <div id="residentFeedbackWidgetList" class="resident-feedback-widget-list"></div>
      <a class="panel-bottom-link" href="resident-feedback.html">View all resident feedback <span class="suite-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg></span></a>
    `, { menu: true, key: 'resident-feedback', className: 'resident-feedback-widget' });
  }

  function renderRows() {
    const list = document.getElementById('residentFeedbackWidgetList');
    const status = document.getElementById('residentFeedbackWidgetStatus');
    if (!list || !status) return;
    status.textContent = state.error || (state.loading ? 'Loading resident feedback…' : `${state.rows.length} recent response${state.rows.length === 1 ? '' : 's'}`);
    status.classList.toggle('error', Boolean(state.error));
    list.setAttribute('aria-busy', String(state.loading));
    list.innerHTML = state.rows.length ? state.rows.map(row => `
      <article class="resident-feedback-widget-card">
        <div class="resident-feedback-widget-card-head">
          <div><strong>${esc(row.property_name)}</strong><small>${esc(row.property_code)}-${esc(String(row.card_number).padStart(3, '0'))}</small></div>
          <span class="resident-feedback-rating" aria-label="${esc(row.rating)} out of 5 stars">${'★'.repeat(Number(row.rating) || 0)}<span>${'★'.repeat(5 - (Number(row.rating) || 0))}</span></span>
        </div>
        <p>${esc(stamp(row.created_at))}</p>
        ${row.message ? `<blockquote>${esc(row.message)}</blockquote>` : '<p class="resident-feedback-no-comment">No written comment</p>'}
      </article>`).join('') : `<p class="resident-feedback-widget-empty">${state.loading ? 'Checking for resident feedback…' : state.error ? 'Use Refresh to try again.' : 'New resident feedback will appear here after someone scans a Turnly QR card.'}</p>`;
  }

  async function load() {
    const request = ++state.request;
    state.loading = true;
    state.error = '';
    renderRows();
    try {
      if (!client) throw new Error('Feedback service is not configured.');
      const admin = await client.rpc('current_profile_is_admin');
      if (admin.error || admin.data !== true) throw new Error('Sign in with an admin account to view resident feedback.');
      const result = await client.from('resident_feedback_responses').select(fields)
        .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(6);
      if (request !== state.request) return;
      if (result.error) throw new Error('Unable to load resident feedback. Apply the resident feedback migration and refresh.');
      state.rows = result.data || [];
    } catch (error) {
      if (request !== state.request) return;
      state.rows = [];
      state.error = error.message || 'Unable to load resident feedback.';
    } finally {
      if (request === state.request) { state.loading = false; renderRows(); }
    }
  }

  function click(event) {
    if (event.target.closest('[data-resident-feedback-refresh]')) void load();
  }

  return { render, renderRows, load, click };
}
