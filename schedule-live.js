import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const env = window.__ENV || {};
const supabase = env.SUPABASE_URL && env.SUPABASE_ANON_KEY
  ? createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
  : null;

const state = {
  view: "week",
  dateCursor: new Date(),
  rows: [],
  filters: {
    property: "all",
    contractor: "all",
    service: "all",
    status: "all"
  }
};

function initScheduleLive() {
  if (document.body?.dataset.adminPage !== "schedule") return;
  injectScheduleStyles();
  mountScheduleShell();
  bindScheduleEvents();
  renderSchedule();
  void loadScheduleRows();
}

function mountScheduleShell() {
  const content = document.querySelector(".suite-content");
  if (!content || document.querySelector("[data-schedule-live]")) return;
  content.innerHTML = `
    <section class="schedule-live-page" data-schedule-live>
      <div class="suite-toolbar">
        <div class="toolbar-left">
          ${viewButton("today", "Today")}
          ${viewButton("week", "Week")}
          ${viewButton("month", "Month")}
        </div>
        <div class="toolbar-right">
          <button class="secondary-action" type="button" data-schedule-refresh><span>Refresh</span></button>
        </div>
      </div>
      <section class="schedule-layout" data-schedule-layout>
        <div class="schedule-main-views">
          <section class="suite-panel no-head schedule-mode-panel schedule-live-panel">
            <div class="calendar-controls schedule-live-controls">
              <button type="button" data-schedule-nav="prev" aria-label="Previous period">&lsaquo;</button>
              <button type="button" data-schedule-nav="next" aria-label="Next period">&rsaquo;</button>
              <button type="button" data-schedule-nav="today">Today</button>
              <strong id="scheduleLiveRange"></strong>
              <button class="secondary-action schedule-clear-calendar" type="button" data-schedule-clear><span>Clear Filters</span></button>
            </div>
            <p id="scheduleLiveMessage" class="status-message table-status-message" aria-live="polite">Loading all assignment jobs...</p>
            <div id="scheduleLiveBody" class="schedule-dynamic-calendar"></div>
          </section>
        </div>
        <aside class="suite-stack">
          <section class="suite-panel schedule-live-summary-panel">
            <div class="panel-head"><div><h2>Period Summary</h2></div></div>
            <div id="scheduleLiveSummary" class="schedule-summary-list"></div>
          </section>
          <aside class="filter-card schedule-filter-card">
            <div class="filter-head"><h2>Filter Schedule</h2><button type="button" data-schedule-clear>Clear All</button></div>
            <div class="filter-grid">
              ${filterSelect("property", "Property / Location")}
              ${filterSelect("contractor", "Contractor")}
              ${filterSelect("service", "Service Type")}
              ${filterSelect("status", "Status")}
            </div>
            <div class="filter-actions">
              <button class="secondary-action" type="button" data-schedule-clear><span>Clear Filters</span></button>
              <button class="primary-action" type="button" data-schedule-refresh><span>Refresh Schedule</span></button>
            </div>
          </aside>
        </aside>
      </section>
    </section>
  `;
}

function viewButton(view, label) {
  return `<button class="view-chip schedule-view-toggle ${state.view === view ? "active" : ""}" type="button" data-schedule-view="${escapeHtml(view)}"><span>${escapeHtml(label)}</span></button>`;
}

function filterSelect(id, label) {
  return `
    <label class="suite-field">
      <span>${escapeHtml(label)}</span>
      <select id="scheduleFilter-${escapeHtml(id)}" data-schedule-filter="${escapeHtml(id)}">
        <option value="all">All ${escapeHtml(label)}</option>
      </select>
    </label>
  `;
}

function bindScheduleEvents() {
  const root = document.querySelector("[data-schedule-live]");
  if (!root || root.dataset.bound) return;
  root.dataset.bound = "true";

  root.addEventListener("click", (event) => {
    const viewButtonEl = event.target.closest("[data-schedule-view]");
    if (viewButtonEl) {
      state.view = viewButtonEl.dataset.scheduleView || "week";
      if (state.view === "today") state.dateCursor = new Date();
      renderSchedule();
      return;
    }

    const navButton = event.target.closest("[data-schedule-nav]");
    if (navButton) {
      const action = navButton.dataset.scheduleNav;
      if (action === "today") {
        state.dateCursor = new Date();
      } else {
        movePeriod(action === "prev" ? -1 : 1);
      }
      renderSchedule();
      return;
    }

    if (event.target.closest("[data-schedule-refresh]")) {
      void loadScheduleRows();
      return;
    }

    if (event.target.closest("[data-schedule-clear]")) {
      state.filters = { property: "all", contractor: "all", service: "all", status: "all" };
      renderSchedule();
    }
  });

  root.addEventListener("change", (event) => {
    const select = event.target.closest("[data-schedule-filter]");
    if (!select) return;
    state.filters[select.dataset.scheduleFilter] = select.value || "all";
    renderSchedule();
  });
}

