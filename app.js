import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const supabase = createClient(
  window.__ENV.SUPABASE_URL,
  window.__ENV.SUPABASE_ANON_KEY
);

const loginForm = document.getElementById("loginForm");
const logoutBtn = document.getElementById("logoutBtn");
const message = document.getElementById("message");
const claimMessage = document.getElementById("claimMessage");
const assignmentForm = document.getElementById("assignmentForm");
const adminAssignments = document.getElementById("adminAssignments");
const contractorAssignments = document.getElementById("contractorAssignments");
const myAssignments = document.getElementById("myAssignments");

function showMessage(text, target = message) {
  if (target) target.textContent = text;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString() : "Not set";
}

function formatMoney(value) {
  return value ? "$" + Number(value).toFixed(2) : "Not listed";
}

function shortId(value) {
  return value ? value.slice(0, 8) + "..." : "";
}

function statusClass(status) {
  return "status-" + String(status || "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

async function getCurrentUser() {
  const { data } = await supabase.auth.getUser();
  return data.user;
}

async function requireLogin() {
  const user = await getCurrentUser();

  if (!user) {
    window.location.href = "login.html";
    return null;
  }

  return user;
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

if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    showMessage("Signing in...");

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      showMessage(error.message);
      return;
    }

    const profile = await getProfile(data.user.id);

    if (!profile) {
      showMessage("Login successful, but no profile role found.");
      return;
    }

    if (profile.role === "admin") {
      window.location.href = "admin.html";
    } else {
      window.location.href = "contractor.html";
    }
  });
}

if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    await supabase.auth.signOut();
    window.location.href = "login.html";
  });
}

if (assignmentForm) {
  const user = await requireLogin();

  if (user) {
    const profile = await getProfile(user.id);

    if (!profile || profile.role !== "admin") {
      window.location.href = "contractor.html";
    } else {
      loadAdminAssignments();

      assignmentForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        showMessage("Posting assignment...");

        const assignment = {
          title: document.getElementById("title").value,
          property_name: document.getElementById("property_name").value,
          address: document.getElementById("address").value,
          service_type: document.getElementById("service_type").value,
          scope: document.getElementById("scope").value,
          pay_amount: document.getElementById("pay_amount").value || null,
          start_window: document.getElementById("start_window").value || null,
          end_window: document.getElementById("end_window").value || null,
          supplies_notes: document.getElementById("supplies_notes").value,
          special_instructions: document.getElementById("special_instructions").value,
          status: "open",
          created_by: user.id
        };

        const { error } = await supabase
          .from("assignment_blocks")
          .insert([assignment]);

        if (error) {
          showMessage("Error: " + error.message);
          return;
        }

        showMessage("Assignment posted successfully.");
        assignmentForm.reset();
        loadAdminAssignments();
      });
    }
  }
}

async function loadAdminAssignments() {
  if (!adminAssignments) return;

  const { data, error } = await supabase
    .from("assignment_blocks")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    adminAssignments.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
    return;
  }

  if (!data.length) {
    adminAssignments.innerHTML = "<p>No assignments have been posted yet.</p>";
    return;
  }

  adminAssignments.innerHTML = data
    .map((item) => renderAssignmentCard(item, { mode: "admin" }))
    .join("");
}

if (contractorAssignments || myAssignments) {
  const user = await requireLogin();

  if (user) {
    const profile = await getProfile(user.id);

    if (!profile) {
      window.location.href = "login.html";
    } else {
      await loadContractorDashboard(user);

      if (contractorAssignments) {
        contractorAssignments.addEventListener("click", async (e) => {
          const button = e.target.closest("[data-claim-assignment-id]");
          if (!button) return;

          button.disabled = true;
          await claimAssignment(button.dataset.claimAssignmentId, user);
        });
      }
    }
  }
}

async function loadContractorDashboard(user) {
  await Promise.all([
    loadContractorAssignments(),
    loadMyAssignments(user)
  ]);
}

