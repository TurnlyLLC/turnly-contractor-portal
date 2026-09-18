import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { buildFlyerPdf, flyerSvg, loadFlyerArtwork } from './resident-feedback-pdf.mjs?v=20260918-flyer';

const env = window.__ENV || {};
const supabase = env.SUPABASE_URL && env.SUPABASE_ANON_KEY ? createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY) : null;
const root = document.getElementById('adminSuiteApp');
const state = { properties: [], propertyId: '', propertyCode: '', codeEdited: false, creating: false, downloading: false, cards: [], batchPropertyName: '', batchPropertyCode: '', error: '', status: '' };
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]);
const messageNode = () => document.getElementById('residentFeedbackMessage');
const endpointReady = () => Boolean(supabase);
const cardNumber = (number) => String(number).padStart(3, '0');

function message(text, error = false) {
  state.status = error ? '' : text;
  state.error = error ? text : '';
  const node = messageNode();
  if (node) { node.textContent = text; node.classList.toggle('error', error); }
}

function propertyCodeFor(name) {
  const words = String(name || '').toUpperCase().match(/[A-Z0-9]+/g) || [];
  if (!words.length) return '';
  if (words.length > 1) return words.map(word => word[0]).join('').slice(0, 10);
  return words[0].slice(0, 3);
}

function selectedProperty() { return state.properties.find(property => property.id === state.propertyId) || null; }

function updateExample() {
  const code = (document.getElementById('residentFeedbackPropertyCode')?.value || state.propertyCode || 'VFH').toUpperCase();
  const number = Number(document.getElementById('residentFeedbackStartNumber')?.value || 1);
  const example = document.getElementById('residentFeedbackExample');
  if (example) example.textContent = `${code}-${cardNumber(Math.max(1, number || 1))}`;
  const preview = document.getElementById('residentFeedbackDesignPreview');
  if (preview && window.qrcode) preview.innerHTML = flyerSvg({ card_number: Math.max(1, number || 1) }, selectedProperty()?.label || 'YOUR PROPERTY', code, { preview: true });
}

async function loadProperties() {
  const select = document.getElementById('residentFeedbackProperty');
  const note = messageNode();
  if (!select) return;
  if (!endpointReady()) { message('Supabase is not configured in the portal.', true); return; }
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) { message('Sign in with an admin account to create QR cards.', true); return; }
  const profile = await supabase.rpc('current_profile_is_admin');
  if (profile.error || profile.data !== true) { message('Only admins can create resident QR cards.', true); return; }
  const result = await supabase.from('portal_properties').select('id,name,property_name').order('name', { ascending: true }).limit(1000);
  if (result.error) { message('Unable to load properties. Check portal access and refresh.', true); return; }
  state.properties = (result.data || []).map(item => ({ ...item, label: item.property_name || item.name })).filter(item => item.label);
  select.innerHTML = '<option value="">Choose a property</option>' + state.properties.map(item => `<option value="${esc(item.id)}">${esc(item.label)}</option>`).join('');
  select.disabled = false;
  if (!state.properties.length) message('No properties are available yet. Add a property in the portal, then return here.');
  else if (note) message('');
}

function makeCardMarkup(card, propertyName, propertyCode) {
  const id = `${propertyCode}-${cardNumber(card.card_number)}`;
  return `<article class="resident-flyer" data-card-id="${esc(id)}">${flyerSvg(card, propertyName, propertyCode)}</article>`;
}

