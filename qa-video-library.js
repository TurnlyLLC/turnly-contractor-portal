import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const TABLE = "qa_videos";
const BUCKET = "qa-videos";
const SIGNED_URL_SECONDS = 60 * 60 * 4;
const PHASES = [
  ["all", "All"],
  ["before", "Before"],
  ["after", "After"],
  ["final", "Final"],
  ["issue", "Issue"],
  ["other", "Other"]
];

const env = window.__ENV || {};
const supabase = env.SUPABASE_URL && env.SUPABASE_ANON_KEY
  ? createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
  : null;

const state = {
  videos: [],
  properties: [],
  search: "",
  phase: "all",
  loading: true,
  uploading: false,
  message: "",
  tone: "",
  progress: 0,
  user: null
};

function uid() {
  return window.crypto?.randomUUID?.() || `qa-video-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function selected(value, expected) {
  return String(value || "") === String(expected) ? "selected" : "";
}

function bytes(value) {
  const size = Number(value) || 0;
  if (size >= 1024 * 1024 * 1024) return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`;
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  if (size >= 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${size} B`;
}

function formatDate(value) {
  if (!value) return "Not dated";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not dated" : date.toLocaleString();
}

function propertyTitle(row) {
  return row?.property_name || row?.company_name || row?.name || row?.title || "Unnamed property";
}

function labelForPhase(phase) {
  return PHASES.find(([key]) => key === phase)?.[1] || "Other";
}

function safeFileName(name) {
  return String(name || "video")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || "video";
}

function tagsFromText(value) {
  return String(value || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function waitForShell() {
  return new Promise((resolve) => {
    const existing = document.querySelector("#adminSuiteApp .suite-content");
    if (existing) {
      resolve(existing);
      return;
    }

    const observer = new MutationObserver(() => {
      const content = document.querySelector("#adminSuiteApp .suite-content");
      if (!content) return;
      observer.disconnect();
      resolve(content);
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });
  });
}

function setHeading() {
  const title = document.querySelector(".page-heading h1");
  const subtitle = document.querySelector(".page-heading p");
  if (title) title.textContent = "QA Video Library";
  if (subtitle) subtitle.textContent = "Upload, label, and review before and after quality videos.";
}

function qualityTabs() {
  return `
    <div class="suite-tabs qa-video-tabs">
      <a class="suite-tab" href="qa-queue.html">QA Queue</a>
      <a class="suite-tab" href="qa-reviews.html">QA Reviews</a>
      <a class="suite-tab" href="checklists.html">QA Checklists</a>
      <a class="suite-tab" href="qa-analytics.html">QA Analytics</a>
      <a class="suite-tab active" href="videos.html">Video Library</a>
    </div>
  `;
}

function metric(label, value, subtext, tone = "") {
  return `
    <div class="metric-card ${tone}">
      <div class="metric-icon-wrap">${escapeHtml(label.slice(0, 1))}</div>
      <div class="metric-body">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
        <small>${escapeHtml(subtext)}</small>
      </div>
    </div>
  `;
}

function renderMetrics() {
  const before = state.videos.filter((video) => video.video_phase === "before").length;
  const after = state.videos.filter((video) => video.video_phase === "after").length;
  const totalSize = state.videos.reduce((sum, video) => sum + (Number(video.file_size) || 0), 0);
  const pairCount = new Set(state.videos.map((video) => video.pair_id).filter(Boolean)).size;

  return `
    <section class="qa-video-metrics" aria-label="QA video summary">
      ${metric("Videos", state.videos.length.toLocaleString(), "stored in Supabase")}
      ${metric("Before", before.toLocaleString(), "before work proof", "blue")}
      ${metric("After", after.toLocaleString(), "after work proof", "green")}
      ${metric("Storage", bytes(totalSize), `${pairCount.toLocaleString()} video set${pairCount === 1 ? "" : "s"}`, "purple")}
    </section>
  `;
}

function propertyOptions() {
  return [
    `<option value="">No property label</option>`,
    ...state.properties.map((property) => `<option value="${escapeHtml(property.id)}">${escapeHtml(propertyTitle(property))}</option>`)
  ].join("");
}

function renderUploadPanel() {
  return `
    <section class="suite-panel qa-video-upload">
      <div class="qa-video-panel-head">
        <div>
          <h2>Upload QA Videos</h2>
          <p>Save before and after clips with labels for easy review.</p>
        </div>
      </div>
      <form id="qaVideoUploadForm" class="qa-video-form">
        <div class="qa-video-grid">
          <label class="qa-video-field span-all">
            <span>Label</span>
            <input id="qaVideoLabel" name="label" placeholder="Vetra Forest Hills unit 2117-4 final QA" required />
          </label>
          <label class="qa-video-field">
            <span>Property</span>
            <select id="qaVideoProperty" name="property_id">${propertyOptions()}</select>
          </label>
          <label class="qa-video-field">
            <span>Unit</span>
            <input name="unit_name" placeholder="2117-4" />
          </label>
          <label class="qa-video-field">
            <span>Contractor</span>
            <input name="contractor_name" placeholder="Contractor name" />
          </label>
          <label class="qa-video-field">
            <span>Recorded At</span>
            <input name="recorded_at" type="datetime-local" />
          </label>
          <label class="qa-video-field span-all">
            <span>Tags</span>
            <input name="tags" placeholder="turnover, kitchen, punchlist" />
          </label>
          <label class="qa-video-field span-all">
            <span>Notes</span>
            <textarea name="notes" rows="3" placeholder="Add context, issues found, or QA decision notes"></textarea>
          </label>
        </div>

        <div class="qa-video-upload-group">
          <h3>Video Files</h3>
          <label class="qa-video-field">
            <span>Before Video</span>
            <input name="before_file" type="file" accept="video/*" />
          </label>
          <label class="qa-video-field">
            <span>After Video</span>
            <input name="after_file" type="file" accept="video/*" />
          </label>
          <label class="qa-video-field">
            <span>Other / Issue Video</span>
            <input name="other_file" type="file" accept="video/*" />
          </label>
          <label class="qa-video-field">
            <span>Other Video Type</span>
            <select name="other_phase">
              <option value="other">Other</option>
              <option value="final">Final</option>
              <option value="issue">Issue</option>
            </select>
          </label>
        </div>

        <div class="qa-video-progress" ${state.uploading ? "" : "hidden"}><span style="width:${state.progress}%"></span></div>
        <div class="qa-video-form-actions">
          <button class="secondary-action" type="reset">Clear</button>
          <button class="primary-action" type="submit" ${state.uploading ? "disabled" : ""}>${state.uploading ? "Uploading..." : "Upload Videos"}</button>
        </div>
      </form>
    </section>
  `;
}

function filteredVideos() {
  const term = state.search.trim().toLowerCase();
  return state.videos.filter((video) => {
    const matchesPhase = state.phase === "all" || video.video_phase === state.phase;
    const text = [
      video.title,
      video.label,
      video.property_name,
      video.unit_name,
      video.contractor_name,
      video.notes,
      ...(Array.isArray(video.tags) ? video.tags : [])
    ].join(" ").toLowerCase();
    return matchesPhase && (!term || text.includes(term));
  });
}

function renderToolbar() {
  return `
    <div class="qa-video-toolbar">
      <label class="qa-video-search">
        <span class="sr-only">Search QA videos</span>
        <input id="qaVideoSearch" type="search" placeholder="Search labels, properties, units, tags..." value="${escapeHtml(state.search)}" />
      </label>
      <div class="qa-video-filter-tabs">
        ${PHASES.map(([phase, label]) => `<button type="button" class="${state.phase === phase ? "active" : ""}" data-qa-video-phase="${phase}">${escapeHtml(label)}</button>`).join("")}
      </div>
    </div>
  `;
}

function videoCard(video) {
  const tags = Array.isArray(video.tags) ? video.tags : [];
  const url = video.signedUrl || "";

  return `
    <article class="qa-video-card" data-qa-video-id="${escapeHtml(video.id)}">
      <div>
        ${url
          ? `<video controls preload="metadata" src="${escapeHtml(url)}"></video>`
          : `<div class="qa-video-empty"><strong>Preview unavailable</strong><p>Unable to create a signed URL.</p></div>`}
      </div>
      <div class="qa-video-card-body">
        <div class="qa-video-card-title">
          <div>
            <h3>${escapeHtml(video.label || video.title || video.file_name || "QA Video")}</h3>
            <p>${escapeHtml([video.property_name, video.unit_name ? `Unit ${video.unit_name}` : ""].filter(Boolean).join(" / ") || "No property label")}</p>
          </div>
          <span class="qa-video-phase ${escapeHtml(video.video_phase || "other")}">${escapeHtml(labelForPhase(video.video_phase))}</span>
        </div>
        <div class="qa-video-meta">
          <span>${escapeHtml(formatDate(video.created_at))}</span>
          <span>${escapeHtml(bytes(video.file_size))}</span>
          ${video.contractor_name ? `<span>${escapeHtml(video.contractor_name)}</span>` : ""}
          ${video.file_name ? `<span>${escapeHtml(video.file_name)}</span>` : ""}
        </div>
        ${video.notes ? `<p class="qa-video-notes">${escapeHtml(video.notes)}</p>` : ""}
        ${tags.length ? `<div class="qa-video-tags">${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
        <div class="qa-video-actions">
          ${url ? `<a class="secondary-action" href="${escapeHtml(url)}" target="_blank" rel="noopener">Open</a>` : ""}
          <button class="secondary-action danger-btn" type="button" data-qa-video-delete="${escapeHtml(video.id)}">Delete</button>
        </div>
      </div>
    </article>
  `;
}

function renderLibrary() {
  const rows = filteredVideos();
  return `
    <section class="suite-panel qa-video-library">
      <div class="qa-video-panel-head">
        <div>
          <h2>Stored Videos</h2>
          <p>${state.loading ? "Loading Supabase videos..." : `${rows.length.toLocaleString()} video${rows.length === 1 ? "" : "s"} showing`}</p>
        </div>
        <button class="secondary-action" type="button" data-qa-video-refresh>Refresh</button>
      </div>
      ${renderToolbar()}
      <div id="qaVideoList" class="qa-video-list">
        ${state.loading
          ? `<div class="qa-video-empty"><strong>Loading videos...</strong><p>Checking Supabase storage records.</p></div>`
          : rows.length
            ? rows.map(videoCard).join("")
            : `<div class="qa-video-empty"><strong>No videos found</strong><p>Upload a before or after video to start the QA library.</p></div>`}
      </div>
    </section>
  `;
}

function renderStatus() {
  return state.message ? `<div class="qa-video-status ${state.tone}">${escapeHtml(state.message)}</div>` : "";
}

function render() {
  setHeading();
  const content = document.querySelector("#adminSuiteApp .suite-content");
  if (!content) return;
  content.innerHTML = `
    <div class="qa-video-page" data-qa-video-page>
      ${qualityTabs()}
      ${renderMetrics()}
      ${renderStatus()}
      <div class="qa-video-layout">
        ${renderUploadPanel()}
        ${renderLibrary()}
      </div>
    </div>
  `;
}

function setMessage(message, tone = "") {
  state.message = message;
  state.tone = tone;
  render();
}

async function loadUser() {
  if (!supabase) return;
  const { data } = await supabase.auth.getUser();
  state.user = data?.user || null;
}

async function loadProperties() {
  if (!supabase) return;
  let result = await supabase
    .from("clients")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(500);

  if (result.error && String(result.error.message || "").includes("updated_at")) {
    result = await supabase
      .from("clients")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
  }

  if (result.error && String(result.error.message || "").includes("created_at")) {
    result = await supabase
      .from("clients")
      .select("*")
      .limit(500);
  }

  if (!result.error) {
    state.properties = (result.data || []).sort((a, b) => propertyTitle(a).localeCompare(propertyTitle(b)));
  }
}

async function signedUrl(path) {
  if (!path) return "";
  const result = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS);
  return result.data?.signedUrl || "";
}

async function attachSignedUrls(rows) {
  return Promise.all((rows || []).map(async (row) => ({
    ...row,
    signedUrl: await signedUrl(row.storage_path)
  })));
}

async function loadVideos(showLoading = true) {
  if (!supabase) {
    state.loading = false;
    setMessage("Supabase is not configured on this page.", "error");
    return;
  }

  if (showLoading) {
    state.loading = true;
    render();
  }

  const result = await supabase
    .from(TABLE)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  state.loading = false;

  if (result.error) {
    state.videos = [];
    setMessage(`Unable to load QA videos: ${result.error.message}. Run the QA video migration if this is the first setup.`, "error");
    return;
  }

  state.videos = await attachSignedUrls(result.data || []);
  render();
}

function field(form, name) {
  return (form.elements[name]?.value || "").trim();
}

function selectedProperty(form) {
  const id = field(form, "property_id");
  return state.properties.find((property) => property.id === id) || null;
}

function uploadSnapshot(form) {
  const property = selectedProperty(form);
  return {
    label: field(form, "label"),
    property,
    propertyId: property?.id || null,
    propertyName: property ? propertyTitle(property) : "",
    unitName: field(form, "unit_name"),
    contractorName: field(form, "contractor_name"),
    recordedAt: field(form, "recorded_at"),
    notes: field(form, "notes"),
    tags: tagsFromText(field(form, "tags")),
    files: getUploadFiles(form)
  };
}

function getUploadFiles(form) {
  const rows = [];
  const beforeFile = form.elements.before_file?.files?.[0];
  const afterFile = form.elements.after_file?.files?.[0];
  const otherFile = form.elements.other_file?.files?.[0];
  if (beforeFile) rows.push(["before", beforeFile]);
  if (afterFile) rows.push(["after", afterFile]);
  if (otherFile) rows.push([field(form, "other_phase") || "other", otherFile]);
  return rows;
}

function fileDuration(file) {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(video.duration) ? video.duration : null);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    video.src = url;
  });
}

