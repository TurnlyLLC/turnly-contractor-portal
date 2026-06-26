import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const TABLE = 'checklist_templates';
const TYPES = [
  ['checklist', 'Checkbox'],
  ['pass_fail', 'Pass / Fail'],
  ['photo', 'Photo'],
  ['text', 'Text'],
  ['number', 'Number']
];

const env = window.__ENV || {};
const supabase = env.SUPABASE_URL && env.SUPABASE_ANON_KEY
  ? createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
  : null;

const state = {
  templates: [],
  draft: blankTemplate(),
  selectedId: null,
  search: '',
  loading: true,
  saving: false,
  message: '',
  tone: '',
  user: null
};

function uid() {
  return window.crypto?.randomUUID?.() || `qa-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\x22/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function sel(value, expected) {
  return String(value || '') === String(expected) ? 'selected' : '';
}

function chk(value) {
  return value ? 'checked' : '';
}

function blankItem() {
  return {
    id: uid(),
    label: '',
    task: '',
    type: 'checklist',
    required: true,
    notes: '',
    fail_triggers_reclean: false
  };
}

function blankSection(title = 'General QA') {
  return { id: uid(), title, items: [blankItem()] };
}

function blankTemplate() {
  return {
    id: null,
    name: '',
    department: 'Quality',
    subdepartment: '',
    priority: 'normal',
    description: '',
    sections: [blankSection()]
  };
}

function typeKey(value) {
  const key = String(value || 'checklist').toLowerCase().replace(/[^a-z0-9]+/g, '_');
  return TYPES.some(([type]) => type === key) ? key : 'checklist';
}

function normalizeSections(value) {
  let sections = value;
  if (typeof sections === 'string') {
    try {
      sections = JSON.parse(sections);
    } catch {
      sections = [];
    }
  }
  if (!Array.isArray(sections) || !sections.length) return [blankSection()];

  return sections.map((section) => {
    const directItems = Array.isArray(section?.items) ? section.items : [];
    const roomItems = Array.isArray(section?.rooms)
      ? section.rooms.flatMap((room) => (
        Array.isArray(room?.items)
          ? room.items.map((item) => ({ ...item, notes: [room.title, item?.notes].filter(Boolean).join(' - ') }))
          : []
      ))
      : [];

    const items = [...directItems, ...roomItems].map((item) => ({
      id: item?.id || uid(),
      label: item?.label || item?.task || '',
      task: item?.task || item?.label || '',
      type: typeKey(item?.type),
      required: item?.required ?? true,
      notes: item?.notes || item?.standard || item?.description || '',
      fail_triggers_reclean: Boolean(item?.fail_triggers_reclean || item?.reclean_required)
    }));

    return {
      id: section?.id || uid(),
      title: section?.title || section?.name || 'Untitled Section',
      items: items.length ? items : [blankItem()]
    };
  });
}

function normalizeTemplate(row) {
  return {
    id: row?.id || null,
    name: row?.name || '',
    department: row?.department || 'Quality',
    subdepartment: row?.subdepartment || '',
    priority: row?.priority || 'normal',
    description: row?.description || '',
    sections: normalizeSections(row?.sections),
    updated_at: row?.updated_at || row?.created_at || ''
  };
}

function itemCount(template = state.draft) {
  return template.sections.reduce((sum, section) => sum + section.items.length, 0);
}

function photoCount(template = state.draft) {
  return template.sections.reduce((sum, section) => (
    sum + section.items.filter((item) => item.type === 'photo').length
  ), 0);
}

function requiredCount(template = state.draft) {
  return template.sections.reduce((sum, section) => (
    sum + section.items.filter((item) => item.required).length
  ), 0);
}

function waitForShell() {
  return new Promise((resolve) => {
    const existing = document.querySelector('#adminSuiteApp .suite-content');
    if (existing) {
      resolve(existing);
      return;
    }
    const observer = new MutationObserver(() => {
      const content = document.querySelector('#adminSuiteApp .suite-content');
      if (!content) return;
      observer.disconnect();
      resolve(content);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  });
}

function setHeading() {
  const title = document.querySelector('.page-heading h1');
  const subtitle = document.querySelector('.page-heading p');
  if (title) title.textContent = 'QA Checklists';
  if (subtitle) subtitle.textContent = 'Build reusable QA templates for inspections, reviews, and assignment closeouts.';
}

function qualityTabs() {
  return `
    <div class='suite-tabs qa-checklist-tabs'>
      <a class='suite-tab' href='qa-queue.html'>QA Queue</a>
      <a class='suite-tab' href='qa-reviews.html'>QA Reviews</a>
      <a class='suite-tab active' href='qa-checklists.html'>QA Checklists</a>
      <a class='suite-tab' href='qa-analytics.html'>QA Analytics</a>
      <a class='suite-tab' href='videos.html'>Video Library</a>
    </div>
  `;
}

function templatesForList() {
  const query = state.search.trim().toLowerCase();
  if (!query) return state.templates;
  return state.templates.filter((template) => (
    [template.name, template.department, template.subdepartment, template.description]
      .some((value) => String(value || '').toLowerCase().includes(query))
  ));
}

function templateCard(template) {
  const active = template.id === state.selectedId ? 'active' : '';
  const meta = [template.department, template.subdepartment, `${template.sections.length} sections`, `${itemCount(template)} items`]
    .filter(Boolean)
    .join(' / ');
  return `
    <button type='button' class='qa-template-card ${active}' data-template-id='${esc(template.id)}'>
      <strong>${esc(template.name || 'Untitled Checklist')}</strong>
      <span>${esc(meta)}</span>
    </button>
  `;
}

function renderLibrary() {
  const templates = templatesForList();
  return `
    <aside class='suite-panel qa-template-library'>
      <div class='qa-panel-title'>
        <div>
          <h2>Templates</h2>
          <p>${state.loading ? 'Loading from Supabase...' : `${state.templates.length} saved templates`}</p>
        </div>
        <button type='button' class='primary-action qa-compact-action' data-qa-action='new-template'>New</button>
      </div>
      <label class='qa-search-field'>
        <span class='sr-only'>Search templates</span>
        <input id='qaTemplateSearch' type='search' value='${esc(state.search)}' placeholder='Search templates...' data-qa-search />
      </label>
      <div class='qa-template-list'>
        ${templates.length ? templates.map(templateCard).join('') : `<div class='qa-empty-small'>${state.loading ? 'Checking Supabase...' : 'No matching templates yet.'}</div>`}
      </div>
    </aside>
  `;
}

function renderMetrics() {
  return `
    <section class='qa-checklist-metrics' aria-label='Checklist summary'>
      <div class='metric-card'><div class='metric-icon-wrap'>QA</div><div class='metric-body'><span>Templates</span><strong>${state.templates.length}</strong><small>saved in Supabase</small></div></div>
      <div class='metric-card blue'><div class='metric-icon-wrap'>S</div><div class='metric-body'><span>Sections</span><strong>${state.draft.sections.length}</strong><small>in current checklist</small></div></div>
      <div class='metric-card purple'><div class='metric-icon-wrap'>I</div><div class='metric-body'><span>Items</span><strong>${itemCount()}</strong><small>questions and tasks</small></div></div>
      <div class='metric-card yellow'><div class='metric-icon-wrap'>P</div><div class='metric-body'><span>Photo Checks</span><strong>${photoCount()}</strong><small>require image proof</small></div></div>
    </section>
  `;
}

function renderFields() {
  const draft = state.draft;
  return `
    <div class='qa-template-fields'>
      <label class='qa-field'><span>Checklist Name</span><input id='qaTemplateName' type='text' value='${esc(draft.name)}' placeholder='Apartment turnover final QA' data-draft-field='name' /></label>
      <label class='qa-field'><span>Department</span><select id='qaTemplateDepartment' data-draft-field='department'>
        <option ${sel(draft.department, 'Quality')}>Quality</option>
        <option ${sel(draft.department, 'Operations')}>Operations</option>
        <option ${sel(draft.department, 'Contractors')}>Contractors</option>
        <option ${sel(draft.department, 'Clients')}>Clients</option>
      </select></label>
      <label class='qa-field'><span>Subdepartment</span><input id='qaTemplateSubdepartment' type='text' value='${esc(draft.subdepartment)}' placeholder='Turnovers, commercial, re-clean...' data-draft-field='subdepartment' /></label>
      <label class='qa-field'><span>Priority</span><select id='qaTemplatePriority' data-draft-field='priority'>
        <option value='normal' ${sel(draft.priority, 'normal')}>Normal</option>
        <option value='high' ${sel(draft.priority, 'high')}>High</option>
        <option value='critical' ${sel(draft.priority, 'critical')}>Critical</option>
        <option value='low' ${sel(draft.priority, 'low')}>Low</option>
      </select></label>
      <label class='qa-field span-all'><span>Description</span><textarea id='qaTemplateDescription' rows='3' placeholder='When this checklist should be used...' data-draft-field='description'>${esc(draft.description)}</textarea></label>
    </div>
  `;
}

function typeOptions(value) {
  return TYPES.map(([key, label]) => `<option value='${key}' ${sel(value, key)}>${esc(label)}</option>`).join('');
}

function renderItem(item, sectionIndex, itemIndex) {
  return `
    <div class='qa-checklist-item' data-item-index='${itemIndex}'>
      <div class='qa-item-main'>
        <label class='qa-field qa-item-task'><span>Question / Task</span><input type='text' value='${esc(item.label || item.task)}' placeholder='Check baseboards and corners' data-item-field='label' /></label>
        <label class='qa-field'><span>Response</span><select data-item-field='type'>${typeOptions(item.type)}</select></label>
        <label class='qa-toggle'><input type='checkbox' data-item-field='required' ${chk(item.required)} /><span>Required</span></label>
        <label class='qa-toggle'><input type='checkbox' data-item-field='fail_triggers_reclean' ${chk(item.fail_triggers_reclean)} /><span>Reclean</span></label>
      </div>
      <label class='qa-field qa-item-notes'><span>Standard / Notes</span><textarea rows='2' placeholder='What does passing look like?' data-item-field='notes'>${esc(item.notes)}</textarea></label>
      <div class='qa-row-actions'>
        <button type='button' class='secondary-action qa-icon-action' data-qa-action='move-item-up' data-section-index='${sectionIndex}' data-item-index='${itemIndex}'>Up</button>
        <button type='button' class='secondary-action qa-icon-action' data-qa-action='move-item-down' data-section-index='${sectionIndex}' data-item-index='${itemIndex}'>Down</button>
        <button type='button' class='secondary-action qa-icon-action' data-qa-action='duplicate-item' data-section-index='${sectionIndex}' data-item-index='${itemIndex}'>Copy</button>
        <button type='button' class='secondary-action danger-btn qa-icon-action' data-qa-action='delete-item' data-section-index='${sectionIndex}' data-item-index='${itemIndex}'>Delete</button>
      </div>
    </div>
  `;
}

function renderSection(section, sectionIndex) {
  return `
    <section class='qa-builder-section' data-section-index='${sectionIndex}'>
      <header class='qa-section-head'>
        <label class='qa-field'><span>Section</span><input type='text' value='${esc(section.title)}' placeholder='Kitchen, bathrooms, final walkthrough...' data-section-field='title' /></label>
        <div class='qa-section-actions'>
          <button type='button' class='secondary-action qa-icon-action' data-qa-action='move-section-up' data-section-index='${sectionIndex}'>Up</button>
          <button type='button' class='secondary-action qa-icon-action' data-qa-action='move-section-down' data-section-index='${sectionIndex}'>Down</button>
          <button type='button' class='secondary-action danger-btn qa-icon-action' data-qa-action='delete-section' data-section-index='${sectionIndex}'>Delete</button>
        </div>
      </header>
      <div class='qa-section-items'>${section.items.map((item, itemIndex) => renderItem(item, sectionIndex, itemIndex)).join('')}</div>
      <button type='button' class='secondary-action qa-add-item' data-qa-action='add-item' data-section-index='${sectionIndex}'>+ Add Item</button>
    </section>
  `;
}

function renderEditor() {
  const saved = Boolean(state.draft.id);
  return `
    <section class='suite-panel qa-editor-panel'>
      <div class='qa-editor-head'>
        <div>
          <h2>${saved ? 'Edit Checklist' : 'New Checklist'}</h2>
          <p>Changes save to Supabase and become available for assignment and property workflows.</p>
        </div>
        <div class='qa-editor-actions'>
          <button type='button' class='secondary-action' data-qa-action='duplicate-template' ${state.saving ? 'disabled' : ''}>Duplicate</button>
          <button type='button' class='secondary-action danger-btn' data-qa-action='delete-template' ${saved ? '' : 'disabled'}>Delete</button>
          <button type='button' class='primary-action' data-qa-action='save-template' ${state.saving ? 'disabled' : ''}>${state.saving ? 'Saving...' : 'Save Template'}</button>
        </div>
      </div>
      ${renderFields()}
      <div class='qa-builder-toolbar'>
        <div><strong>Checklist Builder</strong><span>${itemCount()} total items</span></div>
        <button type='button' class='secondary-action' data-qa-action='add-section'>+ Add Section</button>
      </div>
      <div class='qa-sections'>${state.draft.sections.map(renderSection).join('')}</div>
    </section>
  `;
}

function renderPreview() {
  return `
    <aside class='suite-panel qa-preview-panel'>
      <div class='qa-panel-title'><div><h2>Live Preview</h2><p>${requiredCount()} required / ${photoCount()} photo checks</p></div></div>
      <div class='qa-preview-meta'>
        <strong>${esc(state.draft.name || 'Untitled Checklist')}</strong>
        <span>${esc([state.draft.department, state.draft.subdepartment, state.draft.priority].filter(Boolean).join(' / '))}</span>
      </div>
      <div class='qa-preview-list'>
        ${state.draft.sections.map((section) => `
          <section>
            <h3>${esc(section.title || 'Untitled Section')}</h3>
            ${section.items.map((item) => `
              <div class='qa-preview-item'>
                <span>${esc(item.label || item.task || 'Untitled item')}</span>
                <em>${esc(item.type.replace(/_/g, ' '))}${item.required ? ' / required' : ''}</em>
              </div>
            `).join('')}
          </section>
        `).join('')}
      </div>
      <p class='qa-helper-note'>Photo items will require image proof when this template is flattened into assignment QA tasks.</p>
    </aside>
  `;
}

function renderStatus() {
  return state.message ? `<div class='qa-status ${state.tone}'>${esc(state.message)}</div>` : '';
}

function render() {
  setHeading();
  const content = document.querySelector('#adminSuiteApp .suite-content');
  if (!content) return;
  content.innerHTML = `
    <div class='qa-checklists-page' data-qa-checklists>
      ${qualityTabs()}
      ${renderMetrics()}
      ${renderStatus()}
      <div class='qa-checklist-workspace'>
        ${renderLibrary()}
        ${renderEditor()}
        ${renderPreview()}
      </div>
    </div>
  `;
}

function readDraft() {
  const root = document.querySelector('[data-qa-checklists]');
  if (!root) return;
  state.draft.name = document.getElementById('qaTemplateName')?.value || '';
  state.draft.department = document.getElementById('qaTemplateDepartment')?.value || 'Quality';
  state.draft.subdepartment = document.getElementById('qaTemplateSubdepartment')?.value || '';
  state.draft.priority = document.getElementById('qaTemplatePriority')?.value || 'normal';
  state.draft.description = document.getElementById('qaTemplateDescription')?.value || '';
  state.draft.sections = Array.from(root.querySelectorAll('.qa-builder-section')).map((sectionEl) => {
    const sectionIndex = Number(sectionEl.dataset.sectionIndex);
    return {
      id: state.draft.sections[sectionIndex]?.id || uid(),
      title: sectionEl.querySelector('[data-section-field=title]')?.value || '',
      items: Array.from(sectionEl.querySelectorAll('.qa-checklist-item')).map((itemEl) => {
        const itemIndex = Number(itemEl.dataset.itemIndex);
        const existing = state.draft.sections[sectionIndex]?.items[itemIndex] || blankItem();
        const label = itemEl.querySelector('[data-item-field=label]')?.value || '';
        return {
          id: existing.id || uid(),
          label,
          task: label,
          type: typeKey(itemEl.querySelector('[data-item-field=type]')?.value),
          required: Boolean(itemEl.querySelector('[data-item-field=required]')?.checked),
          notes: itemEl.querySelector('[data-item-field=notes]')?.value || '',
          fail_triggers_reclean: Boolean(itemEl.querySelector('[data-item-field=fail_triggers_reclean]')?.checked)
        };
      })
    };
  });
}

function payload() {
  readDraft();
  const sections = state.draft.sections.map((section) => ({
    id: section.id || uid(),
    title: section.title.trim() || 'Untitled Section',
    items: section.items.map((item) => ({
      id: item.id || uid(),
      label: (item.label || item.task || '').trim(),
      task: (item.task || item.label || '').trim(),
      type: typeKey(item.type),
      required: Boolean(item.required),
      notes: (item.notes || '').trim(),
      fail_triggers_reclean: Boolean(item.fail_triggers_reclean)
    })).filter((item) => item.label || item.notes)
  })).filter((section) => section.title || section.items.length);

  return {
    name: state.draft.name.trim(),
    department: state.draft.department || 'Quality',
    subdepartment: state.draft.subdepartment.trim(),
    priority: state.draft.priority || 'normal',
    description: state.draft.description.trim(),
    sections: sections.length ? sections : [blankSection()]
  };
}

function setMessage(message, tone = '') {
  state.message = message;
  state.tone = tone;
  render();
}

function missingColumn(error, data) {
  const message = String(error?.message || '').toLowerCase();
  return Object.keys(data).find((key) => (
    message.includes(`'${key.toLowerCase()}'`) ||
    message.includes(`column ${key.toLowerCase()}`) ||
    message.includes(`.${key.toLowerCase()}`)
  ));
}

async function saveTemplate() {
  if (!supabase) {
    setMessage('Supabase is not configured on this page.', 'error');
    return;
  }
  const data = payload();
  if (!data.name) {
    setMessage('Checklist name is required before saving.', 'error');
    return;
  }

  state.saving = true;
  state.message = 'Saving checklist to Supabase...';
  state.tone = '';
  render();

  let writeData = { ...data, updated_at: new Date().toISOString() };
  if (!state.draft.id && state.user?.id) writeData.created_by = state.user.id;

  let result;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    result = state.draft.id
      ? await supabase.from(TABLE).update(writeData).eq('id', state.draft.id).select('*').single()
      : await supabase.from(TABLE).insert([writeData]).select('*').single();
    if (!result.error) break;
    const column = missingColumn(result.error, writeData);
    if (!column) break;
    delete writeData[column];
  }

  state.saving = false;
  if (result?.error) {
    setMessage(`Unable to save checklist: ${result.error.message}`, 'error');
    return;
  }
  state.draft = normalizeTemplate(result.data);
  state.selectedId = state.draft.id;
  await loadTemplates(false);
  setMessage('Checklist saved.', 'success');
}

async function deleteTemplate() {
  if (!supabase || !state.draft.id) return;
  if (!window.confirm(`Delete ${state.draft.name || 'this checklist'}? This cannot be undone.`)) return;
  const { error } = await supabase.from(TABLE).delete().eq('id', state.draft.id);
  if (error) {
    setMessage(`Unable to delete checklist: ${error.message}`, 'error');
    return;
  }
  state.selectedId = null;
  state.draft = blankTemplate();
  await loadTemplates(false);
  setMessage('Checklist deleted.', 'success');
}

async function loadTemplates(showLoading = true) {
  if (!supabase) {
    state.loading = false;
    state.templates = [];
    setMessage('Supabase is not configured on this page.', 'error');
    return;
  }
  if (showLoading) {
    state.loading = true;
    render();
  }
  let result = await supabase.from(TABLE).select('*').order('updated_at', { ascending: false });
  if (result.error && String(result.error.message || '').includes('updated_at')) {
    result = await supabase.from(TABLE).select('*').order('created_at', { ascending: false });
  }
  if (result.error && String(result.error.message || '').includes('created_at')) {
    result = await supabase.from(TABLE).select('*');
  }
  state.loading = false;
  if (result.error) {
    state.templates = [];
    state.message = `Unable to load checklist templates: ${result.error.message}`;
    state.tone = 'error';
    render();
    return;
  }
  state.templates = (result.data || []).map(normalizeTemplate);
  if (!state.selectedId && state.templates[0]) {
    state.selectedId = state.templates[0].id;
    state.draft = normalizeTemplate(state.templates[0]);
  } else if (state.selectedId) {
    const selectedTemplate = state.templates.find((template) => template.id === state.selectedId);
    if (selectedTemplate) state.draft = normalizeTemplate(selectedTemplate);
  }
  render();
}

async function loadUser() {
  if (!supabase) return;
  try {
    const { data } = await supabase.auth.getUser();
    state.user = data?.user || null;
  } catch {
    state.user = null;
  }
}

function selectTemplate(id) {
  const template = state.templates.find((item) => item.id === id);
  if (!template) return;
  state.selectedId = template.id;
  state.draft = normalizeTemplate(template);
  state.message = '';
  state.tone = '';
  render();
}

function newTemplate() {
  state.selectedId = null;
  state.draft = blankTemplate();
  state.message = '';
  state.tone = '';
  render();
}

function duplicateTemplate() {
  readDraft();
  state.selectedId = null;
  state.draft = {
    ...state.draft,
    id: null,
    name: state.draft.name ? `Copy of ${state.draft.name}` : '',
    sections: state.draft.sections.map((section) => ({
      ...section,
      id: uid(),
      items: section.items.map((item) => ({ ...item, id: uid() }))
    }))
  };
  setMessage('Copy created. Save it when you are ready.', 'success');
}

function moveSection(sectionIndex, direction) {
  readDraft();
  const next = sectionIndex + direction;
  if (next < 0 || next >= state.draft.sections.length) return;
  [state.draft.sections[sectionIndex], state.draft.sections[next]] = [state.draft.sections[next], state.draft.sections[sectionIndex]];
  render();
}

function moveItem(sectionIndex, itemIndex, direction) {
  readDraft();
  const items = state.draft.sections[sectionIndex]?.items;
  const next = itemIndex + direction;
  if (!items || next < 0 || next >= items.length) return;
  [items[itemIndex], items[next]] = [items[next], items[itemIndex]];
  render();
}

document.addEventListener('click', (event) => {
  const templateButton = event.target.closest('[data-template-id]');
  if (templateButton) {
    selectTemplate(templateButton.dataset.templateId);
    return;
  }
  const button = event.target.closest('[data-qa-action]');
  if (!button) return;
  const action = button.dataset.qaAction;
  const sectionIndex = Number(button.dataset.sectionIndex);
  const itemIndex = Number(button.dataset.itemIndex);

  if (action === 'new-template') newTemplate();
  if (action === 'save-template') saveTemplate();
  if (action === 'delete-template') deleteTemplate();
  if (action === 'duplicate-template') duplicateTemplate();

  if (action === 'add-section') {
    readDraft();
    state.draft.sections.push(blankSection('New Section'));
    render();
  }
  if (action === 'delete-section') {
    readDraft();
    if (state.draft.sections.length === 1) state.draft.sections = [blankSection()];
    else state.draft.sections.splice(sectionIndex, 1);
    render();
  }
  if (action === 'move-section-up') moveSection(sectionIndex, -1);
  if (action === 'move-section-down') moveSection(sectionIndex, 1);
  if (action === 'add-item') {
    readDraft();
    state.draft.sections[sectionIndex]?.items.push(blankItem());
    render();
  }
  if (action === 'delete-item') {
    readDraft();
    const items = state.draft.sections[sectionIndex]?.items;
    if (!items) return;
    if (items.length === 1) items[0] = blankItem();
    else items.splice(itemIndex, 1);
    render();
  }
  if (action === 'duplicate-item') {
    readDraft();
    const item = state.draft.sections[sectionIndex]?.items[itemIndex];
    if (item) state.draft.sections[sectionIndex].items.splice(itemIndex + 1, 0, { ...item, id: uid() });
    render();
  }
  if (action === 'move-item-up') moveItem(sectionIndex, itemIndex, -1);
  if (action === 'move-item-down') moveItem(sectionIndex, itemIndex, 1);
});

document.addEventListener('input', (event) => {
  if (!event.target.closest('[data-qa-checklists]')) return;
  if (event.target.matches('[data-qa-search]')) {
    state.search = event.target.value;
    const list = document.querySelector('.qa-template-list');
    if (list) {
      const templates = templatesForList();
      list.innerHTML = templates.length ? templates.map(templateCard).join('') : `<div class='qa-empty-small'>No matching templates yet.</div>`;
    }
    return;
  }
  if (event.target.matches('[data-draft-field], [data-section-field], [data-item-field]')) {
    readDraft();
    document.querySelector('.qa-preview-panel')?.replaceWith(htmlToNode(renderPreview()));
    document.querySelector('.qa-checklist-metrics')?.replaceWith(htmlToNode(renderMetrics()));
  }
});

document.addEventListener('change', (event) => {
  if (!event.target.closest('[data-qa-checklists]')) return;
  if (event.target.matches('[data-draft-field], [data-section-field], [data-item-field]')) {
    readDraft();
    document.querySelector('.qa-preview-panel')?.replaceWith(htmlToNode(renderPreview()));
    document.querySelector('.qa-checklist-metrics')?.replaceWith(htmlToNode(renderMetrics()));
  }
});

function htmlToNode(html) {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  return template.content.firstElementChild;
}

waitForShell().then(async () => {
  setHeading();
  render();
  await loadUser();
  await loadTemplates();
});
