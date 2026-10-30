import { materialsHtml } from "./checklist-materials.mjs?v=20261030-materials";
import { isResidentialAssignment, residentialCounts, matchingResidentialChecklist } from "./residential-assignment.mjs?v=20261026-sync";
import {consentRecordHtml} from './video-consent.mjs?v=20261026-video';
const itemsOf = (row) => Array.isArray(row?.checklist_items) ? row.checklist_items : [];
const metaOf = (row) => row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function checklistLocked(row) {
  return Boolean(row?.completed_at || row?.checklist_completed_at || metaOf(row).qa_submitted_at)
    || ['completed', 'complete', 'qa_pending', 'pending_qa', 'approved', 'paid', 'cancelled', 'canceled'].includes(row?.status);
}

export function createAssignmentChecklistEditor(client, flatten) {
  let state = null;
  let generation = 0;
  function reset() { generation++; state = null; }

  async function open(row) {
    reset();
    const target = document.getElementById('assignmentChecklistEditor');
    if (!target) return;
    target.hidden = !row;
    target.innerHTML = row ? '<h3>Contractor Checklist</h3><p role="status">Loading attached checklist…</p>' : '';
    if (!row || !client) return;
    const ticket = generation;
    try {
      // Read the current assignment so the save can detect concurrent contractor activity.
      const [current, library] = await Promise.all([
        client.from('assignment_blocks').select('*').eq('id', row.id).single(),
        client.from('checklist_templates').select('*').order('name')
      ]);
      if (current.error) throw current.error;
      if (library.error) throw library.error;
      const fresh = current.data;
      const meta = metaOf(fresh);
      let items = Array.isArray(fresh.property_checklist_items) ? fresh.property_checklist_items : [];
      let templateId = meta.checklist_template_id || '';
      let source = 'Attached to this request';
      if (!items.length) {
        const unitId = fresh.unit_id || meta.unit_id;
        let unit = null;
        if (unitId) {
          const result = await client.from('property_units').select('*').eq('id', unitId).maybeSingle();
          if (result.error) throw result.error;
          unit = result.data;
        } else {
          const propertyId = fresh.portal_property_id || meta.portal_property_id || fresh.property_id || meta.property_id;
          const unitName = fresh.unit_number || fresh.unit_name || meta.unit_number || meta.unit_name;
          if (propertyId && unitName) {
            const result = await client.from('property_units').select('*').eq('property_id', propertyId).eq('unit_name', unitName).limit(1);
            if (result.error) throw result.error;
            unit = result.data?.[0];
          }
        }
        if (itemsOf(unit).length) {
          items = itemsOf(unit); templateId = unit.checklist_template_id || ''; source = 'Inherited from this unit';
        } else {
          const propertyId = fresh.portal_property_id || meta.portal_property_id || fresh.property_id || meta.property_id;
          if (propertyId) {
            for (const table of ['portal_properties', 'properties']) {
              const result = await client.from(table).select('*').eq('id', propertyId).maybeSingle();
              if (!result.error && result.data) {
                items = itemsOf(result.data); templateId = result.data.checklist_template_id || ''; source = 'Inherited from this property';
                break;
              }
            }
          }
        }
      }
      if (ticket !== generation) return;
      const templates = (library.data || []).filter(t=>isResidentialAssignment(fresh)?t.scope_type==='residential':t.scope_type!=='residential');
      const name = (source === 'Attached to this request' ? meta.checklist_template_name : '') || templates.find(t => t.id === templateId)?.name
        || (items.length ? 'Saved assignment checklist' : 'No checklist attached');
      const counts=residentialCounts(fresh);
      const autoTemplate=isResidentialAssignment(fresh)&&!items.length&&!hasProgress(fresh)&&!checklistLocked(fresh)?matchingResidentialChecklist(templates,counts.beds,counts.baths,fresh.metadata?.residential_service||fresh.service_type):null;
      const automatic=autoTemplate&&flatten(autoTemplate).length?autoTemplate:null;
      state = { row: fresh, templates, items, name, templateId, selected: automatic?.id || '' };
      target.innerHTML = `<h3>Contractor Checklist</h3>
        ${meta.checklist_review_required?`<p role="alert"><strong>Scope review required:</strong> ${esc(meta.checklist_review_reason)} No checklist is attached automatically.</p>`:''}
        <p><strong>${esc(name)}</strong> · ${items.length} item${items.length === 1 ? '' : 's'}</p>
        <p>${esc(items.length ? source : 'Choose a saved checklist for this request.')}</p><p>Template edits sync to active requests. Unchanged task progress is retained; completed records remain unchanged.</p>
        ${preview(items, 'View attached checklist')}
        <details><summary>Materials &amp; chemicals</summary>${materialsHtml(fresh.materials_list, fresh.supplies_notes)}</details>
        ${checklistLocked(fresh) ? '<p>This checklist is read-only because the assignment is completed, submitted for review, or cancelled.</p>' : `
        <label class="suite-field"><span>Change checklist</span><select id="assignmentChecklistSelect">
          <option value="">Keep current checklist</option>
          ${templates.map(t => `<option value="${esc(t.id)}" ${automatic?.id===t.id?'selected':''}>${esc(t.name)}</option>`).join('')}
        </select></label>
        <p>${templates.length ? 'Applies only to this request. Save Changes to update the contractor’s requirements.' : 'Create and save a checklist on the Checklists page first.'}</p>
        <div id="assignmentChecklistReplacement">${automatic ? `<p>Matched to ${esc(counts.beds)} beds / ${esc(counts.baths)} baths. Save Changes to attach this checklist.</p>${preview(flatten(automatic), "Matched checklist", true)}` : isResidentialAssignment(fresh)&&!items.length ? "<p>No matching checklist. This assignment currently has no checklist attached.</p>" : ""}</div>`}`;
      document.getElementById('assignmentChecklistSelect')?.addEventListener('change', (event) => {
        state.selected = event.target.value;
        const selected = templates.find(t => t.id === state.selected);
        const next = selected ? flatten(selected) : [];
        document.getElementById('assignmentChecklistReplacement').innerHTML = selected
          ? `${preview(next, 'Preview replacement checklist', true)}
             <details><summary>Materials included with this checklist</summary>${materialsHtml(selected.materials_list)}</details>
             ${!next.length ? '<p role="alert">This checklist has no tasks. Add tasks before assigning it.</p>' : ''}
             ${hasProgress(fresh) ? '<label class="checkbox-field"><input id="assignmentChecklistReset" type="checkbox" /> <span>Replace this checklist and reset its progress. Previous responses will be kept in assignment history. The contractor must reopen the job.</span></label>' : ''}`
          : '';
      });
      if(isResidentialAssignment(fresh)){
        const consent=await client.from('assignment_video_consents').select('*').eq('assignment_id',fresh.id).maybeSingle();
        if(ticket===generation){
          if(consent.error)target.insertAdjacentHTML('beforeend','<p role="alert">Video consent could not be loaded. Reopen the assignment to retry.</p>');
          else if(consent.data)target.insertAdjacentHTML('beforeend',consentRecordHtml(consent.data));
        }
      }
    } catch (error) {
      if (ticket !== generation) return;
      target.innerHTML = `<h3>Contractor Checklist</h3><p role="alert">Unable to load the checklist: ${esc(error.message)}. Close and reopen this assignment to retry.</p>`;
    }
  }

  function patch(row, payload, userId) {
    if (!state || state.row.id !== row.id || !state.selected) return null;
    if (checklistLocked(state.row) || checklistLocked(payload)) throw new Error('Change the checklist before completing or submitting the assignment.');
    if (hasProgress(state.row) && !document.getElementById('assignmentChecklistReset')?.checked) throw new Error('Confirm the checklist progress reset before saving.');
    const template = state.templates.find(t => t.id === state.selected);
    const items = flatten(template);
    if (!items.length) throw new Error('Choose a checklist with at least one task.');
    const changedAt = new Date().toISOString();
    const previousMeta = metaOf(state.row);
    const metadata = { ...previousMeta, ...payload.metadata };
    const history = Array.isArray(previousMeta.checklist_history) ? [...previousMeta.checklist_history] : [];
    history.push({ name: state.name, template_id: state.templateId, items: state.items,
      responses: state.row.checklist_responses || [], replaced_at: changedAt, replaced_by: userId });
    Object.assign(metadata, { checklist_template_id: template.id, checklist_template_name: template.name,
      checklist_item_count: items.length, checklist_revision: crypto.randomUUID(), checklist_changed_at: changedAt,
      checklist_changed_by: userId, checklist_history: history });
    delete metadata.checklist_autosaved_at;
    delete metadata.checklist_autosaved_by;
    delete metadata.checklist_autosave_source;
    return { expectedUpdatedAt: row.updated_at,
      payload: { ...payload, metadata, property_checklist_items: items, checklist_responses: [], checklist_completed_at: null } };
  }
  return { open, reset, patch };
}

function hasProgress(row) {
  return row.status === 'in_progress' || Boolean(row.started_at) || Boolean(row.checklist_responses?.length);
}

function preview(items, title, open = false) {
  if (!items.length) return '';
  return `<details ${open ? 'open' : ''}><summary>${esc(title)} (${items.length} items)</summary><ol>
    ${items.map(item => `<li><strong>${esc(item.category || 'General')}</strong>: ${esc(item.task || item.label || item)}
      <small> (${item.required === false ? 'optional' : 'required'}${['photo', 'video'].includes(item.media_required || item.type) ? ` · ${esc(item.media_required || item.type)}` : ''})</small></li>`).join('')}
    </ol></details>`;
}