async function uploadOneVideo(upload, phase, file, pairId, index, total) {
  const user = state.user;
  const label = upload.label;
  const title = `${label} - ${labelForPhase(phase)}`;
  const datePath = new Date().toISOString().slice(0, 10);
  const path = `${user.id}/${datePath}/${pairId}-${phase}-${safeFileName(file.name)}`;
  const duration = await fileDuration(file);

  state.progress = Math.round((index / Math.max(total, 1)) * 100);
  state.message = `Uploading ${labelForPhase(phase).toLowerCase()} video...`;
  state.tone = "";
  render();

  const uploadResult = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      contentType: file.type || "video/mp4",
      upsert: false
    });

  if (uploadResult.error) throw uploadResult.error;

  const insertResult = await supabase.from(TABLE).insert({
    pair_id: pairId,
    title,
    label,
    video_phase: phase,
    property_id: upload.propertyId,
    property_name: upload.propertyName,
    unit_name: upload.unitName,
    contractor_name: upload.contractorName,
    recorded_at: upload.recordedAt ? new Date(upload.recordedAt).toISOString() : null,
    notes: upload.notes,
    tags: upload.tags,
    storage_bucket: BUCKET,
    storage_path: path,
    file_name: file.name || "",
    mime_type: file.type || "",
    file_size: file.size || 0,
    duration_seconds: duration,
    uploaded_by: user.id,
    uploaded_by_name: user.email || "",
    source: "admin_upload",
    metadata: {
      original_file_name: file.name || "",
      upload_user_agent: navigator.userAgent || ""
    }
  }).select("*").single();

  if (insertResult.error) throw insertResult.error;
}

