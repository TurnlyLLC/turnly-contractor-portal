import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const supabase = createClient(
  window.__ENV.SUPABASE_URL,
  window.__ENV.SUPABASE_ANON_KEY
);

const templateForm = document.getElementById("templateForm");
const templateLibrarySelect = document.getElementById("templateLibrarySelect");
const sectionNav = document.getElementById("sectionNav");
const editorSections = document.getElementById("editorSections");
const addSectionBtn = document.getElementById("addSectionBtn");
const newSectionTitle = document.getElementById("newSectionTitle");
const newTemplateBtn = document.getElementById("newTemplateBtn");
const templateMessage = document.getElementById("templateMessage");

let templates = [];
let activeTemplate = createBlankTemplate();

function createId() {
  return crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
}

function createBlankTemplate() {
  return {
    id: "",
    name: "Turnly Standardized Full Service Turnover Checklist",
    department: "Cleaning",
    subdepartment: "Full Service Turnover",
    priority: "medium",
    description: "This standardized Turnly turnover checklist is designed to deliver consistent, guest-ready results while protecting both the cleaner and the property on every stay.",
    sections: [
      {
        id: createId(),
        title: "Before Clean Photos",
        items: [],
        rooms: [
          {
            id: createId(),
            title: "Exterior Door",
            items: [{ id: createId(), type: "photo", label: "Take a photo of the front door" }]
          },
          {
            id: createId(),
            title: "Living Room",
            items: [{ id: createId(), type: "photo", label: "Entry / living room wide shot" }]
          }
        ]
      },
      {
        id: createId(),
        title: "Kitchen Reset",
        items: [{ id: createId(), type: "checklist", label: "Unload dishwasher and reset counters" }],
        rooms: []
      }
    ]
  };
}

