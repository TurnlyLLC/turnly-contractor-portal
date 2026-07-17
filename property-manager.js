import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const env = window.__ENV || {};
const supabase = env.SUPABASE_URL && env.SUPABASE_ANON_KEY
  ? createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
  : null;

const managerMain = document.querySelector(".command-main");

const state = {
  user: null,
  profile: null,
  property: null,
  threads: [],
  participants: [],
  messages: [],
  selectedThreadId: "",
  message: "",
  error: false,
  sending: false
};

const roleDashboards = {
  admin: "admin.html",
  contractor: "contractor.html",
  sales: "sales.html",
  sales_team: "sales.html",
  property_manager: "property-manager.html"
};

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizeRole(role) {
  return String(role || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function normalizeStatus(status) {
  return String(status || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function isActiveProfile(profile) {
  return ["active", "approved", "enabled"].includes(normalizeStatus(profile?.status));
}

function getPortalHome(role) {
  return roleDashboards[normalizeRole(role)] || "contractor.html";
}

function getName(user, profile) {
  return profile?.full_name ||
    user?.user_metadata?.full_name ||
    user?.email?.split("@")[0] ||
    "Property Manager";
}

function renderLockedState(title, body) {
  if (!managerMain) return;
  managerMain.innerHTML = `
    <header class="command-header">
      <div>
        <h1>${esc(title)}</h1>
        <p>${esc(body)}</p>
      </div>
    </header>
    <section class="panel-card wip-panel">
      <p class="wip-kicker">Account Access</p>
      <h2>${esc(title)}</h2>
      <p>${esc(body)}</p>
    </section>
  `;
}

async function requireManagerAccess() {
  if (!supabase) {
    renderLockedState("Configuration needed", "Supabase configuration is missing for this deployment.");
    return;
  }

  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user || null;

  if (!user) {
    window.location.href = "property-manager-login.html";
    return;
  }

  let { data: profile, error } = await supabase
    .from("profiles")
    .select("id,role,full_name,email,status,property_manager_property_id")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    const fallback = await supabase
      .from("profiles")
      .select("id,role,full_name,email,status")
      .eq("id", user.id)
      .maybeSingle();
    profile = fallback.data ? { ...fallback.data, property_manager_property_id: null, access_setup_error: true } : null;
  }

  const role = normalizeRole(profile?.role);

  if (!profile) {
    window.location.href = "property-manager-login.html";
    return;
  }

  if (role !== "property_manager") {
    window.location.href = getPortalHome(role);
    return;
  }

  const name = getName(user, profile);
  const nameElement = document.getElementById("managerUserName");
  if (nameElement) nameElement.textContent = name;

  if (!isActiveProfile(profile)) {
    renderLockedState("Approval pending", "A Turnly admin must approve this property manager account before property data is visible.");
    return;
  }

  if (!profile.property_manager_property_id) {
    const setupText = profile.access_setup_error
      ? "This account is approved, but the account-access migration is still needed before a property can be linked."
      : "A Turnly admin must link this property manager account to a specific property before any property data is visible.";
    renderLockedState("Property link required", setupText);
    return;
  }

  const { data: property, error: propertyError } = await supabase
    .from("portal_properties")
    .select("id,name")
    .eq("id", profile.property_manager_property_id)
    .maybeSingle();

  if (propertyError || !property) {
    renderLockedState("Property access unavailable", "This account has a property link, but the linked property could not be loaded.");
    return;
  }

  state.user = user;
  state.profile = profile;
  state.property = property;
  renderManagerPortal();
  await loadManagerMessages();
  renderManagerMessages();
}

function renderManagerPortal() {
  if (!managerMain) return;
  managerMain.innerHTML = `
    <header class="command-header">
      <div>
        <h1>Property Manager Portal</h1>
        <p>Property details, cleaning reports, invoices, feedback, and messages.</p>
      </div>
    </header>
    <section class="manager-dashboard-grid">
      <section class="panel-card wip-panel manager-property-card" id="properties">
        <p class="wip-kicker">Linked Property</p>
        <h2>${esc(state.property?.name || "Property account linked")}</h2>
        <p>Your property manager account is linked and ready for property-specific workflows.</p>
      </section>
      <section class="panel-card manager-message-panel" id="messages">
        <div class="manager-panel-head">
          <div>
            <p class="wip-kicker">Messages</p>
            <h2>Turnly Messages</h2>
          </div>
          <button class="secondary-command-btn" type="button" data-manager-refresh-messages>Refresh</button>
        </div>
        <p id="managerMessageStatus" class="manager-message-status ${state.error ? "error" : ""}" aria-live="polite">${esc(state.message || "Loading messages...")}</p>
        <section class="manager-messages-layout">
          <div id="managerThreadList" class="manager-message-thread-list">${renderManagerThreadList()}</div>
          <div id="managerConversation" class="manager-message-conversation">${renderManagerConversation()}</div>
        </section>
        <form id="managerNewThreadForm" class="manager-message-form">
          <label>
            <span>Subject</span>
            <input name="subject" placeholder="Question about service, invoices, or property notes" />
          </label>
          <label>
            <span>Message Turnly</span>
            <textarea name="body" rows="4" placeholder="Type your message..." required></textarea>
          </label>
          <button class="new-btn" type="submit" ${state.sending ? "disabled" : ""}>Send Message</button>
        </form>
      </section>
    </section>
  `;
}

async function loadManagerMessages() {
  if (!supabase || !state.user?.id) return;
  const { data: ownParticipants, error: participantError } = await supabase
    .from("message_thread_participants")
    .select("thread_id,last_read_at")
    .eq("user_id", state.user.id)
    .eq("is_archived", false);

  if (participantError) {
    state.threads = [];
    state.participants = [];
    state.messages = [];
    setManagerMessageStatus(`Unable to load messages: ${participantError.message}`, true);
    return;
  }

  const threadIds = [...new Set((ownParticipants || []).map((row) => row.thread_id).filter(Boolean))];
  if (!threadIds.length) {
    state.threads = [];
    state.participants = [];
    state.messages = [];
    state.selectedThreadId = "";
    setManagerMessageStatus("No conversations yet.");
    return;
  }

  const [threadsResult, participantsResult] = await Promise.all([
    supabase.from("message_threads").select("*").in("id", threadIds).order("last_message_at", { ascending: false }),
    supabase.from("message_thread_participants").select("*").in("thread_id", threadIds).order("display_name", { ascending: true })
  ]);

  if (threadsResult.error || participantsResult.error) {
    setManagerMessageStatus(`Unable to load messages: ${(threadsResult.error || participantsResult.error).message}`, true);
    return;
  }

  state.threads = threadsResult.data || [];
  state.participants = participantsResult.data || [];
  if (!state.threads.some((thread) => thread.id === state.selectedThreadId)) {
    state.selectedThreadId = state.threads[0]?.id || "";
  }
  await loadManagerThreadMessages(state.selectedThreadId);
  setManagerMessageStatus(`${state.threads.length} conversation${state.threads.length === 1 ? "" : "s"} loaded.`);
}

async function loadManagerThreadMessages(threadId) {
  if (!supabase || !threadId) {
    state.messages = [];
    return;
  }
  const { data, error } = await supabase
    .from("message_thread_messages")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .limit(300);

  if (error) {
    state.messages = [];
    setManagerMessageStatus(`Unable to load conversation: ${error.message}`, true);
    return;
  }

  state.messages = data || [];
}

function renderManagerMessages() {
  const list = document.getElementById("managerThreadList");
  const conversation = document.getElementById("managerConversation");
  if (list) list.innerHTML = renderManagerThreadList();
  if (conversation) conversation.innerHTML = renderManagerConversation();
  setManagerMessageStatus(state.message, state.error);
}

function renderManagerThreadList() {
  if (!state.threads.length) return `<div class="manager-message-empty">No conversations yet.</div>`;
  return state.threads.map((thread) => `
    <button class="manager-message-thread ${thread.id === state.selectedThreadId ? "active" : ""} ${managerThreadUnread(thread) ? "unread" : ""}" type="button" data-manager-thread-id="${esc(thread.id)}">
      <strong>${esc(thread.subject || "Message")}</strong>
      <small>${esc(managerParticipantLine(thread.id))}</small>
      <span>${esc(formatManagerMessageTime(thread.last_message_at || thread.created_at))}</span>
      <p>${esc(thread.last_message_preview || "No messages yet.")}</p>
    </button>
  `).join("");
}

function renderManagerConversation() {
  const thread = selectedManagerThread();
  if (!thread) return `<div class="manager-message-empty">Select a conversation or send Turnly a new message.</div>`;
  return `
    <div class="manager-message-conversation-head">
      <div>
        <span>Conversation</span>
        <h3>${esc(thread.subject || "Message")}</h3>
        <small>${esc(managerParticipantLine(thread.id))}</small>
      </div>
    </div>
    <div class="manager-message-bubbles">
      ${state.messages.length ? state.messages.map(renderManagerBubble).join("") : `<div class="manager-message-empty">No replies yet.</div>`}
    </div>
    <form id="managerReplyForm" class="manager-message-form compact">
      <label>
        <span>Reply</span>
        <textarea name="body" rows="3" placeholder="Type your reply..." required></textarea>
      </label>
      <button class="new-btn" type="submit" ${state.sending ? "disabled" : ""}>Send Reply</button>
    </form>
  `;
}

function renderManagerBubble(message) {
  const mine = message.sender_id === state.user?.id;
  return `
    <article class="manager-message-bubble ${mine ? "mine" : ""}">
      <div>
        <strong>${esc(message.sender_name || "User")}</strong>
        <small>${esc(formatManagerMessageTime(message.created_at))}</small>
      </div>
      <p>${esc(message.body || "")}</p>
    </article>
  `;
}

async function createManagerMessageThread(form) {
  const body = form.elements.body?.value?.trim() || "";
  const subject = form.elements.subject?.value?.trim() || "Message";
  if (!body) return;

  state.sending = true;
  setManagerMessageStatus("Sending message...");
  renderManagerMessages();

  const { data, error } = await supabase.rpc("create_message_thread_v2", {
    message_payload: {
      recipient_ids: [],
      subject,
      body,
      related_type: "property",
      related_id: state.property?.id || "",
      related_title: state.property?.name || ""
    }
  });

  state.sending = false;
  if (error) {
    setManagerMessageStatus(`Unable to send message: ${error.message}`, true);
    renderManagerMessages();
    return;
  }

  form.reset();
  state.selectedThreadId = data || state.selectedThreadId;
  await loadManagerMessages();
  renderManagerMessages();
}

async function sendManagerReply(form) {
  const thread = selectedManagerThread();
  const body = form.elements.body?.value?.trim() || "";
  if (!thread || !body) return;

  state.sending = true;
  setManagerMessageStatus("Sending reply...");
  renderManagerMessages();

  const { error } = await supabase.rpc("send_message_reply_v2", {
    message_payload: {
      thread_id: thread.id,
      body
    }
  });

  state.sending = false;
  if (error) {
    setManagerMessageStatus(`Unable to send reply: ${error.message}`, true);
    renderManagerMessages();
    return;
  }

  form.reset();
  await loadManagerMessages();
  renderManagerMessages();
}

async function markManagerThreadRead(threadId) {
  if (!supabase || !threadId) return;
  const { error } = await supabase.rpc("mark_message_thread_read", { target_thread_id: threadId });
  if (error) {
    await supabase
      .from("message_thread_participants")
      .update({ last_read_at: new Date().toISOString() })
      .eq("thread_id", threadId)
      .eq("user_id", state.user?.id || "");
  }
}

function selectedManagerThread() {
  return state.threads.find((thread) => thread.id === state.selectedThreadId) || null;
}

function managerThreadParticipants(threadId) {
  return state.participants.filter((participant) => participant.thread_id === threadId);
}

function managerParticipantLine(threadId) {
  const names = managerThreadParticipants(threadId)
    .filter((participant) => participant.user_id !== state.user?.id)
    .map((participant) => participant.display_name || participant.email || "Turnly")
    .filter(Boolean);
  return names.length ? names.join(", ") : "Turnly Operations";
}

function managerThreadUnread(thread) {
  const own = managerThreadParticipants(thread.id).find((participant) => participant.user_id === state.user?.id);
  if (!own || !thread.last_message_at) return false;
  if (!own.last_read_at) return true;
  return new Date(thread.last_message_at).getTime() > new Date(own.last_read_at).getTime();
}

function formatManagerMessageTime(value) {
  if (!value) return "No date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No date";
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function setManagerMessageStatus(message, error = false) {
  state.message = message || "";
  state.error = Boolean(error);
  const target = document.getElementById("managerMessageStatus");
  if (!target) return;
  target.textContent = state.message;
  target.classList.toggle("error", state.error);
}

document.addEventListener("click", async (event) => {
  const refresh = event.target.closest("[data-manager-refresh-messages]");
  if (refresh) {
    await loadManagerMessages();
    renderManagerMessages();
    return;
  }

  const thread = event.target.closest("[data-manager-thread-id]");
  if (thread) {
    state.selectedThreadId = thread.dataset.managerThreadId || "";
    await markManagerThreadRead(state.selectedThreadId);
    await loadManagerThreadMessages(state.selectedThreadId);
    renderManagerMessages();
  }
});

document.addEventListener("submit", async (event) => {
  if (event.target.matches("#managerNewThreadForm")) {
    event.preventDefault();
    await createManagerMessageThread(event.target);
  }
  if (event.target.matches("#managerReplyForm")) {
    event.preventDefault();
    await sendManagerReply(event.target);
  }
});

document.getElementById("managerLogoutBtn")?.addEventListener("click", async () => {
  await supabase?.auth.signOut();
  window.location.href = "property-manager-login.html";
});

await requireManagerAccess();
