const DATE_TIME_FIELDS = [
  { id: "start_window", label: "Start Window", required: true },
  { id: "end_window", label: "End Window", required: true },
  { id: "preferred_until", label: "Preferred Response Deadline", required: false }
];

function pad(value) {
  return String(value).padStart(2, "0");
}

function datePart(value) {
  return String(value || "").slice(0, 10);
}

function timePart(value) {
  const match = String(value || "").match(/T(\d{2}:\d{2})/);
  return match?.[1] || "";
}

function timeOptions() {
  const options = [];
  for (let hour = 0; hour < 24; hour += 1) {
    for (let minute = 0; minute < 60; minute += 15) {
      const value = `${pad(hour)}:${pad(minute)}`;
      const displayHour = hour % 12 || 12;
      const suffix = hour < 12 ? "AM" : "PM";
      options.push([value, `${displayHour}:${pad(minute)} ${suffix}`]);
    }
  }
  return options;
}

function syncNativeDateTime(fieldId) {
  const input = document.getElementById(fieldId);
  const date = document.getElementById(`${fieldId}_date`);
  const time = document.getElementById(`${fieldId}_time`);
  if (!input || !date || !time) return;
  input.value = date.value && time.value ? `${date.value}T${time.value}` : "";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function setVisibleValues(fieldId, value) {
  const date = document.getElementById(`${fieldId}_date`);
  const time = document.getElementById(`${fieldId}_time`);
  if (date) date.value = datePart(value);
  if (time) time.value = timePart(value);
}

function enhanceDateTimeInput(config) {
  const input = document.getElementById(config.id);
  if (!input || input.dataset.turnlyDateTimeEnhanced === "true") return;

  const field = input.closest(".suite-field") || input.closest("label");
  if (!field) return;

  input.dataset.turnlyDateTimeEnhanced = "true";
  input.dataset.turnlyOriginalType = input.type;
  input.required = false;
  input.tabIndex = -1;
  input.setAttribute("aria-hidden", "true");
  input.classList.add("assignment-native-datetime");

  field.classList.add("assignment-date-time-field");
  field.insertAdjacentHTML("beforeend", `
    <div class="assignment-date-time-control" data-date-time-control="${config.id}">
      <input id="${config.id}_date" class="assignment-date-input" type="date" ${config.required ? "required" : ""} aria-label="${config.label} date" />
      <select id="${config.id}_time" class="assignment-time-select" ${config.required ? "required" : ""} aria-label="${config.label} time">
        <option value="">Time</option>
        ${timeOptions().map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}
      </select>
    </div>
  `);

  setVisibleValues(config.id, input.value);
  document.getElementById(`${config.id}_date`)?.addEventListener("change", () => syncNativeDateTime(config.id));
  document.getElementById(`${config.id}_time`)?.addEventListener("change", () => syncNativeDateTime(config.id));
}

function injectDateTimeStyles() {
  if (document.getElementById("assignmentDateTimeControlStyles")) return;
  document.head.insertAdjacentHTML("beforeend", `
    <style id="assignmentDateTimeControlStyles">
      .assignment-native-datetime {
        height: 1px !important;
        opacity: 0 !important;
        pointer-events: none !important;
        position: absolute !important;
        width: 1px !important;
      }
      .assignment-date-time-field {
        position: relative;
      }
      .assignment-date-time-control {
        display: grid;
        gap: 8px;
        grid-template-columns: minmax(142px, 1fr) minmax(118px, .78fr);
      }
      .assignment-date-time-control input,
      .assignment-date-time-control select {
        min-width: 0;
      }
      .assignment-time-select {
        max-height: 220px;
      }
      @media (max-width: 720px) {
        .assignment-date-time-control {
          grid-template-columns: 1fr;
        }
      }
    </style>
  `);
}

function enhanceAssignmentDateTimeControls() {
  injectDateTimeStyles();
  DATE_TIME_FIELDS.forEach(enhanceDateTimeInput);
}

function bindDateTimeSync() {
  document.addEventListener("submit", (event) => {
    if (event.target?.id !== "assignmentForm") return;
    DATE_TIME_FIELDS.forEach((field) => syncNativeDateTime(field.id));
  }, true);
}

const observer = new MutationObserver(enhanceAssignmentDateTimeControls);
observer.observe(document.body, { childList: true, subtree: true });
enhanceAssignmentDateTimeControls();
bindDateTimeSync();