async function loadContractorAssignments() {
  if (!contractorAssignments) return;

  const { data, error } = await supabase
    .from("assignment_blocks")
    .select("*")
    .eq("status", "open")
    .is("claimed_by", null)
    .order("start_window", { ascending: true });

  if (error) {
    contractorAssignments.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
    return;
  }

  if (!data.length) {
    contractorAssignments.innerHTML = "<p>No open assignments available right now.</p>";
    return;
  }

  contractorAssignments.innerHTML = data
    .map((item) => renderAssignmentCard(item, { mode: "contractor-open" }))
    .join("");
}

async function loadMyAssignments(user) {
  if (!myAssignments) return;

  const { data, error } = await supabase
    .from("assignment_blocks")
    .select("*")
    .eq("claimed_by", user.id)
    .order("start_window", { ascending: true });

  if (error) {
    myAssignments.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
    return;
  }

  if (!data.length) {
    myAssignments.innerHTML = "<p>You have not claimed any assignments yet.</p>";
    return;
  }

  myAssignments.innerHTML = data
    .map((item) => renderAssignmentCard(item, { mode: "contractor-claimed" }))
    .join("");
}

async function claimAssignment(assignmentId, user) {
  showMessage("Claiming assignment...", claimMessage);

  const { data, error } = await supabase
    .from("assignment_blocks")
    .update({
      status: "claimed",
      claimed_by: user.id,
      claimed_at: new Date().toISOString()
    })
    .eq("id", assignmentId)
    .eq("status", "open")
    .is("claimed_by", null)
    .select("*")
    .maybeSingle();

  if (error) {
    showMessage("Error: " + error.message, claimMessage);
    await loadContractorDashboard(user);
    return;
  }

  if (!data) {
    showMessage("That assignment was already claimed by another contractor.", claimMessage);
    await loadContractorDashboard(user);
    return;
  }

  showMessage("Assignment claimed. It is now listed under My Assignments.", claimMessage);
  await loadContractorDashboard(user);
}

function renderAssignmentCard(item, options = {}) {
  const mode = options.mode || "read";
  const start = formatDateTime(item.start_window);
  const end = formatDateTime(item.end_window);
  const status = escapeHtml(item.status || "unknown");
  const claimedAt = item.claimed_at ? formatDateTime(item.claimed_at) : "";
  const claimant = item.claimed_by
    ? `Contractor ${escapeHtml(shortId(item.claimed_by))}${claimedAt ? " on " + escapeHtml(claimedAt) : ""}`
    : "Not claimed yet";
  const claimButton = mode === "contractor-open" && item.id
    ? `<button type="button" class="claim-btn" data-claim-assignment-id="${escapeHtml(item.id)}">Claim Assignment</button>`
    : "";
  const claimedInfo = mode === "admin" || mode === "contractor-claimed"
    ? `<p><strong>Claimed By:</strong> ${claimant}</p>`
    : "";

  return `
    <div class="assignment-card">
      <div class="assignment-card-header">
        <h3>${escapeHtml(item.title)}</h3>
        <span class="status-badge ${statusClass(item.status)}">${status}</span>
      </div>
      <p><strong>Property:</strong> ${escapeHtml(item.property_name)}</p>
      <p><strong>Address:</strong> ${escapeHtml(item.address)}</p>
      <p><strong>Service:</strong> ${escapeHtml(item.service_type)}</p>
      <p><strong>Pay:</strong> ${escapeHtml(formatMoney(item.pay_amount))}</p>
      <p><strong>Window:</strong> ${escapeHtml(start)} - ${escapeHtml(end)}</p>
      <p><strong>Scope:</strong> ${escapeHtml(item.scope)}</p>
      <p><strong>Supplies:</strong> ${escapeHtml(item.supplies_notes)}</p>
      <p><strong>Instructions:</strong> ${escapeHtml(item.special_instructions)}</p>
      ${claimedInfo}
      ${claimButton ? `<div class="assignment-actions">${claimButton}</div>` : ""}
    </div>
  `;
}
