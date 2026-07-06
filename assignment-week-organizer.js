(() => {
  const state = {
    weekStart: startOfWeek(new Date()),
    observer: null,
    isRendering: false,
    list: null
  };

  function parseDate(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function startOfWeek(value) {
    const date = new Date(value);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - date.getDay());
    return date;
  }

  function addDays(value, days) {
    const date = new Date(value);
    date.setDate(date.getDate() + days);
    return date;
  }

  function formatWeek(start) {
    const end = addDays(start, 6);
    const sameYear = start.getFullYear() === end.getFullYear();
    const startText = start.toLocaleDateString([], { month: "short", day: "numeric", year: sameYear ? undefined : "numeric" });
    const endText = end.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
    return `${startText} - ${endText}`;
  }

  function rowDate(row) {
    return parseDate(row.dataset.assignmentStart) || parseDate(row.dataset.assignmentEnd);
  }

  function rowIsVisibleForWeek(row, weekStart) {
    const start = parseDate(row.dataset.assignmentStart);
    const end = parseDate(row.dataset.assignmentEnd) || start;
    if (!start) return true;
    const weekEnd = addDays(weekStart, 7);
    return end >= weekStart && start < weekEnd;
  }

  function ensureControls(panel) {
    let controls = document.getElementById("assignmentWeekOrganizer");
    if (controls) return controls;
    controls = document.createElement("div");
    controls.id = "assignmentWeekOrganizer";
    controls.className = "assignment-week-organizer";
    controls.innerHTML = `
      <button class="secondary-action icon-only" type="button" data-assignment-organizer-week="-1" aria-label="Previous week">&lsaquo;</button>
      <div class="assignment-week-organizer-title">
        <span>Organized by Week</span>
        <strong data-assignment-organizer-label></strong>
        <small data-assignment-organizer-count></small>
      </div>
      <button class="secondary-action icon-only" type="button" data-assignment-organizer-week="1" aria-label="Next week">&rsaquo;</button>
      <button class="secondary-action" type="button" data-assignment-organizer-current>Current Week</button>
      <button class="secondary-action" type="button" data-assignment-organizer-all>Show All</button>
    `;
    const message = document.getElementById("assignmentMessage");
    panel.insertBefore(controls, message || panel.firstChild);
    return controls;
  }

  function removeHeaders(list) {
    list.querySelectorAll("[data-assignment-week-header]").forEach((header) => header.remove());
  }

  function renderOrganizer() {
    if (state.isRendering) return;
    state.isRendering = true;
    try {
      const panel = document.querySelector(".assignment-list-panel");
      const list = document.getElementById("adminAssignments");
      if (!panel || !list) return;
      if (state.observer) state.observer.disconnect();
      const controls = ensureControls(panel);
      const rows = Array.from(list.querySelectorAll("[data-assignment-row-id]"));
      removeHeaders(list);

      let visibleCount = 0;
      let hiddenCount = 0;
      rows
        .sort((a, b) => {
          const aDate = rowDate(a);
          const bDate = rowDate(b);
          return (aDate ? aDate.getTime() : Number.MAX_SAFE_INTEGER) - (bDate ? bDate.getTime() : Number.MAX_SAFE_INTEGER);
        })
        .forEach((row) => {
          const visible = controls.dataset.showAll === "true" || rowIsVisibleForWeek(row, state.weekStart);
          row.hidden = !visible;
          if (visible) {
            visibleCount += 1;
            list.appendChild(row);
          } else {
            hiddenCount += 1;
          }
        });

      const header = document.createElement("div");
      header.className = "assignment-week-header";
      header.dataset.assignmentWeekHeader = "true";
      header.innerHTML = `<strong>${controls.dataset.showAll === "true" ? "All Scheduled Assignments" : formatWeek(state.weekStart)}</strong><span>${visibleCount} visible${hiddenCount ? `, ${hiddenCount} in other weeks` : ""}</span>`;
      list.insertBefore(header, list.firstChild);

      controls.querySelector("[data-assignment-organizer-label]").textContent = controls.dataset.showAll === "true" ? "All weeks" : formatWeek(state.weekStart);
      controls.querySelector("[data-assignment-organizer-count]").textContent = `${visibleCount} assignment${visibleCount === 1 ? "" : "s"} visible`;
      const count = document.getElementById("assignmentListCount");
      if (count) {
        count.textContent = controls.dataset.showAll === "true"
          ? `Showing ${visibleCount.toLocaleString()} assignments across all weeks`
          : `Showing ${visibleCount.toLocaleString()} assignments for ${formatWeek(state.weekStart)}`;
      }
    } catch (error) {
      console.warn("[assignment-week-organizer] Unable to organize assignments", error);
    } finally {
      state.isRendering = false;
      observeList();
    }
  }

  function bindEvents() {
    document.addEventListener("click", (event) => {
      const weekButton = event.target.closest("[data-assignment-organizer-week]");
      if (weekButton) {
        const controls = document.getElementById("assignmentWeekOrganizer");
        if (controls) controls.dataset.showAll = "false";
        state.weekStart = addDays(state.weekStart, Number(weekButton.dataset.assignmentOrganizerWeek || 0) * 7);
        renderOrganizer();
        return;
      }

      if (event.target.closest("[data-assignment-organizer-current]")) {
        const controls = document.getElementById("assignmentWeekOrganizer");
        if (controls) controls.dataset.showAll = "false";
        state.weekStart = startOfWeek(new Date());
        renderOrganizer();
        return;
      }

      if (event.target.closest("[data-assignment-organizer-all]")) {
        const controls = document.getElementById("assignmentWeekOrganizer");
        if (controls) controls.dataset.showAll = controls.dataset.showAll === "true" ? "false" : "true";
        renderOrganizer();
      }
    });
  }

  function observeList() {
    const list = document.getElementById("adminAssignments");
    if (!list || state.list !== list) {
      state.observer?.disconnect();
      state.observer = null;
      state.list = list || null;
    }
    if (list && !state.observer) {
      state.observer = new MutationObserver(() => {
        window.requestAnimationFrame(renderOrganizer);
      });
    }
    if (list && state.observer) {
      state.observer.observe(list, { childList: true });
    }
  }

  function start() {
    try {
      bindEvents();
      observeList();
      renderOrganizer();
    } catch (error) {
      console.warn("[assignment-week-organizer] Unable to start", error);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