async function loadScheduleRows() {
  if (!supabase) {
    state.rows = [];
    showMessage("Supabase config is missing. Add env.js values before using the schedule.", true);
    renderSchedule();
    return;
  }

  showMessage("Loading all assignment jobs...");
  const body = document.getElementById("scheduleLiveBody");
  if (body) body.innerHTML = `<div class="schedule-loading">Loading assignments...</div>`;

  const { data, error } = await supabase
    .from("assignment_blocks")
    .select("*")
    .order("start_window", { ascending: true })
    .limit(2000);

  if (error) {
    state.rows = [];
    showMessage("Unable to load scheduled assignments from Supabase: " + error.message, true);
    renderSchedule();
    return;
  }

  state.rows = (data || [])
    .filter((row) => parseDate(row.start_window))
    .sort((a, b) => dateValue(a.start_window) - dateValue(b.start_window));
  showMessage(state.rows.length
    ? `${state.rows.length.toLocaleString()} assignment job${state.rows.length === 1 ? "" : "s"} synced from Supabase.`
    : "Synced with Supabase. No assignment jobs are scheduled yet.");
  renderSchedule();
}

function renderSchedule() {
  updateControls();
  populateFilters();
  renderSummary();
  renderCalendar();
}

function updateControls() {
  document.querySelectorAll("[data-schedule-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.scheduleView === state.view);
  });
  const layout = document.querySelector("[data-schedule-layout]");
  if (layout) layout.classList.toggle("is-month", state.view === "month");
  const label = document.getElementById("scheduleLiveRange");
  if (label) label.textContent = rangeLabel();
}

function populateFilters() {
  setSelect("property", "All Properties", uniqueOptions((row) => row.property_name || row.address || ""));
  setSelect("contractor", "All Contractors", uniqueOptions(contractorText));
  setSelect("service", "All Services", uniqueOptions((row) => row.service_type || ""));
  setSelect("status", "All Statuses", uniqueOptions((row) => statusKey(row.status || "scheduled"), titleCase));
}

