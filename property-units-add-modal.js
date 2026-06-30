const modalState = {
  started: false
};

function propertyUnitsWorkspace() {
  return document.querySelector("[data-property-units-page]");
}

function isPropertyUnitsPage() {
  return document.body?.dataset.adminPage === "property-units";
}

function isAddUnitTrigger(target) {
  if (!isPropertyUnitsPage()) return null;

  const direct = target?.closest?.("[data-property-unit-add]");
  if (direct) return direct;

  const topbarAction = target?.closest?.(".suite-topbar .primary-action");
  if (topbarAction && topbarAction.textContent?.trim().toLowerCase() === "add unit") {
    return topbarAction;
  }

  return null;
}

function setPropertyUnitModalMessage(text, isError = false) {
  const message = document.getElementById("propertyUnitMessage");
  if (!message) return;
  message.textContent = text || "";
  message.classList.toggle("error", Boolean(isError));
  message.classList.toggle("is-error", Boolean(isError));
}

function selectedPropertyName() {
  const select = document.getElementById("propertyUnitPropertySelect");
  return select?.selectedOptions?.[0]?.textContent?.trim() || "";
}

function ensureModal() {
  const root = propertyUnitsWorkspace();
  if (!root) return null;

  let modal = document.getElementById("propertyUnitAddModal");
  if (!modal) {
    root.insertAdjacentHTML("beforeend", `
      <div id="propertyUnitAddModal" class="property-unit-add-modal" role="dialog" aria-modal="true" aria-labelledby="propertyUnitAddModalTitle" hidden>
        <div class="property-unit-add-backdrop" data-property-unit-modal-close></div>
        <section class="property-unit-add-dialog">
          <header class="property-unit-add-head">
            <div>
              <p>Add Unit</p>
              <h2 id="propertyUnitAddModalTitle">New Property Unit</h2>
              <span id="propertyUnitAddModalProperty">Select a property first</span>
            </div>
            <button class="secondary-action property-unit-modal-close" type="button" data-property-unit-modal-close aria-label="Close add unit modal">Close</button>
          </header>
          <div id="propertyUnitAddFormSlot" class="property-unit-add-form-slot"></div>
        </section>
      </div>
    `);
    modal = document.getElementById("propertyUnitAddModal");
  }

  moveQuickFormIntoModal();
  return modal;
}

function moveQuickFormIntoModal() {
  const form = document.getElementById("propertyUnitQuickForm");
  const slot = document.getElementById("propertyUnitAddFormSlot");
  if (!form || !slot || form.parentElement === slot) return;

  form.classList.add("property-unit-modal-form");
  slot.appendChild(form);
}

function openAddUnitModal() {
  const propertySelect = document.getElementById("propertyUnitPropertySelect");
  if (!propertySelect?.value) {
    setPropertyUnitModalMessage("Select a property before adding units.", true);
    propertySelect?.focus();
    return;
  }

  const modal = ensureModal();
  const form = document.getElementById("propertyUnitQuickForm");
  if (!modal || !form) return;

  form.reset();
  const propertyLabel = document.getElementById("propertyUnitAddModalProperty");
  if (propertyLabel) propertyLabel.textContent = selectedPropertyName();

  modal.hidden = false;
  document.body.classList.add("property-unit-modal-open");
  window.setTimeout(() => {
    form.querySelector("[name='unit_name']")?.focus();
  }, 40);
}

function closeAddUnitModal() {
  const modal = document.getElementById("propertyUnitAddModal");
  if (modal) modal.hidden = true;
  document.body.classList.remove("property-unit-modal-open");
}

function installModalStyles() {
  if (document.getElementById("propertyUnitsAddModalStyles")) return;

  const style = document.createElement("style");
  style.id = "propertyUnitsAddModalStyles";
  style.textContent = `
    body.property-unit-modal-open { overflow: hidden; }
    .property-unit-add-modal[hidden] { display: none; }
    .property-unit-add-modal {
      bottom: 0;
      left: 0;
      position: fixed;
      right: 0;
      top: 0;
      z-index: 80;
    }
    .property-unit-add-backdrop {
      background: rgba(0, 0, 0, 0.62);
      bottom: 0;
      left: 0;
      position: absolute;
      right: 0;
      top: 0;
    }
    .property-unit-add-dialog {
      background: linear-gradient(145deg, rgba(18, 33, 52, 0.98), rgba(10, 24, 40, 0.98));
      border: 1px solid var(--suite-border);
      border-radius: 10px;
      box-shadow: 0 24px 80px rgba(0, 0, 0, 0.42);
      display: grid;
      gap: 14px;
      left: 50%;
      max-height: min(88vh, 720px);
      max-width: 860px;
      overflow: auto;
      padding: 18px;
      position: absolute;
      top: 50%;
      transform: translate(-50%, -50%);
      width: min(92vw, 860px);
    }
    .property-unit-add-head {
      align-items: start;
      border-bottom: 1px solid var(--suite-border-soft);
      display: flex;
      gap: 16px;
      justify-content: space-between;
      padding-bottom: 12px;
    }
    .property-unit-add-head p,
    .property-unit-add-head h2,
    .property-unit-add-head span {
      margin: 0;
    }
    .property-unit-add-head p {
      color: var(--suite-green);
      font-size: 11px;
      font-weight: 900;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .property-unit-add-head h2 {
      font-size: 20px;
      line-height: 1.15;
      margin-top: 4px;
    }
    .property-unit-add-head span {
      color: var(--suite-soft);
      display: block;
      font-size: 12px;
      margin-top: 5px;
    }
    .property-unit-add-form-slot .property-unit-quick-form {
      background: transparent;
      border: 0;
      box-shadow: none;
      display: grid;
      gap: 12px;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      margin: 0;
      padding: 0;
    }
    .property-unit-add-form-slot .property-unit-quick-form .property-unit-notes-field {
      grid-column: 1 / -1;
    }
    .property-unit-add-form-slot .property-unit-quick-form > button[type='submit'] {
      grid-column: 1 / -1;
      justify-self: end;
      min-width: 160px;
    }
    @media (max-width: 720px) {
      .property-unit-add-dialog {
        max-height: 92vh;
        padding: 14px;
        width: min(94vw, 860px);
      }
      .property-unit-add-head {
        display: grid;
      }
      .property-unit-add-form-slot .property-unit-quick-form {
        grid-template-columns: 1fr;
      }
      .property-unit-add-form-slot .property-unit-quick-form > button[type='submit'],
      .property-unit-modal-close {
        justify-self: stretch;
        width: 100%;
      }
    }
  `;
  document.head.appendChild(style);
}

function bindModalEvents() {
  if (modalState.started) return;
  modalState.started = true;

  document.addEventListener("click", (event) => {
    const addTrigger = isAddUnitTrigger(event.target);
    if (addTrigger) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      openAddUnitModal();
      return;
    }

    const closeTrigger = event.target?.closest?.("[data-property-unit-modal-close]");
    if (closeTrigger) {
      event.preventDefault();
      closeAddUnitModal();
    }
  }, true);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !document.getElementById("propertyUnitAddModal")?.hidden) {
      closeAddUnitModal();
    }
  });
}

function startWhenReady() {
  const root = propertyUnitsWorkspace();
  const form = document.getElementById("propertyUnitQuickForm");
  if (!root || !form) {
    window.setTimeout(startWhenReady, 80);
    return;
  }

  installModalStyles();
  ensureModal();
  bindModalEvents();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startWhenReady, { once: true });
} else {
  startWhenReady();
}
window.addEventListener("load", startWhenReady, { once: true });