async function uploadVideos(event) {
  event.preventDefault();
  if (!supabase) {
    setMessage("Supabase is not configured on this page.", "error");
    return;
  }
  if (!state.user) await loadUser();
  if (!state.user) {
    setMessage("Sign in before uploading QA videos.", "error");
    return;
  }

  const form = event.currentTarget;
  const upload = uploadSnapshot(form);
  const files = upload.files;
  if (!files.length) {
    setMessage("Choose at least one before, after, or issue video to upload.", "error");
    return;
  }

  state.uploading = true;
  state.progress = 5;
  state.message = "Preparing upload...";
  state.tone = "";
  render();

  const pairId = uid();
  try {
    for (let index = 0; index < files.length; index += 1) {
      const [phase, file] = files[index];
      await uploadOneVideo(upload, phase, file, pairId, index + 1, files.length + 1);
    }
    state.progress = 100;
    state.uploading = false;
    await loadVideos(false);
    setMessage(`${files.length} QA video${files.length === 1 ? "" : "s"} uploaded and labeled.`, "success");
    document.getElementById("qaVideoUploadForm")?.reset();
  } catch (error) {
    state.uploading = false;
    console.warn("[qa-video-library] upload failed", error);
    setMessage(`Unable to upload QA video: ${error?.message || "Unknown error"}`, "error");
  }
}