async function downloadBatch({ automatic = false } = {}) {
  if (state.downloading || (state.creating && !automatic) || !state.cards.length) return;
  state.downloading = true;
  const button = document.getElementById('residentFeedbackDownload');
  const generate = document.querySelector('#residentFeedbackGeneratorForm [type="submit"]');
  if (button) button.disabled = true;
  if (generate) generate.disabled = true;
  try {
    const bytes = await buildFlyerPdf({ cards: state.cards, propertyName: state.batchPropertyName, propertyCode: state.batchPropertyCode,
      onProgress: (done, total) => message(`Preparing PDF: ${done} of ${total} flyers…`) });
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Turnly_Feedback_${state.batchPropertyCode}_${cardNumber(state.cards[0].card_number)}-${cardNumber(state.cards.at(-1).card_number)}_4up_Letter.pdf`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    message(`PDF ready: ${state.cards.length} unique flyers on ${Math.ceil(state.cards.length / 4)} Letter page(s). Download it again below if needed.`);
  } catch (error) {
    message(`Your batch is saved. ${error.message || 'Unable to prepare the PDF.'} Use Download PDF to retry without generating new codes.`, true);
  } finally {
    state.downloading = false;
    if (button) button.disabled = false;
    if (generate) generate.disabled = state.creating;
  }
}

async function createBatch(form) {
  if (state.creating || state.downloading) return;
  if (!endpointReady()) { message('Supabase is not configured in the portal.', true); return; }
  const property = selectedProperty();
  const count = Number(form.elements.count.value);
  const start = Number(form.elements.start_number.value);
  const propertyCode = String(form.elements.property_code.value || '').trim().toUpperCase();
  if (!property) { message('Choose a property to create QR cards.', true); return; }
  if (!window.qrcode || !window.PDFLib) { message('The flyer generator is still loading. Wait a moment and try again.', true); return; }
  if (!/^[A-Z0-9]{2,10}$/.test(propertyCode)) { message('Use 2–10 letters or numbers for the property code.', true); return; }
  if (!Number.isInteger(count) || count < 1 || count > 500) { message('Choose between 1 and 500 QR cards.', true); return; }
  if (!Number.isInteger(start) || start < 1 || start + count - 1 > 999999) { message('Choose a starting number that fits within six digits.', true); return; }
  state.creating = true;
  const button = form.querySelector('[type="submit"]');
  const downloadButton = document.getElementById('residentFeedbackDownload');
  button.disabled = true;
  if (downloadButton) downloadButton.disabled = true;
  button.textContent = 'Creating secure QR cards…';
  message('Generating unique links and saving the batch…');
  try {
    // Load the template before saving codes, so an asset failure cannot strand a batch.
    await loadFlyerArtwork();
    const session = await supabase.auth.getSession();
    const accessToken = session.data?.session?.access_token;
    if (!accessToken) throw new Error('Your admin session has expired. Sign in and try again.');
    const response = await fetch('/api/resident-feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ action: 'create_batch', property_id: property.id, property_code: propertyCode, count, start_number: start })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) throw new Error(result.error || 'Unable to create this QR batch. Check the resident feedback migration and retry.');
    state.cards = result.cards || [];
    state.batchPropertyName = result.property_name;
    state.batchPropertyCode = result.property_code;
    renderBatch(result.property_name, result.property_code);
    message(`${state.cards.length} flyers saved for ${result.property_name}. Preparing your PDF…`);
    document.getElementById('residentFeedbackBatch')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    await downloadBatch({ automatic: true });
  } catch (error) {
    const text = String(error?.message || '');
    message(text.includes('resident_feedback_cards') || text.includes('already exist')
      ? 'Those card IDs already exist. Choose a different starting number.'
      : text || 'Unable to create this QR batch. Please try again.', true);
  } finally {
    state.creating = false;
    button.disabled = false;
    if (downloadButton) downloadButton.disabled = false;
    button.textContent = 'Generate flyer PDF';
  }
}

function renderBatch(propertyName, propertyCode) {
  const batch = document.getElementById('residentFeedbackBatch');
  const cards = document.getElementById('residentFeedbackCards');
  const download = document.getElementById('residentFeedbackDownload');
  if (!batch || !cards) return;
  // Show the first sheet; the downloaded PDF always includes the entire saved batch.
  cards.innerHTML = state.cards.slice(0, 4).map(card => makeCardMarkup(card, propertyName, propertyCode)).join('');
  batch.hidden = !state.cards.length;
  download.hidden = !state.cards.length;
  document.getElementById('residentFeedbackBatchSummary').textContent = `${state.cards.length} unique flyers · ${Math.ceil(state.cards.length / 4)} Letter pages · first sheet preview`;
}

function bindPage() {
  const form = document.getElementById('residentFeedbackGeneratorForm');
  if (!form || form.dataset.bound === 'true') return Boolean(form);
  form.dataset.bound = 'true';
  const property = document.getElementById('residentFeedbackProperty');
  const code = document.getElementById('residentFeedbackPropertyCode');
  property.addEventListener('change', () => {
    state.propertyId = property.value;
    const selected = selectedProperty();
    if (!state.codeEdited && selected) code.value = propertyCodeFor(selected.label);
    state.propertyCode = code.value;
    updateExample();
  });
  code.addEventListener('input', () => { state.codeEdited = true; state.propertyCode = code.value; updateExample(); });
  document.getElementById('residentFeedbackStartNumber')?.addEventListener('input', updateExample);
  document.getElementById('residentFeedbackCount')?.addEventListener('input', () => {
    const count = Number(document.getElementById('residentFeedbackCount').value || 0);
    const summary = document.getElementById('residentFeedbackBatchSummary');
    if (summary && !state.cards.length) summary.textContent = `${count || 0} unique flyers · ${Math.ceil(count / 4)} Letter pages`;
  });
  form.addEventListener('submit', event => { event.preventDefault(); void createBatch(form); });
  document.getElementById('residentFeedbackDownload')?.addEventListener('click', () => void downloadBatch());
  void loadProperties();
  return true;
}

function renderAdminPage() {
  const mount = root?.querySelector('#residentFeedbackAdminMount');
  if (!mount || mount.dataset.rendered === 'true') return false;
  mount.dataset.rendered = 'true';
  mount.innerHTML = `
    <section class="resident-feedback-intro">
      <div><h2>Simple, secure feedback from every turn.</h2><p>Make property-specific QR cards for residents. Each card has its own private link, so the response is connected to the community and card number without asking the resident to identify their unit.</p></div>
      <span class="resident-feedback-icon" aria-hidden="true">✦</span>
    </section>
    <section class="resident-feedback-generator">
      <form id="residentFeedbackGeneratorForm" class="resident-feedback-form-panel">
        <h3>Resident Feedback Flyer Generator</h3>
        <p>Choose the property and number range. Download the Turnly flyer as a PDF, with four unique flyers on each Letter page.</p>
        <div class="resident-feedback-fields">
          <label class="wide">Property<select id="residentFeedbackProperty" name="property_id" required disabled><option>Loading properties…</option></select></label>
          <label>Property code<input id="residentFeedbackPropertyCode" name="property_code" type="text" value="" minlength="2" maxlength="10" autocomplete="off" required aria-describedby="residentFeedbackCodeHelp" /><small id="residentFeedbackCodeHelp">2–10 letters or numbers. We’ll suggest a code from the property name.</small></label>
          <label>Number of QR cards<input id="residentFeedbackCount" name="count" type="number" min="1" max="500" step="1" value="100" required /></label>
          <label>Starting card number<input id="residentFeedbackStartNumber" name="start_number" type="text" inputmode="numeric" pattern="[0-9]{1,6}" maxlength="6" value="001" required /></label>
        </div>
        <div class="resident-feedback-example"><span>Example card ID</span><strong id="residentFeedbackExample">VFH-001</strong></div>
        <div class="resident-feedback-example resident-feedback-url"><span>Feedback URL pattern</span><strong>turnlypros.com/f/[secure token]</strong></div>
        <button class="primary-action resident-feedback-submit" type="submit">Generate flyer PDF</button>
        <p id="residentFeedbackMessage" class="resident-feedback-notice" role="status" aria-live="polite"></p>
      </form>
      <aside class="resident-feedback-preview-panel">
        <h3>Your flyer design</h3><p>The supplied Turnly design, with your property details and a unique feedback QR on every flyer.</p>
        <div class="resident-flyer resident-flyer-design" id="residentFeedbackDesignPreview"></div>
      </aside>
    </section>
    <section id="residentFeedbackBatch" class="resident-feedback-batch" hidden>
      <div class="resident-feedback-batch-head"><div><h3>Your flyer PDF</h3><span id="residentFeedbackBatchSummary"></span><p class="resident-feedback-save-note">Keep the downloaded PDF before leaving this page. To print, open the PDF and choose Letter paper at Actual size (100%).</p></div><div class="resident-feedback-batch-actions"><button class="primary-action" id="residentFeedbackDownload" type="button" hidden>Download PDF</button></div></div>
      <div id="residentFeedbackCards" class="resident-feedback-cards"></div>
    </section>`;
  bindPage();
  try {
    document.getElementById('residentFeedbackDesignPreview').innerHTML = flyerSvg({ card_number: 1 }, 'YOUR PROPERTY', 'CODE', { preview: true });
  } catch {
    document.getElementById('residentFeedbackDesignPreview').textContent = 'Flyer preview could not load. Refresh to try again.';
  }
  const count = document.getElementById('residentFeedbackCount');
  count?.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}

const observer = new MutationObserver(() => { if (renderAdminPage()) observer.disconnect(); });
if (root) observer.observe(root, { childList: true, subtree: true });
renderAdminPage();