function setSelect(id, allLabel, options) {
  const select = document.getElementById(`scheduleFilter-${id}`);
  if (!select) return;
  const valid = new Set(["all", ...options.map(([value]) => value)]);
  if (!valid.has(state.filters[id])) state.filters[id] = "all";
  select.innerHTML = `<option value="all">${escapeHtml(allLabel)}</option>${options.map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`).join("")}`;
  select.value = state.filters[id] || "all";
}

function uniqueOptions(getValue, getLabel = (value) => value) {
  const options = new Map();
  state.rows.forEach((row) => {
    const raw = String(getValue(row) || "").trim();
    if (!raw || raw === "Unassigned") return;
    const value = token(raw) || raw.toLowerCase();
    if (!options.has(value)) options.set(value, getLabel(raw));
  });
  return Array.from(options.entries()).sort((a, b) => a[1].localeCompare(b[1]));
}

function renderSummary() {
  const summary = document.getElementById("scheduleLiveSummary");
  if (!summary) return;
  const rows = periodRows();
  const accepted = rows.filter((row) => acceptanceStatus(row).tone === "accepted");
  const notAccepted = rows.filter((row) => acceptanceStatus(row).tone === "not-accepted");
  const inProgress = rows.filter((row) => statusKey(row.status) === "in-progress");
  summary.innerHTML = `
    <div><span>Visible Assignments</span><strong>${rows.length.toLocaleString()}</strong></div>
    <div><span>Accepted</span><strong>${accepted.length.toLocaleString()}</strong></div>
    <div><span>Not Accepted</span><strong>${notAccepted.length.toLocaleString()}</strong></div>
    <div><span>In Progress</span><strong>${inProgress.length.toLocaleString()}</strong></div>
  `;
}

function renderCalendar() {
  const body = document.getElementById("scheduleLiveBody");
  if (!body) return;
  const rows = periodRows();
  const range = periodRange();
  if (state.view === "month") {
    body.innerHTML = renderMonth(rows, range);
  } else if (state.view === "week") {
    body.innerHTML = renderWeek(rows, range);
  } else {
    body.innerHTML = renderDay(rows, range);
  }
}

function periodRows() {
  const range = periodRange();
  return state.rows
    .filter(matchesFilters)
    .filter((row) => {
      const start = parseDate(row.start_window);
      return start && start >= range.start && start < range.end;
    })
    .sort((a, b) => dateValue(a.start_window) - dateValue(b.start_window));
}

function matchesFilters(row) {
  return (state.filters.property === "all" || token(row.property_name || row.address || "") === state.filters.property)
    && (state.filters.contractor === "all" || token(contractorText(row)) === state.filters.contractor)
    && (state.filters.service === "all" || token(row.service_type || "") === state.filters.service)
    && (state.filters.status === "all" || statusKey(row.status || "scheduled") === state.filters.status);
}

function renderDay(rows, range) {
  const byHour = new Map();
  rows.forEach((row) => {
    const start = parseDate(row.start_window);
    const hour = start ? start.getHours() : 0;
    byHour.set(hour, [...(byHour.get(hour) || []), row]);
  });

  return `
    <div class="day-calendar schedule-day-calendar">
      ${Array.from({ length: 24 }, (_, hour) => `
        <div class="schedule-hour-row">
          <time>${escapeHtml(hourLabel(hour))}</time>
          <div class="schedule-hour-events">
            ${(byHour.get(hour) || []).map((row) => eventCard(row)).join("")}
          </div>
        </div>
      `).join("")}
      ${rows.length ? "" : `<div class="calendar-empty">${emptyState("No schedule items", `There are no scheduled cleanings for ${range.start.toLocaleDateString()}.`)}</div>`}
    </div>
  `;
}

function renderWeek(rows, range) {
  const days = Array.from({ length: 7 }, (_, index) => addDays(range.start, index));
  return `
    <div class="week-calendar schedule-week-columns">
      ${days.map((day) => {
        const dayRows = rows.filter((row) => {
          const start = parseDate(row.start_window);
          return start && sameDay(start, day);
        });
        return `
          <div class="schedule-week-day ${sameDay(day, new Date()) ? "today" : ""}">
            <header><strong>${escapeHtml(day.toLocaleDateString([], { weekday: "short" }))}</strong><span>${escapeHtml(day.toLocaleDateString([], { month: "short", day: "numeric" }))}</span></header>
            <div class="schedule-day-events">
              ${dayRows.length ? dayRows.map((row) => eventCard(row)).join("") : `<p>No assignments</p>`}
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderMonth(rows, range) {
  const gridStart = startOfWeek(range.start);
  const rowsByDay = new Map();
  rows.forEach((row) => {
    const start = parseDate(row.start_window);
    if (!start) return;
    const key = dateKey(start);
    rowsByDay.set(key, [...(rowsByDay.get(key) || []), row]);
  });

  return `
    <div class="schedule-month-calendar schedule-live-month">
      <div class="schedule-month-grid">
        ${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => `<b>${escapeHtml(day)}</b>`).join("")}
        ${Array.from({ length: 42 }, (_, index) => addDays(gridStart, index)).map((day) => {
          const dayRows = rowsByDay.get(dateKey(day)) || [];
          const visibleRows = dayRows.slice(0, 4);
          return `
            <div class="schedule-month-cell ${day.getMonth() === range.start.getMonth() ? "" : "muted"} ${sameDay(day, new Date()) ? "today" : ""}">
              <span>${escapeHtml(String(day.getDate()))}</span>
              <div class="schedule-month-events">
                ${visibleRows.map((row) => eventCard(row, { compact: true })).join("")}
                ${dayRows.length > visibleRows.length ? `<small>+${dayRows.length - visibleRows.length} more</small>` : ""}
              </div>
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

function eventCard(row, options = {}) {
  const accepted = acceptanceStatus(row);
  const title = row.property_name || row.title || "Scheduled assignment";
  const unit = unitLabel(row);
  const subtitle = [unit !== "No unit" ? `Unit ${unit}` : "", row.service_type].filter(Boolean).join(" - ");
  return `
    <article class="schedule-event-card ${options.compact ? "compact" : ""}">
      <div class="schedule-event-time">${escapeHtml(eventTime(row))}</div>
      <strong>${escapeHtml(title)}</strong>
      ${options.compact ? "" : `<p>${escapeHtml(subtitle || row.title || "Assignment")}</p>`}
      ${options.compact ? "" : `<small>${escapeHtml(contractorText(row))}</small>`}
      <div class="schedule-event-badges">
        <span class="status-badge status-${escapeHtml(statusKey(row.status || "scheduled"))}">${escapeHtml(titleCase(row.status || "scheduled"))}</span>
        <span class="status-badge schedule-acceptance-badge is-${escapeHtml(accepted.tone)}">${escapeHtml(accepted.label)}</span>
      </div>
    </article>
  `;
}

function acceptanceStatus(row) {
  const status = statusKey(row.status);
  if (["cancelled", "canceled", "declined"].includes(status)) return { label: titleCase(status), tone: status };
  if (row.accepted_at || row.claimed_at || row.claimed_by || ["claimed", "in-progress", "completed", "qa-pending"].includes(status)) {
    return { label: "Accepted", tone: "accepted" };
  }
  if (row.assigned_to || row.assigned_to_name || row.assigned_to_email) return { label: "Assigned", tone: "assigned" };
  if (status === "preferred-pending") return { label: "Awaiting Accept", tone: "pending" };
  return { label: "Not Accepted", tone: "not-accepted" };
}

function eventTime(row) {
  const start = parseDate(row.start_window);
  const end = parseDate(row.end_window);
  if (!start) return "Time not set";
  const startText = start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (!end) return startText;
  return `${startText} - ${end.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

function periodRange() {
  const cursor = startOfDay(state.dateCursor);
  if (state.view === "month") {
    const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    return { start, end: new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1) };
  }
  if (state.view === "week") {
    const start = startOfWeek(cursor);
    return { start, end: addDays(start, 7) };
  }
  return { start: cursor, end: addDays(cursor, 1) };
}

function rangeLabel() {
  const range = periodRange();
  if (state.view === "month") return range.start.toLocaleDateString([], { month: "long", year: "numeric" });
  if (state.view === "week") {
    const end = addDays(range.end, -1);
    return `${range.start.toLocaleDateString([], { month: "short", day: "numeric" })} - ${end.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}`;
  }
  return range.start.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function movePeriod(direction) {
  const next = new Date(state.dateCursor);
  if (state.view === "month") next.setMonth(next.getMonth() + direction);
  else if (state.view === "week") next.setDate(next.getDate() + (direction * 7));
  else next.setDate(next.getDate() + direction);
  state.dateCursor = next;
}

function showMessage(text, isError = false) {
  const message = document.getElementById("scheduleLiveMessage");
  if (!message) return;
  message.textContent = text || "";
  message.classList.toggle("error", Boolean(isError));
}

function emptyState(title, text = "") {
  return `
    <div class="empty-state">
      <div class="empty-icon">[]</div>
      <strong>${escapeHtml(title)}</strong>
      ${text ? `<p>${escapeHtml(text)}</p>` : ""}
      <div class="empty-lines"><span></span><span></span></div>
    </div>
  `;
}

function contractorText(row) {
  return row?.assigned_to_name
    || row?.assigned_to_email
    || row?.claimed_by_name
    || row?.claimed_by_email
    || (Array.isArray(row?.preferred_contractor_names) ? row.preferred_contractor_names.filter(Boolean).join(", ") : "")
    || "Unassigned";
}

function unitLabel(row) {
  const direct = row?.unit_name || row?.unit_number || row?.unit || row?.unit_id;
  if (direct) return String(direct);
  const title = String(row?.title || "").replace(/\s+/g, " ").trim();
  const unitMatch = title.match(/\bunit\s+(.+?)(?:,\s*[\d,.]+\s*sq\b|,\s*\d|\s+-\s+|\s+[-]\s+)/i)
    || title.match(/\bunit\s+([^,]+)/i);
  if (unitMatch?.[1]) return unitMatch[1].trim();
  const hashMatch = title.match(/#\s*([A-Za-z0-9-]+)/);
  return hashMatch?.[1]?.trim() || "No unit";
}

function statusKey(value) {
  return token(value || "scheduled");
}

function token(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function titleCase(value) {
  return String(value || "").replace(/[-_]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateValue(value, fallback = Number.MAX_SAFE_INTEGER) {
  return parseDate(value)?.getTime() || fallback;
}

function addDays(value, days) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function startOfDay(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function startOfWeek(value) {
  const date = startOfDay(value);
  date.setDate(date.getDate() - date.getDay());
  return date;
}

function dateKey(value) {
  const date = startOfDay(value);
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function hourLabel(hour) {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  return date.toLocaleTimeString([], { hour: "numeric" });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

function injectScheduleStyles() {
  if (document.getElementById("scheduleLiveStyles")) return;
  document.head.insertAdjacentHTML("beforeend", `
    <style id="scheduleLiveStyles">
      .schedule-live-panel{min-width:0}.schedule-live-controls{grid-template-columns:auto auto auto minmax(220px,1fr) auto}.schedule-live-controls .secondary-action{min-height:32px}.schedule-dynamic-calendar{min-width:0}.schedule-summary-list{display:grid;gap:8px}.schedule-summary-list>div{align-items:center;background:rgba(255,255,255,.035);border:1px solid var(--suite-border-soft);border-radius:8px;display:flex;justify-content:space-between;min-height:42px;padding:10px 12px}.schedule-summary-list span{color:var(--suite-soft);font-size:11px;font-weight:900;text-transform:uppercase}.schedule-summary-list strong{color:var(--suite-text);font-size:18px}.schedule-loading{border:1px solid var(--suite-border-soft);border-radius:8px;color:var(--suite-soft);padding:24px}.schedule-day-calendar{overflow:auto}.day-calendar .schedule-hour-row{display:grid;grid-template-columns:74px minmax(0,1fr);min-height:48px;padding:0}.schedule-hour-row time{align-items:start;border-right:1px solid var(--suite-border-soft);display:flex;justify-content:center;padding-top:10px}.schedule-hour-events,.schedule-day-events,.schedule-month-events{display:grid;gap:6px;min-width:0}.schedule-hour-events{align-content:start;padding:6px}.schedule-week-columns{grid-template-columns:repeat(7,minmax(172px,1fr));overflow-x:auto}.week-calendar.schedule-week-columns>div{display:flex;flex-direction:column;min-height:560px;padding:0}.schedule-week-day header{align-items:center;background:rgba(7,18,32,.68);border-bottom:1px solid var(--suite-border-soft);display:flex;justify-content:space-between;min-height:42px;padding:10px}.schedule-week-day.today header{color:var(--suite-green)}.schedule-week-day header span{color:var(--suite-soft);font-size:11px;font-weight:900}.schedule-day-events{align-content:start;flex:1;padding:8px}.schedule-day-events>p{color:var(--suite-soft);font-size:12px;margin:0}.schedule-event-card{background:rgba(4,14,25,.78);border:1px solid rgba(124,151,176,.16);border-left:3px solid rgba(57,169,255,.82);border-radius:7px;display:grid;gap:4px;padding:8px}.schedule-event-card strong,.schedule-event-card p,.schedule-event-card small{margin:0;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.schedule-event-card strong{color:var(--suite-text);font-size:12px}.schedule-event-card p,.schedule-event-card small{color:var(--suite-soft);font-size:11px}.schedule-event-time{color:var(--suite-green);font-size:10px;font-weight:900;text-transform:uppercase}.schedule-event-badges{display:flex;flex-wrap:wrap;gap:4px}.schedule-event-badges .status-badge{font-size:9px;min-height:18px;padding:2px 6px}.schedule-acceptance-badge.is-accepted{background:rgba(0,214,163,.16);color:var(--suite-green)}.schedule-acceptance-badge.is-assigned,.schedule-acceptance-badge.is-pending{background:rgba(255,212,61,.14);color:var(--suite-yellow)}.schedule-acceptance-badge.is-not-accepted{background:rgba(255,91,104,.12);color:var(--suite-red)}.schedule-live-month .schedule-month-grid{min-width:980px;overflow-x:auto}.schedule-month-grid>.schedule-month-cell{border-bottom:1px solid var(--suite-border-soft);border-right:1px solid var(--suite-border-soft);padding:14px}.schedule-month-cell{align-content:start;color:#e3eef9;display:grid;gap:8px;min-height:132px}.schedule-month-cell>span{font-size:12px;font-weight:900}.schedule-month-cell.muted{color:rgba(227,238,249,.36)}.schedule-month-cell.today{background:rgba(0,214,163,.06);color:var(--suite-green)}.schedule-event-card.compact{border-left-width:2px;gap:2px;padding:5px 6px}.schedule-event-card.compact strong{font-size:10px}.schedule-event-card.compact .schedule-event-time{font-size:9px}.schedule-event-card.compact .schedule-event-badges .status-badge:not(.schedule-acceptance-badge){display:none}.schedule-month-events>small{color:var(--suite-soft);font-size:10px;font-weight:900}@media(max-width:620px){.schedule-live-controls{grid-template-columns:1fr}.schedule-week-columns{grid-template-columns:repeat(7,minmax(180px,1fr))}}
    </style>
  `);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initScheduleLive);
} else {
  initScheduleLive();
}