async function deleteVideo(id) {
  const video = state.videos.find((row) => row.id === id);
  if (!video) return;
  if (!window.confirm(`Delete ${video.label || video.file_name || "this video"}?`)) return;

  setMessage("Deleting QA video...");
  if (video.storage_path) {
    await supabase.storage.from(BUCKET).remove([video.storage_path]);
  }
  const result = await supabase.from(TABLE).delete().eq("id", id);
  if (result.error) {
    setMessage(`Unable to delete QA video: ${result.error.message}`, "error");
    return;
  }

  state.videos = state.videos.filter((row) => row.id !== id);
  setMessage("QA video deleted.", "success");
  render();
}

function bindEvents() {
  document.addEventListener("submit", (event) => {
    if (event.target?.id === "qaVideoUploadForm") void uploadVideos(event);
  });

  document.addEventListener("input", (event) => {
    if (event.target?.id !== "qaVideoSearch") return;
    state.search = event.target.value || "";
    render();
  });

  document.addEventListener("click", (event) => {
    const phaseButton = event.target.closest("[data-qa-video-phase]");
    if (phaseButton) {
      state.phase = phaseButton.dataset.qaVideoPhase || "all";
      render();
      return;
    }

    const refresh = event.target.closest("[data-qa-video-refresh]");
    if (refresh) {
      void loadVideos();
      return;
    }

    const deleteButton = event.target.closest("[data-qa-video-delete]");
    if (deleteButton) {
      void deleteVideo(deleteButton.dataset.qaVideoDelete);
    }
  });
}

waitForShell().then(async () => {
  bindEvents();
  setHeading();
  render();
  await loadUser();
  await loadProperties();
  await loadVideos();
});
