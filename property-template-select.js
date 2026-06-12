import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const env = window.__ENV || {};
const supabase = env.SUPABASE_URL && env.SUPABASE_ANON_KEY
  ? createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
  : null;

const PROPERTIES_TABLE = 'portal_properties';

const stages = [
  { id: 'new_leads', label: 'New Leads', badge: 'New', tone: 'green' },
  { id: 'walkthrough', label: 'Walkthrough', badge: 'Walkthrough', tone: 'blue' },
  { id: 'quote_sent', label: 'Quote Sent', badge: 'Quote', tone: 'yellow' },
  { id: 'contract_out', label: 'Contract Out', badge: 'Contract', tone: 'violet' },
  { id: 'active', label: 'Active', badge: 'Active', tone: 'green' }
];

const els = {
  form: document.getElementById('propertyForm'),
  list: document.getElementById('propertiesList'),
  message: document.getElementById('propertyMessage'),
  modal: document.getElementById('propertyModal'),
  modalTitle: document.getElementById('propertyModalTitle'),
  openModal: document.getElementById('openPropertyModalBtn'),
  closeModal: document.getElementById('closePropertyModalBtn'),
  detail: document.getElementById('propertyDetailPanel'),
  summary: document.getElementById('pipelineSummary'),
  templateSelect: document.getElementById('property_checklist_template_input'),
  clientSelect: document.getElementById('property_client_id_input'),
  clientName: document.getElementById('property_client_name_input'),
  clientEmail: document.getElementById('property_client_email_input'),
  logout: document.getElementById('logoutBtn')
};

let currentUser = null;
let properties = [];
let clients = [];
let templates = [];
let selectedPropertyId = null;
let draggedPropertyId = null;