function showTemplateMessage(text) {
  if (templateMessage) templateMessage.textContent = text;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizeSections(sections) {
  return Array.isArray(sections) ? sections : [];
}

function normalizeItems(items) {
  return Array.isArray(items) ? items : [];
}

async function getCurrentUser() {
  const { data } = await supabase.auth.getUser();
  return data.user;
}

async function getProfile(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  if (error) return null;
  return data;
}

async function requireAdmin() {
  const user = await getCurrentUser();

  if (!user) {
    window.location.href = "login.html";
    return null;
  }

  const profile = await getProfile(user.id);

  if (!profile || profile.role !== "admin") {
    window.location.href = "contractor.html";
    return null;
  }

  return user;
}

function syncTemplateFields() {
  activeTemplate.name = document.getElementById("template_name").value.trim();
  activeTemplate.department = document.getElementById("template_department").value.trim();
  activeTemplate.subdepartment = document.getElementById("template_subdepartment").value.trim();
  activeTemplate.priority = document.getElementById("template_priority").value;
  activeTemplate.description = document.getElementById("template_description").value.trim();
}

function populateTemplateFields() {
  document.getElementById("template_id").value = activeTemplate.id || "";
  document.getElementById("template_name").value = activeTemplate.name || "";
  document.getElementById("template_department").value = activeTemplate.department || "";
  document.getElementById("template_subdepartment").value = activeTemplate.subdepartment || "";
  document.getElementById("template_priority").value = activeTemplate.priority || "medium";
  document.getElementById("template_description").value = activeTemplate.description || "";
}

function renderTemplateLibrary() {
  templateLibrarySelect.innerHTML = [
    `<option value="">New template draft</option>`,
    ...templates.map((template) => (
      `<option value="${escapeHtml(template.id)}">${escapeHtml(template.name)}</option>`
    ))
  ].join("");

  templateLibrarySelect.value = activeTemplate.id || "";
}

function renderSectionNav() {
  const sections = normalizeSections(activeTemplate.sections);

  sectionNav.innerHTML = sections.length
    ? sections.map((section) => `
      <button type="button" class="section-nav-item" data-focus-section="${escapeHtml(section.id)}">${escapeHtml(section.title)}</button>
      ${normalizeItems(section.rooms).map((room) => (
        `<button type="button" class="section-nav-item section-nav-room" data-focus-section="${escapeHtml(section.id)}">${escapeHtml(room.title)}</button>`
      )).join("")}
    `).join("")
    : "<p>No sections yet.</p>";
}

function renderEditorSections() {
  const sections = normalizeSections(activeTemplate.sections);

  editorSections.innerHTML = sections.length
    ? sections.map(renderSection).join("")
    : "<p>Add a section to start building this checklist.</p>";
}

function renderSection(section) {
  return `
    <section class="template-section" id="section-${escapeHtml(section.id)}" data-section-id="${escapeHtml(section.id)}">
      <div class="section-heading">
        <h2>${escapeHtml(section.title)}</h2>
        <button type="button" data-remove-section="${escapeHtml(section.id)}">Remove section</button>
      </div>

      <div class="quick-types">
        ${["condition", "checklist", "photo", "count", "text", "yes/no", "rating"].map((type) => (
          `<button type="button" data-quick-type="${escapeHtml(type)}" data-section-id="${escapeHtml(section.id)}">${escapeHtml(type)} +</button>`
        )).join("")}
      </div>

      <div class="section-builder">
        <select data-section-item-type="${escapeHtml(section.id)}">
          <option value="checklist">Checklist</option>
          <option value="photo">Photo</option>
          <option value="condition">Condition</option>
          <option value="count">Count</option>
          <option value="text">Text</option>
          <option value="yes/no">Yes/No</option>
          <option value="rating">Rating</option>
        </select>
        <input data-section-item-input="${escapeHtml(section.id)}" placeholder="Add item directly to ${escapeHtml(section.title)}" />
        <button type="button" class="secondary-btn small-btn" data-add-section-item="${escapeHtml(section.id)}">Add Item</button>
      </div>

      <div class="section-items">
        ${normalizeItems(section.items).map((item) => renderItem(item, section.id)).join("")}
      </div>

      <div class="section-builder">
        <input data-room-input="${escapeHtml(section.id)}" placeholder="Add room or area" />
        <span></span>
        <button type="button" class="secondary-btn small-btn" data-add-room="${escapeHtml(section.id)}">Add Room</button>
      </div>

      ${normalizeItems(section.rooms).map((room) => renderRoom(section, room)).join("")}
    </section>
  `;
}

function renderRoom(section, room) {
  return `
    <div class="room-block" data-room-id="${escapeHtml(room.id)}">
      <div class="room-heading">
        <h3>${escapeHtml(room.title)}</h3>
        <button type="button" data-remove-room="${escapeHtml(room.id)}" data-section-id="${escapeHtml(section.id)}">Remove room</button>
      </div>

      ${normalizeItems(room.items).map((item) => renderItem(item, section.id, room.id)).join("")}

      <div class="section-builder">
        <select data-room-item-type="${escapeHtml(room.id)}">
          <option value="photo">Photo</option>
          <option value="checklist">Checklist</option>
          <option value="condition">Condition</option>
          <option value="count">Count</option>
          <option value="text">Text</option>
          <option value="yes/no">Yes/No</option>
          <option value="rating">Rating</option>
        </select>
        <input data-room-item-input="${escapeHtml(room.id)}" placeholder="Add item to ${escapeHtml(room.title)}" />
        <button type="button" class="secondary-btn small-btn" data-add-room-item="${escapeHtml(room.id)}" data-section-id="${escapeHtml(section.id)}">Add Item</button>
      </div>
    </div>
  `;
}

function renderItem(item, sectionId, roomId = "") {
  return `
    <div class="item-row">
      <span class="item-type">${escapeHtml(item.type || "checklist")}</span>
      <span class="item-label"><span class="item-dot"></span>${escapeHtml(item.label)}</span>
      <button type="button" data-remove-item="${escapeHtml(item.id)}" data-section-id="${escapeHtml(sectionId)}" data-room-id="${escapeHtml(roomId)}">Remove</button>
    </div>
  `;
}

function renderAll() {
  populateTemplateFields();
  renderTemplateLibrary();
  renderSectionNav();
  renderEditorSections();
}

function findSection(sectionId) {
  return normalizeSections(activeTemplate.sections).find((section) => section.id === sectionId);
}

function findRoom(section, roomId) {
  return normalizeItems(section.rooms).find((room) => room.id === roomId);
}

function addSection() {
  const title = newSectionTitle.value.trim();
  if (!title) return;

  activeTemplate.sections.push({ id: createId(), title, items: [], rooms: [] });
  newSectionTitle.value = "";
  renderAll();
}

function addSectionItem(sectionId, type, label) {
  const section = findSection(sectionId);
  if (!section || !label) return;

  section.items = normalizeItems(section.items);
  section.items.push({ id: createId(), type, label });
  renderAll();
}

function addRoom(sectionId, title) {
  const section = findSection(sectionId);
  if (!section || !title) return;

  section.rooms = normalizeItems(section.rooms);
  section.rooms.push({ id: createId(), title, items: [] });
  renderAll();
}

function addRoomItem(sectionId, roomId, type, label) {
  const section = findSection(sectionId);
  const room = section ? findRoom(section, roomId) : null;
  if (!room || !label) return;

  room.items = normalizeItems(room.items);
  room.items.push({ id: createId(), type, label });
  renderAll();
}

function removeItem(sectionId, roomId, itemId) {
  const section = findSection(sectionId);
  if (!section) return;

  if (roomId) {
    const room = findRoom(section, roomId);
    if (room) room.items = normalizeItems(room.items).filter((item) => item.id !== itemId);
  } else {
    section.items = normalizeItems(section.items).filter((item) => item.id !== itemId);
  }

  renderAll();
}

async function loadTemplates() {
  const { data, error } = await supabase
    .from("checklist_templates")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) {
    showTemplateMessage("Run the checklist template Supabase migration first: " + error.message);
    renderAll();
    return;
  }

  templates = data || [];
  activeTemplate = templates.length ? { ...templates[0], sections: normalizeSections(templates[0].sections) } : createBlankTemplate();
  renderAll();
}

