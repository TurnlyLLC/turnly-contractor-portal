import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const supabase = createClient(
  window.__ENV.SUPABASE_URL,
  window.__ENV.SUPABASE_ANON_KEY
);

const loginForm = document.getElementById("loginForm");
const logoutBtn = document.getElementById("logoutBtn");
const message = document.getElementById("message");
const assignmentForm = document.getElementById("assignmentForm");
const adminAssignments = document.getElementById("adminAssignments");
const contractorAssignments = document.getElementById("contractorAssignments");

function showMessage(text) {
  if (message) message.textContent = text;
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
    }

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

async function loadAdminAssignments() {
  if (!adminAssignments) return;

  const { data, error } = await supabase
    .from("assignment_blocks")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    adminAssignments.innerHTML = `<p>${error.message}</p>`;
    return;
  }

  adminAssignments.innerHTML = data.map(renderAssignmentCard).join("");
}

if (contractorAssignments) {
  const user = await requireLogin();

  if (user) {
    const profile = await getProfile(user.id);

    if (!profile) {
      window.location.href = "login.html";
    }

    loadContractorAssignments();
  }
}

async function loadContractorAssignments() {
  if (!contractorAssignments) return;

  const { data, error } = await supabase
    .from("assignment_blocks")
    .select("*")
    .eq("status", "open")
    .order("start_window", { ascending: true });

  if (error) {
    contractorAssignments.innerHTML = `<p>${error.message}</p>`;
    return;
  }

  if (!data.length) {
    contractorAssignments.innerHTML = `<p>No open assignments available right now.</p>`;
    return;
  }

  contractorAssignments.innerHTML = data.map(renderAssignmentCard).join("");
}

function renderAssignmentCard(item) {
  const start = item.start_window ? new Date(item.start_window).toLocaleString() : "Not set";
  const end = item.end_window ? new Date(item.end_window).toLocaleString() : "Not set";

  return `
    <div class="assignment-card">
      <h3>${item.title}</h3>
      <p><strong>Property:</strong> ${item.property_name || ""}</p>
      <p><strong>Address:</strong> ${item.address || ""}</p>
      <p><strong>Service:</strong> ${item.service_type || ""}</p>
      <p><strong>Pay:</strong> ${item.pay_amount ? "$" + item.pay_amount : "Not listed"}</p>
      <p><strong>Window:</strong> ${start} - ${end}</p>
      <p><strong>Scope:</strong> ${item.scope || ""}</p>
      <p><strong>Supplies:</strong> ${item.supplies_notes || ""}</p>
      <p><strong>Instructions:</strong> ${item.special_instructions || ""}</p>
      <p><strong>Status:</strong> ${item.status}</p>
    </div>
  `;
}