function html(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\x22/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function normalizeStage(stageId) {
  return stages.some((stage) => stage.id === stageId) ? stageId : 'new_leads';
}

function getStage(stageId) {
  return stages.find((stage) => stage.id === normalizeStage(stageId)) || stages[0];
}

function getNextStage(stageId) {
  const index = stages.findIndex((stage) => stage.id === normalizeStage(stageId));
  return stages[index + 1] || null;
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function propertyName(property) {
  return property?.name || property?.property_name || 'Untitled Property';
}

function clientName(client) {
  return client?.name || client?.company_name || client?.client_name || client?.full_name || client?.email || 'Unnamed Client';
}

function clientNameById(clientId) {
  const client = clients.find((item) => item.id === clientId);
  return client ? clientName(client) : 'Admin account';
}

function templateName(templateId) {
  return templates.find((template) => template.id === templateId)?.name || 'No template';
}

function formatDateTime(value) {
  if (!value) return 'Not scheduled';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not scheduled';
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function money(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return 'Not set';
  return amount.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function frequencyLabel(value) {
  return { weekly: 'Weekly', biweekly: 'Every 2 weeks', monthly: 'Monthly' }[value] || value || 'Weekly';
}

function recurringLabel(property) {
  if (!property?.recurring_enabled) return 'Off';
  const next = formatDateTime(property.recurring_next_due_at);
  return next === 'Not scheduled' ? frequencyLabel(property.recurring_frequency) : `${frequencyLabel(property.recurring_frequency)} | ${next}`;
}

function showMessage(text, isError = false) {
  if (!els.message) return;
  els.message.textContent = text;
  els.message.classList.toggle('error', isError);
}

function showSummary(text, isError = false) {
  if (!els.summary) return;
  els.summary.textContent = text;
  els.summary.classList.toggle('error', isError);
}

function value(id) {
  return document.getElementById(id)?.value?.trim() || '';
}

function setValue(id, nextValue) {
  const input = document.getElementById(id);
  if (input) input.value = nextValue ?? '';
}

function flattenTemplate(template) {
  return list(template?.sections).flatMap((section) => {
    const sectionItems = list(section.items).map((item) => ({
      category: section.title || 'General',
      task: item.label || item.task || '',
      required: true,
      media_required: item.type === 'photo' ? 'photo' : 'none',
      notes: item.type && item.type !== 'checklist' ? `Response type: ${item.type}` : ''
    }));

    const roomItems = list(section.rooms).flatMap((room) => (
      list(room.items).map((item) => ({
        category: room.title || section.title || 'General',
        task: item.label || item.task || '',
        required: true,
        media_required: item.type === 'photo' ? 'photo' : 'none',
        notes: item.type && item.type !== 'checklist' ? `Response type: ${item.type}` : ''
      }))
    ));

    return [...sectionItems, ...roomItems];
  }).filter((item) => item.task);
}

async function requireAdmin() {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  if (!user) {
    window.location.href = 'login.html';
    return null;
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (error || data?.role !== 'admin') {
    window.location.href = data?.role === 'contractor' ? 'contractor.html' : 'login.html';
    return null;
  }

  return user;
}

async function loadClients() {
  if (!els.clientSelect) return;

  const { data, error } = await supabase.from('clients').select('*');
  if (error) {
    clients = [];
    els.clientSelect.innerHTML = '<option value="">Client list unavailable - save under admin</option>';
    return;
  }

  clients = (data || []).sort((a, b) => clientName(a).localeCompare(clientName(b)));
  els.clientSelect.innerHTML = [
    '<option value="">Save under admin or add new client</option>',
    ...clients.map((client) => `<option value='${html(client.id)}'>${html(clientName(client))}</option>`)
  ].join('');
}

async function loadTemplates() {
  if (!els.templateSelect) return;

  const { data, error } = await supabase
    .from('checklist_templates')
    .select('*')
    .order('updated_at', { ascending: false });

  if (error) {
    templates = [];
    els.templateSelect.innerHTML = '<option value="">Run checklist template migration first</option>';
    return;
  }

  templates = data || [];
  els.templateSelect.innerHTML = [
    '<option value="">No checklist template selected</option>',
    ...templates.map((template) => `<option value='${html(template.id)}'>${html(template.name)}</option>`)
  ].join('');
}

async function loadProperties() {
  showSummary('Loading properties...');

  const { data, error } = await supabase
    .from(PROPERTIES_TABLE)
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    showSummary(`Error loading properties: ${error.message}`, true);
    if (els.list) els.list.innerHTML = `<p class='pipeline-empty wide'>${html(error.message)}</p>`;
    renderDetail(null);
    return;
  }

  properties = (data || []).map((property) => ({
    ...property,
    pipeline_stage: normalizeStage(property.pipeline_stage)
  }));

  if (!properties.some((property) => property.id === selectedPropertyId)) {
    selectedPropertyId = properties[0]?.id || null;
  }

  renderPipeline();
}

function renderPipeline() {
  if (!els.list) return;

  const recurring = properties.filter((property) => property.recurring_enabled).length;
  const active = properties.filter((property) => property.pipeline_stage === 'active').length;
  showSummary(properties.length ? `${properties.length} properties | ${active} active | ${recurring} recurring` : 'No properties saved yet.');
  els.list.innerHTML = stages.map(renderStage).join('');
  renderDetail(properties.find((property) => property.id === selectedPropertyId) || null);
}

function renderStage(stage) {
  const stageProperties = properties.filter((property) => property.pipeline_stage === stage.id);
  const recurring = stageProperties.filter((property) => property.recurring_enabled).length;
  const nextDue = stageProperties
    .filter((property) => property.recurring_next_due_at)
    .sort((a, b) => new Date(a.recurring_next_due_at) - new Date(b.recurring_next_due_at))[0];

  return `
    <article class='property-stage-column ${html(stage.tone)}' data-stage-id='${html(stage.id)}'>
      <header class='property-stage-header'>
        <div><span>${html(stage.label)}</span><strong>${stageProperties.length}</strong></div>
        <em>${html(stage.badge)}</em>
      </header>
      <div class='property-stage-metrics'>
        <span>${recurring} recurring</span>
        <span>${html(nextDue ? formatDateTime(nextDue.recurring_next_due_at) : 'No next date')}</span>
      </div>
      <div class='property-stage-list'>
        ${stageProperties.length ? stageProperties.map(renderCard).join('') : '<div class=\'pipeline-empty\'>No properties</div>'}
      </div>
      <button type='button' class='stage-add-btn' data-open-stage='${html(stage.id)}'>+ Add to ${html(stage.label)}</button>
    </article>
  `;
}

function renderCard(property) {
  const stage = getStage(property.pipeline_stage);
  const next = getNextStage(stage.id);
  const move = next ? `<button type='button' data-move-next='${html(property.id)}'>Move next</button>` : '';

  return `
    <article class='property-pipeline-card${property.id === selectedPropertyId ? ' selected' : ''}' draggable='true' data-property-id='${html(property.id)}'>
      <div class='property-card-head'>
        <div>
          <strong>${html(propertyName(property))}</strong>
          <small>${html(property.address || 'Address not set')}</small>
        </div>
        <span class='stage-badge ${html(stage.tone)}'>${html(stage.badge)}</span>
      </div>
      <dl class='property-card-facts'>
        <div><dt>Client</dt><dd>${html(clientNameById(property.client_id))}</dd></div>
        <div><dt>Service</dt><dd>${html(property.default_service_type || 'Not set')}</dd></div>
        <div><dt>Recurring</dt><dd>${html(recurringLabel(property))}</dd></div>
      </dl>
      <div class='property-card-actions'>
        <button type='button' data-view-property='${html(property.id)}'>Details</button>
        <button type='button' data-edit-property='${html(property.id)}'>Edit</button>
        ${move}
      </div>
    </article>
  `;
}

function renderDetail(property) {
  if (!els.detail) return;

  if (!property) {
    els.detail.innerHTML = `
      <div class='property-detail-empty'>
        <span class='stage-badge green'>New</span>
        <h2>No property selected</h2>
        <p>Add the first property to start building the pipeline.</p>
        <button type='button' class='new-btn' data-open-property-modal>+ Add Property</button>
      </div>
    `;
    return;
  }

  const stage = getStage(property.pipeline_stage);
  const next = getNextStage(stage.id);
  const move = next ? `<button type='button' class='new-btn' data-move-next='${html(property.id)}'>Move to ${html(next.label)}</button>` : '';

  els.detail.innerHTML = `
    <header class='property-detail-header'>
      <span class='stage-badge ${html(stage.tone)}'>${html(stage.label)}</span>
      <h2>${html(propertyName(property))}</h2>
      <p>${html(property.address || 'Address not set')}</p>
    </header>
    <div class='property-detail-actions'>
      <button type='button' class='secondary-command-btn' data-edit-property='${html(property.id)}'>Edit Property</button>
      ${move}
    </div>
    <div class='property-detail-grid'>
      <div><span>Client</span><strong>${html(clientNameById(property.client_id))}</strong></div>
      <div><span>Service</span><strong>${html(property.default_service_type || 'Not set')}</strong></div>
      <div><span>Checklist</span><strong>${html(templateName(property.checklist_template_id))}</strong></div>
      <div><span>Checklist Items</span><strong>${list(property.checklist_items).length}</strong></div>
    </div>
    <section class='property-detail-section'>
      <h3>Recurring</h3>
      <p>${html(recurringLabel(property))}</p>
      <p>${html(property.recurring_assignment_title || 'Assignment title not set')}</p>
      <p>${html(money(property.recurring_pay_amount))}</p>
    </section>
    <section class='property-detail-section'>
      <h3>Scope</h3>
      <p>${html(property.default_scope || 'Scope not set')}</p>
    </section>
    <section class='property-detail-section'>
      <h3>Operations Notes</h3>
      <p><strong>Supplies:</strong> ${html(property.supplies_notes || 'None')}</p>
      <p><strong>Access:</strong> ${html(property.access_notes || 'None')}</p>
      <p><strong>Special:</strong> ${html(property.special_instructions || 'None')}</p>
    </section>
  `;
}

function resetForm(stageId = 'new_leads') {
  els.form?.reset();
  setValue('property_id_input', '');
  setValue('property_pipeline_stage_input', stageId);
  setValue('recurring_frequency_input', 'weekly');
  if (els.clientSelect) els.clientSelect.value = '';
  if (els.templateSelect) els.templateSelect.value = '';
  if (els.modalTitle) els.modalTitle.textContent = 'Add Property';
  showMessage('');
}

function fillForm(property) {
  setValue('property_id_input', property.id);
  setValue('property_name_input', propertyName(property));
  setValue('property_address_input', property.address);
  setValue('property_pipeline_stage_input', normalizeStage(property.pipeline_stage));
  setValue('property_service_type_input', property.default_service_type);
  setValue('property_scope_input', property.default_scope);
  setValue('property_supplies_input', property.supplies_notes);
  setValue('property_instructions_input', property.special_instructions);
  setValue('property_access_input', property.access_notes);
  setValue('recurring_frequency_input', property.recurring_frequency || 'weekly');
  setValue('recurring_start_date_input', property.recurring_start_date);
  setValue('recurring_start_time_input', String(property.recurring_start_time || '').slice(0, 5));
  setValue('recurring_end_time_input', String(property.recurring_end_time || '').slice(0, 5));
  setValue('recurring_pay_amount_input', property.recurring_pay_amount);
  setValue('recurring_assignment_title_input', property.recurring_assignment_title);

  if (els.clientSelect) els.clientSelect.value = property.client_id || '';
  if (els.templateSelect) els.templateSelect.value = property.checklist_template_id || '';
  if (els.clientName) els.clientName.value = '';
  if (els.clientEmail) els.clientEmail.value = '';
  if (els.modalTitle) els.modalTitle.textContent = 'Edit Property';

  const recurringEnabled = document.getElementById('recurring_enabled_input');
  if (recurringEnabled) recurringEnabled.checked = Boolean(property.recurring_enabled);
}

function openModal(property = null, stageId = 'new_leads') {
  if (!els.modal) return;
  property ? fillForm(property) : resetForm(stageId);
  els.modal.hidden = false;
  document.body.classList.add('property-modal-open');
  setTimeout(() => document.getElementById('property_name_input')?.focus(), 0);
}

function closeModal() {
  if (!els.modal) return;
  els.modal.hidden = true;
  document.body.classList.remove('property-modal-open');
}

async function createClientRecord(name, email) {
  const attempts = [
    { name, email, created_by: currentUser?.id },
    { name, email },
    { name },
    { company_name: name, email, created_by: currentUser?.id },
    { company_name: name, email },
    { company_name: name },
    { client_name: name, email, created_by: currentUser?.id },
    { client_name: name, email },
    { client_name: name }
  ].map((payload) => Object.fromEntries(Object.entries(payload).filter(([, item]) => item)));

  let lastError = null;
  for (const payload of attempts) {
    const { data, error } = await supabase.from('clients').insert([payload]).select('*').single();
    if (!error) {
      clients = [...clients, data].sort((a, b) => clientName(a).localeCompare(clientName(b)));
      await loadClients();
      if (els.clientSelect) els.clientSelect.value = data.id;
      return data.id;
    }
    lastError = error;
    if (!['created_by', 'email', 'name', 'company_name', 'client_name'].some((column) => error.message.includes(column))) break;
  }

  showMessage(`Could not create client: ${lastError?.message || 'unknown Supabase error'}`, true);
  return null;
}

async function resolveClientId(existingProperty) {
  if (els.clientSelect?.value) return els.clientSelect.value;
  const newClientName = els.clientName?.value.trim();
  if (existingProperty?.client_id && !newClientName) return existingProperty.client_id;
  if (newClientName) return createClientRecord(newClientName, els.clientEmail?.value.trim() || '');
  return currentUser?.id || null;
}

function firstDue(enabled, dateValue, timeValue) {
  if (!enabled || !dateValue) return null;
  return new Date(`${dateValue}T${timeValue || '09:00'}`).toISOString();
}

async function saveProperty(event) {
  event.preventDefault();
  if (!currentUser) return;

  const propertyId = value('property_id_input');
  const existingProperty = properties.find((property) => property.id === propertyId);
  const selectedTemplate = templates.find((template) => template.id === els.templateSelect?.value);
  const recurringEnabled = Boolean(document.getElementById('recurring_enabled_input')?.checked);
  const recurringDate = value('recurring_start_date_input') || null;
  const recurringTime = value('recurring_start_time_input') || null;
  const name = value('property_name_input');
  const clientId = await resolveClientId(existingProperty);

  if (!clientId) return;
  if (!name) return showMessage('Property name is required.', true);
  if (recurringEnabled && !recurringDate) return showMessage('First assignment date is required for recurring assignments.', true);

  showMessage('Saving property...');

  const payload = {
    client_id: clientId,
    property_name: name,
    name,
    address: value('property_address_input'),
    pipeline_stage: normalizeStage(value('property_pipeline_stage_input') || existingProperty?.pipeline_stage),
    default_service_type: value('property_service_type_input'),
    checklist_template_id: selectedTemplate?.id || null,
    checklist_items: selectedTemplate ? flattenTemplate(selectedTemplate) : list(existingProperty?.checklist_items),
    default_scope: value('property_scope_input'),
    supplies_notes: value('property_supplies_input'),
    special_instructions: value('property_instructions_input'),
    access_notes: value('property_access_input'),
    recurring_enabled: recurringEnabled,
    recurring_frequency: value('recurring_frequency_input') || 'weekly',
    recurring_start_date: recurringDate,
    recurring_start_time: recurringTime,
    recurring_end_time: value('recurring_end_time_input') || null,
    recurring_pay_amount: value('recurring_pay_amount_input') || null,
    recurring_assignment_title: value('recurring_assignment_title_input') || null,
    recurring_next_due_at: firstDue(recurringEnabled, recurringDate, recurringTime)
  };

  const query = propertyId
    ? supabase.from(PROPERTIES_TABLE).update(payload).eq('id', propertyId)
    : supabase.from(PROPERTIES_TABLE).insert([{ ...payload, created_by: currentUser.id }]);
  const { data, error } = await query.select('*').single();

  if (error) {
    const hint = error.message.includes('client_id') ? ' Select an existing client or enter a new client name, then try again.' : '';
    return showMessage(`Error: ${error.message}${hint}`, true);
  }

  selectedPropertyId = data?.id || propertyId || selectedPropertyId;
  await Promise.all([loadClients(), loadProperties()]);
  showMessage(propertyId ? 'Property updated.' : 'Property saved.');
  closeModal();
}

async function moveProperty(propertyId, nextStageId) {
  const property = properties.find((item) => item.id === propertyId);
  if (!property) return;

  const previousStage = property.pipeline_stage;
  const nextStage = normalizeStage(nextStageId);
  if (previousStage === nextStage) return;

  selectedPropertyId = propertyId;
  property.pipeline_stage = nextStage;
  renderPipeline();
  showSummary(`Moving ${propertyName(property)} to ${getStage(nextStage).label}...`);

  const { data, error } = await supabase
    .from(PROPERTIES_TABLE)
    .update({ pipeline_stage: nextStage })
    .eq('id', propertyId)
    .select('*')
    .single();

  if (error) {
    property.pipeline_stage = previousStage;
    renderPipeline();
    return showSummary(`Error updating stage: ${error.message}`, true);
  }

  properties = properties.map((item) => item.id === propertyId ? { ...item, ...data, pipeline_stage: normalizeStage(data.pipeline_stage) } : item);
  renderPipeline();
}

function target(event) {
  return event.target instanceof Element ? event.target : null;
}

async function handlePipelineClick(event) {
  const node = target(event);
  if (!node) return;

  const stageButton = node.closest('[data-open-stage]');
  const openButton = node.closest('[data-open-property-modal]');
  const viewButton = node.closest('[data-view-property]');
  const editButton = node.closest('[data-edit-property]');
  const moveButton = node.closest('[data-move-next]');

  if (stageButton) return openModal(null, normalizeStage(stageButton.dataset.openStage));
  if (openButton) return openModal();
  if (viewButton) {
    selectedPropertyId = viewButton.dataset.viewProperty;
    return renderPipeline();
  }
  if (editButton) {
    const property = properties.find((item) => item.id === editButton.dataset.editProperty);
    if (property) {
      selectedPropertyId = property.id;
      renderPipeline();
      openModal(property);
    }
    return;
  }
  if (moveButton) {
    const property = properties.find((item) => item.id === moveButton.dataset.moveNext);
    const next = getNextStage(property?.pipeline_stage);
    if (next) await moveProperty(moveButton.dataset.moveNext, next.id);
  }
}

function wireDragAndDrop() {
  els.list?.addEventListener('dragstart', (event) => {
    const card = target(event)?.closest('[data-property-id]');
    if (!card || !event.dataTransfer) return;
    draggedPropertyId = card.dataset.propertyId;
    card.classList.add('is-dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', draggedPropertyId);
  });

  els.list?.addEventListener('dragend', (event) => {
    target(event)?.closest('[data-property-id]')?.classList.remove('is-dragging');
    draggedPropertyId = null;
    document.querySelectorAll('.property-stage-column.is-over').forEach((column) => column.classList.remove('is-over'));
  });

  els.list?.addEventListener('dragover', (event) => {
    const column = target(event)?.closest('[data-stage-id]');
    if (!column || !event.dataTransfer) return;
    event.preventDefault();
    column.classList.add('is-over');
    event.dataTransfer.dropEffect = 'move';
  });

  els.list?.addEventListener('dragleave', (event) => {
    const column = target(event)?.closest('[data-stage-id]');
    const related = event.relatedTarget instanceof Node ? event.relatedTarget : null;
    if (column && !column.contains(related)) column.classList.remove('is-over');
  });

  els.list?.addEventListener('drop', async (event) => {
    const column = target(event)?.closest('[data-stage-id]');
    if (!column) return;
    event.preventDefault();
    column.classList.remove('is-over');
    const propertyId = event.dataTransfer?.getData('text/plain') || draggedPropertyId;
    if (propertyId) await moveProperty(propertyId, column.dataset.stageId);
  });
}

async function init() {
  if (!els.form) return;

  els.openModal?.addEventListener('click', () => openModal());
  els.closeModal?.addEventListener('click', closeModal);
  els.modal?.addEventListener('click', (event) => {
    if (target(event)?.closest('[data-close-property-modal]')) closeModal();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && els.modal && !els.modal.hidden) closeModal();
  });
  document.getElementById('resetPropertyFormBtn')?.addEventListener('click', () => resetForm());

  if (!supabase) {
    showMessage('Supabase configuration is missing. Check env.js before saving properties.', true);
    showSummary('Supabase configuration is missing.', true);
    return;
  }

  currentUser = await requireAdmin();
  if (!currentUser) return;

  await Promise.all([loadClients(), loadTemplates()]);
  await loadProperties();

  els.form.addEventListener('submit', saveProperty);
  els.list?.addEventListener('click', handlePipelineClick);
  els.detail?.addEventListener('click', handlePipelineClick);
  els.clientSelect?.addEventListener('change', () => {
    if (els.clientSelect.value) {
      if (els.clientName) els.clientName.value = '';
      if (els.clientEmail) els.clientEmail.value = '';
    }
  });
  els.logout?.addEventListener('click', async () => {
    await supabase.auth.signOut();
    window.location.href = 'login.html';
  });
  wireDragAndDrop();
}

init();