async function saveTemplate(event) {
  event.preventDefault();
  syncTemplateFields();

  if (!activeTemplate.name) {
    showTemplateMessage("Template name is required.");
    return;
  }

  const user = await getCurrentUser();
  const payload = {
    name: activeTemplate.name,
    department: activeTemplate.department,
    subdepartment: activeTemplate.subdepartment,
    priority: activeTemplate.priority,
    description: activeTemplate.description,
    sections: normalizeSections(activeTemplate.sections)
  };

  const query = activeTemplate.id
    ? supabase.from("checklist_templates").update(payload).eq("id", activeTemplate.id).select("*").single()
    : supabase.from("checklist_templates").insert([{ ...payload, created_by: user.id }]).select("*").single();

  const { data, error } = await query;

  if (error) {
    showTemplateMessage("Error: " + error.message);
    return;
  }

  activeTemplate = { ...data, sections: normalizeSections(data.sections) };
  await loadTemplates();
  showTemplateMessage("Checklist template saved.");
}

function useTemplate(templateId) {
  const template = templates.find((item) => item.id === templateId);
  activeTemplate = template
    ? { ...template, sections: normalizeSections(template.sections) }
    : createBlankTemplate();
  renderAll();
}

function handleEditorClick(event) {
  const quickButton = event.target.closest("[data-quick-type]");
  if (quickButton) {
    addSectionItem(
      quickButton.dataset.sectionId,
      quickButton.dataset.quickType,
      `New ${quickButton.dataset.quickType} item`
    );
    return;
  }

  const addSectionItemButton = event.target.closest("[data-add-section-item]");
  if (addSectionItemButton) {
    const sectionId = addSectionItemButton.dataset.addSectionItem;
    const input = editorSections.querySelector(`[data-section-item-input="${sectionId}"]`);
    const typeInput = editorSections.querySelector(`[data-section-item-type="${sectionId}"]`);
    addSectionItem(sectionId, typeInput.value, input.value.trim());
    return;
  }

  const addRoomButton = event.target.closest("[data-add-room]");
  if (addRoomButton) {
    const sectionId = addRoomButton.dataset.addRoom;
    const input = editorSections.querySelector(`[data-room-input="${sectionId}"]`);
    addRoom(sectionId, input.value.trim());
    return;
  }

  const addRoomItemButton = event.target.closest("[data-add-room-item]");
  if (addRoomItemButton) {
    const roomId = addRoomItemButton.dataset.addRoomItem;
    const sectionId = addRoomItemButton.dataset.sectionId;
    const input = editorSections.querySelector(`[data-room-item-input="${roomId}"]`);
    const typeInput = editorSections.querySelector(`[data-room-item-type="${roomId}"]`);
    addRoomItem(sectionId, roomId, typeInput.value, input.value.trim());
    return;
  }

  const removeSectionButton = event.target.closest("[data-remove-section]");
  if (removeSectionButton) {
    activeTemplate.sections = normalizeSections(activeTemplate.sections).filter((section) => section.id !== removeSectionButton.dataset.removeSection);
    renderAll();
    return;
  }

  const removeRoomButton = event.target.closest("[data-remove-room]");
  if (removeRoomButton) {
    const section = findSection(removeRoomButton.dataset.sectionId);
    if (section) {
      section.rooms = normalizeItems(section.rooms).filter((room) => room.id !== removeRoomButton.dataset.removeRoom);
      renderAll();
    }
    return;
  }

  const removeItemButton = event.target.closest("[data-remove-item]");
  if (removeItemButton) {
    removeItem(
      removeItemButton.dataset.sectionId,
      removeItemButton.dataset.roomId,
      removeItemButton.dataset.removeItem
    );
  }
}

function handleSectionNavClick(event) {
  const button = event.target.closest("[data-focus-section]");
  if (!button) return;

  document.getElementById(`section-${button.dataset.focusSection}`)?.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

async function init() {
  const user = await requireAdmin();
  if (!user) return;

  templateForm.addEventListener("input", syncTemplateFields);
  templateForm.addEventListener("submit", saveTemplate);
  addSectionBtn.addEventListener("click", addSection);
  newTemplateBtn.addEventListener("click", () => {
    activeTemplate = createBlankTemplate();
    renderAll();
    showTemplateMessage("New checklist draft started.");
  });
  templateLibrarySelect.addEventListener("change", () => useTemplate(templateLibrarySelect.value));
  editorSections.addEventListener("click", handleEditorClick);
  sectionNav.addEventListener("click", handleSectionNavClick);

  await loadTemplates();
}

init();
