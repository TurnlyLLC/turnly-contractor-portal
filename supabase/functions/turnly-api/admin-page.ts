// Turnly onboarding admin page, served at /onboarding/admin.
// Plain HTML + JS (no build step). Signs in with a Turnly admin account via
// Supabase password auth, then calls /onboarding/admin/* with that session.

export const ADMIN_PAGE = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>Turnly Onboarding Admin</title>
<style>
  :root {
    --navy: #16233B; --navy-deep: #0E182A; --canvas: #F5F5F2; --surface: #FFFFFF;
    --gold: #C9A24B; --gold-text: #8A6A20; --gold-soft: rgba(201,162,75,0.14);
    --ink: #16233B; --muted: #5B6474; --hairline: rgba(22,35,59,0.12);
    --danger: #A8402F; --success: #3D7355;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--canvas); color: var(--ink); font: 15px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  header { background: var(--navy); color: #fff; padding: 22px 28px 0; }
  .brand { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
  .brand h1 { font: 700 28px/1 "Iowan Old Style", "Palatino Linotype", Georgia, serif; margin: 0; }
  .brand span { font-size: 12px; letter-spacing: 4px; color: rgba(255,255,255,0.66); font-weight: 500; }
  .who { margin-left: auto; font-size: 13px; color: rgba(255,255,255,0.66); }
  .who button { margin-left: 10px; }
  nav { display: flex; gap: 6px; margin-top: 18px; }
  nav button { background: none; border: 0; color: rgba(255,255,255,0.66); padding: 10px 14px 12px; font: 600 12px/1 inherit; letter-spacing: 1.4px; text-transform: uppercase; cursor: pointer; border-bottom: 3px solid transparent; }
  nav button.on { color: #fff; border-bottom-color: var(--gold); }
  main { max-width: 1040px; margin: 0 auto; padding: 24px 20px 80px; }
  .label { font-size: 11px; font-weight: 600; letter-spacing: 1.4px; text-transform: uppercase; color: var(--muted); }
  .card { background: var(--surface); border: 1px solid var(--hairline); border-radius: 12px; }
  .row { display: flex; align-items: center; gap: 14px; padding: 14px 16px; border-top: 1px solid var(--hairline); }
  .row:first-child { border-top: 0; }
  .grow { flex: 1; min-width: 0; }
  .title { font: 700 17px/1.25 "Iowan Old Style", "Palatino Linotype", Georgia, serif; }
  .sub { color: var(--muted); font-size: 13px; }
  .tag { display: inline-block; border: 1.2px solid var(--gold); color: var(--gold-text); border-radius: 999px; padding: 2px 9px; font-size: 11px; font-weight: 600; letter-spacing: .4px; white-space: nowrap; }
  .tag.fill { background: var(--gold-soft); }
  .tag.ok { border-color: var(--success); color: var(--success); }
  .tag.bad { border-color: var(--danger); color: var(--danger); }
  .tag.muted { border-color: var(--hairline); color: var(--muted); }
  button, .btn { font: 600 13px/1 inherit; border-radius: 10px; padding: 10px 14px; cursor: pointer; border: 1px solid var(--hairline); background: var(--surface); color: var(--ink); text-decoration: none; display: inline-flex; align-items: center; gap: 6px; }
  button.primary { background: var(--gold); border-color: var(--gold); color: var(--navy); }
  button.danger { color: var(--danger); }
  button.ghost { background: none; border-color: rgba(255,255,255,0.22); color: #fff; }
  button:disabled { opacity: .5; cursor: default; }
  input, textarea, select { width: 100%; font: inherit; color: var(--ink); background: #fff; border: 1px solid var(--hairline); border-radius: 10px; padding: 10px 12px; }
  textarea { min-height: 90px; resize: vertical; }
  .field { display: grid; gap: 6px; margin-bottom: 14px; }
  .check { display: flex; gap: 8px; align-items: center; font-size: 14px; margin-bottom: 10px; }
  .check input { width: 18px; height: 18px; accent-color: var(--gold); }
  .toolbar { display: flex; align-items: center; gap: 10px; margin: 0 0 14px; flex-wrap: wrap; }
  .toolbar h2 { font: 700 24px/1.1 "Iowan Old Style", "Palatino Linotype", Georgia, serif; margin: 0 auto 0 0; }
  .actions { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
  .empty { padding: 36px 20px; text-align: center; color: var(--muted); }
  .signin { max-width: 380px; margin: 60px auto; padding: 26px; }
  .msg { padding: 10px 12px; border-radius: 10px; margin-bottom: 14px; font-size: 14px; }
  .msg.err { background: rgba(168,64,47,0.08); color: var(--danger); }
  .msg.ok { background: rgba(61,115,85,0.1); color: var(--success); }
  dialog { border: 0; border-radius: 14px; padding: 0; width: min(560px, 94vw); box-shadow: 0 20px 60px rgba(14,24,42,.35); }
  dialog::backdrop { background: rgba(14,24,42,.45); }
  dialog .head { background: var(--navy); color: #fff; padding: 16px 20px; font: 700 20px/1.2 "Iowan Old Style", Georgia, serif; }
  dialog form { padding: 20px; }
  .kv { display: grid; grid-template-columns: 140px 1fr; gap: 4px 12px; font-size: 13px; margin-top: 8px; }
  .kv div:nth-child(odd) { color: var(--muted); }
  .progress { height: 6px; background: var(--hairline); border-radius: 99px; overflow: hidden; width: 120px; }
  .progress i { display: block; height: 100%; background: var(--gold); }
  .back { background: none; border: 0; color: var(--gold-text); padding: 0; margin-bottom: 12px; }
  .hint { font-size: 12px; color: var(--muted); margin-top: -8px; margin-bottom: 12px; }
  @media (max-width: 640px) { .row { flex-wrap: wrap; } .actions { justify-content: flex-start; } .kv { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<header>
  <div class="brand"><h1>Turnly</h1><span>ONBOARDING ADMIN</span><div class="who" id="who"></div></div>
  <nav id="nav" hidden>
    <button data-tab="checklist" class="on">Checklist</button>
    <button data-tab="contractors">Contractors</button>
  </nav>
</header>
<main id="app"></main>

<dialog id="itemDialog"><div class="head" id="itemDialogTitle">Checklist item</div><form id="itemForm" method="dialog"></form></dialog>
<dialog id="docDialog"><div class="head">Upload document to sign</div><form id="docForm" method="dialog"></form></dialog>
<dialog id="noteDialog"><div class="head" id="noteTitle">Note</div><form id="noteForm" method="dialog"></form></dialog>

<script>
(function () {
  var SUPABASE_URL = "https://nwnzdoveskthebfyndcs.supabase.co";
  var SUPABASE_KEY = "sb_publishable_0fESHyuQyVSySksGWO-HDA_FX4_r5fP";
  var API = location.origin + "/onboarding";
  var KIND = { form: "In-app form", sign: "Sign document", upload: "Upload file", video: "Watch video", background: "Background check (Verified First)" };
  var STATE = {
    todo: ["Not started", "muted"], done: ["Complete", "ok"], in_review: ["Needs review", "fill"],
    rejected: ["Sent back", "bad"], expired: ["Expired", "bad"], resign: ["Re-sign needed", "bad"]
  };
  var app = document.getElementById("app");
  var session = null;
  var tab = "checklist";
  var items = [];
  var flash = null;

  function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function fmtDate(iso) { if (!iso) return "-"; var d = new Date(iso); return isNaN(d) ? iso : d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }); }
  function tag(state) { var s = STATE[state] || [state, "muted"]; return '<span class="tag ' + s[1] + '">' + esc(s[0]) + "</span>"; }
  function setFlash(text, ok) { flash = { text: text, ok: !!ok }; }
  function flashHtml() { if (!flash) return ""; var h = '<div class="msg ' + (flash.ok ? "ok" : "err") + '">' + esc(flash.text) + "</div>"; flash = null; return h; }

  // ---------- Session ----------
  function saveSession(s) { session = s; if (s) sessionStorage.setItem("turnly-admin", JSON.stringify(s)); else sessionStorage.removeItem("turnly-admin"); }
  function loadSession() { try { session = JSON.parse(sessionStorage.getItem("turnly-admin") || "null"); } catch (e) { session = null; } }
  function authRequest(grant, body) {
    return fetch(SUPABASE_URL + "/auth/v1/token?grant_type=" + grant, {
      method: "POST", headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" }, body: JSON.stringify(body)
    }).then(function (r) { return r.json().then(function (j) {
      if (!r.ok) throw new Error(j.error_description || j.msg || "Sign-in failed.");
      return { access: j.access_token, refresh: j.refresh_token, expires: Date.now() + (j.expires_in || 3600) * 1000, email: j.user && j.user.email };
    }); });
  }
  function token() {
    if (!session) return Promise.reject(new Error("Signed out"));
    if (session.expires - Date.now() > 60000) return Promise.resolve(session.access);
    return authRequest("refresh_token", { refresh_token: session.refresh }).then(function (s) { saveSession(s); return s.access; });
  }
  function api(path, opts) {
    opts = opts || {};
    return token().then(function (t) {
      var headers = Object.assign({ Authorization: "Bearer " + t }, opts.headers || {});
      var body = opts.body;
      if (body && !(body instanceof Blob) && typeof body !== "string") { body = JSON.stringify(body); headers["Content-Type"] = "application/json"; }
      return fetch(API + path, { method: opts.method || (body ? "POST" : "GET"), headers: headers, body: body });
    }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) {
      if (r.status === 401 || r.status === 403) { if (r.status === 401) saveSession(null); throw new Error(j.error || "This account isn't a Turnly admin."); }
      if (!r.ok || j.ok === false) throw new Error(j.error || "Request failed.");
      return j;
    }); });
  }
  function supa(path) {
    return token().then(function (t) {
      return fetch(SUPABASE_URL + "/rest/v1/" + path, { headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + t } });
    }).then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; });
  }
  function openLink(path) {
    var w = window.open("", "_blank");
    api(path).then(function (j) { if (w) w.location = j.url; else location.href = j.url; })
      .catch(function (e) { if (w) w.close(); alert(e.message); });
  }

  // ---------- Sign in ----------
  function renderSignIn(error) {
    document.getElementById("nav").hidden = true;
    document.getElementById("who").innerHTML = "";
    app.innerHTML = '<div class="card signin"><div class="label">Turnly admin</div><h2 class="title" style="font-size:24px;margin:6px 0 18px">Sign in</h2>' +
      (error ? '<div class="msg err">' + esc(error) + "</div>" : "") +
      '<form id="signin"><div class="field"><label class="label" for="em">Email</label><input id="em" type="email" autocomplete="username" required></div>' +
      '<div class="field"><label class="label" for="pw">Password</label><input id="pw" type="password" autocomplete="current-password" required></div>' +
      '<button class="primary" style="width:100%;justify-content:center;padding:14px">Sign in</button></form>' +
      '<p class="sub" style="margin-top:14px">Use your Turnly portal admin account. Contractor accounts can\'t open this page.</p></div>';
    document.getElementById("signin").onsubmit = function (ev) {
      ev.preventDefault();
      var btn = ev.target.querySelector("button"); btn.disabled = true;
      authRequest("password", { email: document.getElementById("em").value.trim(), password: document.getElementById("pw").value })
        .then(function (s) { saveSession(s); return start(); })
        .catch(function (e) { renderSignIn(e.message); });
    };
  }

  function start() {
    return api("/admin/items").then(function (j) {
      items = j.items;
      document.getElementById("nav").hidden = false;
      document.getElementById("who").innerHTML = esc(session.email || "") + ' <button class="ghost" id="out">Sign out</button>';
      document.getElementById("out").onclick = function () { saveSession(null); renderSignIn(); };
      render();
      // Keep the app's public Job Board (browse without an account) in step with the portal.
      token().then(function (t) { return fetch(location.origin + "/jobs/sync", { method: "POST", headers: { Authorization: "Bearer " + t } }); }).catch(function () {});
    }).catch(function (e) { saveSession(null); renderSignIn(e.message); });
  }

  document.getElementById("nav").onclick = function (ev) {
    var b = ev.target.closest("button"); if (!b) return;
    tab = b.dataset.tab;
    Array.prototype.forEach.call(this.children, function (c) { c.classList.toggle("on", c === b); });
    render();
  };

  function render() { if (tab === "checklist") renderChecklist(); else renderContractors(); }

  // ---------- Checklist ----------
  function reloadItems() { return api("/admin/items").then(function (j) { items = j.items; renderChecklist(); }); }

  function renderChecklist() {
    var html = flashHtml() + '<div class="toolbar"><h2>Onboarding checklist</h2><button class="primary" id="add">+ Add item</button></div>' +
      '<p class="sub" style="margin:-6px 0 16px">Contractors must finish every <b>required</b>, <b>active</b> item before they can claim jobs. Changes show in the app right away.</p>';
    if (items.length === 0) html += '<div class="card empty">No checklist items yet. Add a form, a document to sign, an upload, or a video to start.</div>';
    else {
      html += '<div class="card">' + items.map(function (it, i) {
        var meta = [KIND[it.kind]];
        if (it.kind === "sign") meta.push(it.hasDocument ? "v" + it.version + " · " + esc(it.documentName || "document.pdf") + (it.pageCount ? " · " + it.pageCount + " pages" : "") : "No PDF yet (signs the instructions text)");
        if ((it.kind === "form" || it.kind === "sign") && it.questionCount) meta.push(it.questionCount + (it.questionCount === 1 ? " question" : " questions"));
        if (it.kind !== "sign" && it.hasDocument) meta.push("reference PDF: " + esc(it.documentName || "document.pdf"));
        if (it.kind === "upload" && it.requiresExpiration) meta.push("asks for expiration date");
        if (it.kind === "video") meta.push(esc(it.videoUrl || ""));
        if (it.kind === "background") meta.push("Verified First: send the invitation yourself, then mark it on file per contractor after you review the report");
        if (it.requiresReview) meta.push("you approve each one");
        return '<div class="row"><div class="grow"><div class="title">' + esc(it.title) + "</div><div class=\"sub\">" + meta.join(" · ") + "</div>" +
          '<div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">' + (it.required ? '<span class="tag fill">Required</span>' : '<span class="tag muted">Optional</span>') +
          (it.active ? "" : ' <span class="tag bad">Hidden</span>') + "</div></div>" +
          '<div class="actions">' +
          (i > 0 ? '<button data-up="' + it.id + '" title="Move up">↑</button>' : "") +
          (i < items.length - 1 ? '<button data-down="' + it.id + '" title="Move down">↓</button>' : "") +
          '<button data-doc="' + it.id + '">' + (it.hasDocument ? "Replace PDF" : it.kind === "sign" ? "Upload PDF" : "Attach PDF") + "</button>" +
          (it.hasDocument ? '<button data-view="' + it.id + '">View</button>' : "") +
          (it.hasDocument && it.kind !== "sign" ? '<button data-unattach="' + it.id + '" title="Remove reference PDF">Remove PDF</button>' : "") +
          '<button data-edit="' + it.id + '">Edit</button><button class="danger" data-del="' + it.id + '">Delete</button></div></div>';
      }).join("") + "</div>";
    }
    app.innerHTML = html;
    document.getElementById("add").onclick = function () { editItem(null); };
    app.querySelectorAll("[data-edit]").forEach(function (b) { b.onclick = function () { editItem(find(b.dataset.edit)); }; });
    app.querySelectorAll("[data-doc]").forEach(function (b) { b.onclick = function () { uploadDoc(find(b.dataset.doc)); }; });
    app.querySelectorAll("[data-view]").forEach(function (b) { b.onclick = function () { openLink("/admin/items/" + b.dataset.view + "/document-link"); }; });
    app.querySelectorAll("[data-unattach]").forEach(function (b) { b.onclick = function () {
      if (!confirm("Remove the reference PDF from this item?")) return;
      api("/admin/items/" + b.dataset.unattach + "/document-remove", { body: {} }).then(function () { setFlash("PDF removed.", true); return reloadItems(); }).catch(function (e) { alert(e.message); });
    }; });
    app.querySelectorAll("[data-del]").forEach(function (b) { b.onclick = function () {
      var it = find(b.dataset.del);
      if (!confirm('Delete "' + it.title + '"? Contractors will no longer see it. Files they already signed or uploaded stay in their records.')) return;
      api("/admin/items/" + it.id + "/delete", { body: {} }).then(function () { setFlash("Deleted.", true); return reloadItems(); }).catch(function (e) { alert(e.message); });
    }; });
    function move(id, delta) {
      var ids = items.map(function (x) { return x.id; }); var i = ids.indexOf(id); var j = i + delta;
      ids.splice(j, 0, ids.splice(i, 1)[0]);
      api("/admin/items/reorder", { body: { ids: ids } }).then(reloadItems).catch(function (e) { alert(e.message); });
    }
    app.querySelectorAll("[data-up]").forEach(function (b) { b.onclick = function () { move(b.dataset.up, -1); }; });
    app.querySelectorAll("[data-down]").forEach(function (b) { b.onclick = function () { move(b.dataset.down, 1); }; });
  }
  function find(id) { return items.filter(function (x) { return x.id === id; })[0]; }

  function editItem(it) {
    var dlg = document.getElementById("itemDialog"), form = document.getElementById("itemForm");
    document.getElementById("itemDialogTitle").textContent = it ? "Edit item" : "Add checklist item";
    var kind = it ? it.kind : "form";
    form.innerHTML =
      '<div class="field"><label class="label">Type</label><select id="f-kind"' + (it ? " disabled" : "") + '>' +
      (it && it.kind === "background" ? ['background'] : ['form', 'sign', 'upload', 'video']).map(function (k) { return '<option value="' + k + '"' + (k === kind ? " selected" : "") + ">" + KIND[k] + "</option>"; }).join("") + "</select></div>" +
      '<div class="field"><label class="label">Title</label><input id="f-title" maxlength="120" required value="' + esc(it ? it.title : "") + '" placeholder="e.g. Contractor Agreement"></div>' +
      '<div class="field"><label class="label">Instructions shown to the contractor</label><textarea id="f-desc" maxlength="4000" placeholder="What this is and what to do">' + esc(it ? it.description || "" : "") + "</textarea></div>" +
      '<div id="f-sign"><div class="field"><label class="label" id="f-fields-label">Questions</label><textarea id="f-fields" spellcheck="false" style="min-height:220px;font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace" placeholder="## Contractor Information&#10;Full legal name * [text, prefill=name]&#10;Phone number * [phone]&#10;Account type * [choice: Checking | Savings]&#10;Routing number * [routing, sensitive, confirm] -- From the bottom of a check">' + esc(it ? it.fieldsText || "" : "") + "</textarea></div>" +
      '<details class="hint" style="margin-top:-6px"><summary style="cursor:pointer">How to write questions</summary><div style="margin-top:6px;line-height:1.6">' +
      'One question per line. <b>## Title</b> starts a new section (one screen in the app). Add <b>*</b> after the label to make it required.<br>' +
      'Types in brackets: <b>text</b>, <b>long</b>, <b>number</b>, <b>date</b>, <b>phone</b>, <b>email</b>, <b>yesno</b>, <b>check</b> (a statement they tick to agree), <b>choice: A | B</b> (pick one), <b>multi: A | B | C</b> (pick any), <b>routing</b> (checks the 9-digit bank routing number), <b>account</b> (bank account number), <b>tin</b> (9-digit SSN/EIN, W-9 only).<br>' +
      'Extras: <b>sensitive</b> hides the answer on the PDF and in the app (only you can see it here), <b>confirm</b> makes them type it twice, <b>prefill=name</b> starts the answer from their profile (they can still change it). Add <b>-- help text</b> at the end to show a hint.<br>' +
      'Ask once, reuse everywhere: <b>save=phone</b> stores the answer in the contractor\'s profile (used in Contractor Information); <b>profile=phone</b> on another form fills it from there and skips the question. Keys in use: name, address, city, state, zip, city_state_zip (built automatically), phone, email, business_name.<br>' +
      '<b>when=3a:LLC</b> only shows a question when another question (its W-9 line or id) has that answer. <b>w9=1</b> etc. links an answer to a line of the IRS W-9 PDF attached to the item, which is then filled in and signed automatically.<br>' +
      'Only collect Social Security or tax ID numbers on the W-9 item.</div></details></div>' +
      '<div id="f-video"><div class="field"><label class="label">Video link (https://)</label><input id="f-url" value="' + esc(it ? it.videoUrl || "" : "") + '" placeholder="https://youtu.be/..."></div><div class="hint">YouTube, Vimeo, or any https link. The contractor opens it and taps "I watched this".</div></div>' +
      '<div id="f-checkr"><div class="hint" style="line-height:1.6">There is exactly one background check step and it is always required and visible. Turnly sends each applicant a Verified First invitation by email; the applicant gives consent and pays on Verified First. ' +
      'After you review the report, open the contractor below and use <b>Mark on file</b>. Nothing the applicant does in the app completes this step. If you decide not to approve someone because of their report, follow the adverse action process.</div></div>' +
      '<div id="f-exp"><label class="check"><input type="checkbox" id="f-requiresExp"' + (it && it.requiresExpiration ? " checked" : "") + '> Ask for an expiration date (insurance, licenses)</label></div>' +
      '<div id="f-rev"><label class="check"><input type="checkbox" id="f-review"' + (it && it.requiresReview ? " checked" : "") + '> I approve each submission before it counts</label></div>' +
      '<label class="check"><input type="checkbox" id="f-required"' + (!it || it.required ? " checked" : "") + '> Required to claim jobs</label>' +
      '<label class="check"><input type="checkbox" id="f-active"' + (!it || it.active ? " checked" : "") + '> Visible in the app</label>' +
      '<div class="msg err" id="f-err" hidden></div>' +
      '<div class="actions" style="margin-top:16px"><button value="cancel" formnovalidate>Cancel</button><button class="primary" id="f-save" value="save">Save</button></div>';
    function sync() {
      var k = form.querySelector("#f-kind").value;
      form.querySelector("#f-sign").hidden = k !== "sign" && k !== "form";
      form.querySelector("#f-fields-label").textContent = k === "form" ? "Questions asked in the app" : "Information to collect when signing (optional)";
      form.querySelector("#f-video").hidden = k !== "video";
      form.querySelector("#f-checkr").hidden = k !== "background";
      form.querySelector("#f-exp").hidden = k !== "upload";
      form.querySelector("#f-rev").hidden = k === "video" || k === "background";
      form.querySelector("#f-required").disabled = k === "background";
      form.querySelector("#f-active").disabled = k === "background";
    }
    form.querySelector("#f-kind").onchange = sync; sync();
    form.querySelector("#f-save").onclick = function (ev) {
      ev.preventDefault();
      var k = form.querySelector("#f-kind").value;
      var body = {
        kind: k, title: form.querySelector("#f-title").value, description: form.querySelector("#f-desc").value,
        fieldsText: form.querySelector("#f-fields").value,
        videoUrl: k === "background" ? "" : form.querySelector("#f-url").value.trim(),
        requiresExpiration: form.querySelector("#f-requiresExp").checked, requiresReview: form.querySelector("#f-review").checked,
        required: form.querySelector("#f-required").checked, active: form.querySelector("#f-active").checked
      };
      ev.target.disabled = true;
      api(it ? "/admin/items/" + it.id : "/admin/items", { body: body }).then(function (j) {
        dlg.close(); setFlash(it ? "Saved." : "Added. " + (k === "sign" ? "Now upload the PDF contractors will sign." : ""), true);
        return reloadItems().then(function () { if (!it && k === "sign") uploadDoc(j.item); });
      }).catch(function (e) { ev.target.disabled = false; var m = form.querySelector("#f-err"); m.hidden = false; m.textContent = e.message; });
    };
    dlg.showModal();
  }

  function uploadDoc(it) {
    var dlg = document.getElementById("docDialog"), form = document.getElementById("docForm");
    var signs = it.kind === "sign";
    form.innerHTML = '<p class="title" style="margin-top:0">' + esc(it.title) + "</p>" +
      '<div class="field"><label class="label">PDF file</label><input type="file" id="d-file" accept="application/pdf,.pdf" required></div>' +
      (signs && it.hasDocument ? '<label class="check"><input type="checkbox" id="d-resign"> Everyone must sign this new version (otherwise only new contractors sign it)</label>' : "") +
      '<p class="sub">' + (signs
        ? "Contractors read this PDF in the app, type their legal name, and sign. Their signed copy gets a signature certificate page and is saved to their file."
        : it.kind === "upload"
          ? "Contractors can open this PDF from the item (a blank form to fill out, or a guide) before uploading their file."
          : "Contractors can open this PDF from the item for reference. Their answers are saved as a separate signed PDF.") + "</p>" +
      '<div class="msg err" id="d-err" hidden></div>' +
      '<div class="actions"><button value="cancel" formnovalidate>Cancel</button><button class="primary" id="d-save">Upload</button></div>';
    form.querySelector("#d-save").onclick = function (ev) {
      ev.preventDefault();
      var file = form.querySelector("#d-file").files[0];
      var err = form.querySelector("#d-err");
      if (!file) { err.hidden = false; err.textContent = "Choose a PDF."; return; }
      var resign = form.querySelector("#d-resign");
      ev.target.disabled = true; ev.target.textContent = "Uploading…";
      api("/admin/items/" + it.id + "/document", {
        method: "POST", body: file,
        headers: { "Content-Type": "application/pdf", "X-File-Name": encodeURIComponent(file.name), "X-Require-Resign": resign && resign.checked ? "1" : "0" }
      }).then(function () { dlg.close(); setFlash("Document uploaded.", true); return reloadItems(); })
        .catch(function (e) { ev.target.disabled = false; ev.target.textContent = "Upload"; err.hidden = false; err.textContent = e.message; });
    };
    dlg.showModal();
  }

  // ---------- Contractors ----------
  function renderContractors() {
    app.innerHTML = '<div class="toolbar"><h2>Contractors</h2></div><div class="card empty">Loading…</div>';
    supa("profiles?select=*&role=eq.contractor&order=full_name.asc&limit=1000")
      .then(function (profiles) { return api("/admin/contractors", { body: { profiles: profiles } }); })
      .then(function (j) {
        var list = j.contractors;
        var html = flashHtml() + '<div class="toolbar"><h2>Contractors</h2><input id="q" placeholder="Search name or email" style="max-width:260px"><button id="sync" title="Copy any onboarding files missing from the portal\'s contractor documents">Sync to portal</button></div>';
        if (list.length === 0) html += '<div class="card empty">No contractors yet. They appear here once they open the app or exist in Turnly\'s contractor profiles.</div>';
        else html += '<div class="card" id="list">' + list.map(function (c) {
          var pct = c.requiredCount ? Math.round(100 * c.doneCount / c.requiredCount) : 100;
          return '<div class="row" data-q="' + esc(((c.name || "") + " " + (c.email || "")).toLowerCase()) + '"><div class="grow"><div class="title">' + esc(c.name || c.email || c.userId) + '</div><div class="sub">' + esc(c.email || "") + (c.lastSeen ? " · last in app " + fmtDate(c.lastSeen) : " · hasn't opened the app") + "</div></div>" +
            '<div style="text-align:right"><div class="sub">' + c.doneCount + " of " + c.requiredCount + ' required</div><div class="progress"><i style="width:' + pct + '%"></i></div></div>' +
            (c.deletionRequested ? "<span class=\"tag\" style=\"border-color:#A8402F;color:#A8402F\" title=\"Requested " + esc(fmtDate(c.deletionRequested)) + ". Delete the account in Supabase Auth and the portal, then email them.\">Deletion requested</span>" : "") +
            (c.grandfathered ? '<span class="tag" title="Approved before Verified First screening began. This is an exception, not a screening approval. Set progress, mark, or reset the background step to end it.">Grandfathered exception</span>' : "") +
            (/^(pending|applied|new)$/i.test(c.status || "") ? "<span class=\"tag muted\" title=\"Approve in the portal once onboarding is complete\">Pending approval</span>" : "") +
            (c.needsReview ? '<span class="tag fill">' + c.needsReview + " to review</span>" : c.complete ? '<span class="tag ok">Can claim jobs</span>' : '<span class="tag muted">In progress</span>') +
            '<button data-open="' + c.userId + '">Open file</button></div>';
        }).join("") + "</div>";
        app.innerHTML = html;
        var q = document.getElementById("q");
        if (q) q.oninput = function () { var v = q.value.trim().toLowerCase(); app.querySelectorAll("#list .row").forEach(function (r) { r.hidden = v && r.dataset.q.indexOf(v) < 0; }); };
        app.querySelectorAll("[data-open]").forEach(function (b) { b.onclick = function () { openContractor(b.dataset.open); }; });
        var sync = document.getElementById("sync");
        if (sync) sync.onclick = function () { syncPortal(sync, 0, 0); };
      }).catch(function (e) { app.innerHTML = '<div class="msg err">' + esc(e.message) + "</div>"; });
  }

  function syncPortal(btn, copied, failed) {
    btn.disabled = true; btn.textContent = "Syncing…";
    api("/admin/portal-sync", { body: {} }).then(function (r) {
      copied += r.copied; failed += r.failed;
      if (r.remaining > 0 && r.copied > 0) return syncPortal(btn, copied, failed);
      var reason = r.failures && r.failures[0] ? " First problem: " + r.failures[0].title + " (" + r.failures[0].reason + ")" : "";
      setFlash(copied + " file" + (copied === 1 ? "" : "s") + " copied to the portal." + (failed ? " " + failed + " couldn't be copied." + reason : " Everything is in sync."), !failed);
      renderContractors();
    }).catch(function (e) { btn.disabled = false; btn.textContent = "Sync to portal"; alert(e.message); });
  }

  function openContractor(userId) {
    app.innerHTML = '<div class="card empty">Loading…</div>';
    api("/admin/contractors/" + userId).then(function (j) { renderFile(j); }).catch(function (e) { app.innerHTML = '<div class="msg err">' + esc(e.message) + "</div>"; });
  }

  function renderFile(j) {
    var c = j.contractor;
    var html = flashHtml() + '<button class="back" id="back">← All contractors</button><div class="toolbar"><h2>' + esc(c.name || c.email || c.userId) + "</h2>" +
      (j.complete ? '<span class="tag ok">Can claim jobs</span>' : '<span class="tag muted">Can\'t claim jobs yet</span>') + "</div>" +
      '<p class="sub" style="margin:-6px 0 16px">' + esc(c.email || "") + "</p>" +
      contactHtml(j.contact) +
      '<div class="label" style="margin-bottom:8px">Checklist</div><div class="card">' + j.items.map(function (it) {
        var s = it.submission;
        var details = "";
        if (it.grandfathered) {
          details += '<div class="kv"><div>Exception</div><div>Grandfathered: approved before Verified First screening began (not a screening approval)</div>' +
            "<div>Recorded</div><div>" + fmtDate(it.grandfathered.grantedAt) + "</div><div>Basis</div><div>" + esc(it.grandfathered.basis) + "</div></div>";
        }
        if (s) {
          details += '<div class="kv">' +
            (s.signerName ? "<div>Signed as</div><div>" + esc(s.signerName) + "</div>" : "") +
            "<div>" + (s.source === "admin" ? "Marked by Turnly" : "Submitted") + "</div><div>" + fmtDate(s.createdAt) + (s.version && it.kind === "sign" ? " · v" + s.version : "") + "</div>" +
            (s.expirationDate ? "<div>Expires</div><div>" + esc(s.expirationDate) + "</div>" : "") +
            answersHtml(s.fields, s.id) +
            (s.ip ? "<div>IP / device</div><div>" + esc(s.ip) + " · " + esc(s.userAgent || "") + "</div>" : "") +
            (s.reviewerNote ? "<div>Note</div><div>" + esc(s.reviewerNote) + "</div>" : "") +
            (s.mirrorStatus && s.mirrorStatus !== "ok" ? "<div>Portal copy</div><div>Not copied to the portal's documents (" + esc(s.mirrorStatus) + ")</div>" : s.mirrorStatus === "ok" ? "<div>Portal copy</div><div>Also saved to the portal's contractor documents</div>" : "") +
            "</div>";
        }
        return '<div class="row" style="align-items:flex-start"><div class="grow"><div class="title">' + esc(it.title) + ' <span class="sub" style="font-family:inherit;font-weight:400">· ' + KIND[it.kind] + (it.required ? "" : " · optional") + "</span></div>" + details + "</div>" +
          '<div class="actions">' + tag(it.state) +
          (s && s.hasFile ? '<button data-file="' + s.id + '">View file</button>' : "") +
          (s && s.status === "pending" ? '<button class="primary" data-approve="' + s.id + '">Approve</button><button class="danger" data-reject="' + s.id + '">Send back</button>' : "") +
          (it.state !== "done" ? '<button data-mark="' + it.id + '">Mark on file</button>' : "") +
          (it.grandfathered ? '<button data-mark="' + it.id + '">Mark on file</button><button class="danger" data-reset="' + it.id + '">End exception</button>' : s && it.state === "done" ? '<button class="danger" data-reset="' + it.id + '">Ask to redo</button>' : "") +
          "</div></div>";
      }).join("") + "</div>";
    if (j.history.length) {
      html += '<div class="label" style="margin:22px 0 8px">History</div><div class="card">' + j.history.map(function (h) {
        return '<div class="row"><div class="grow"><div>' + esc(h.itemTitle) + '</div><div class="sub">' + fmtDate(h.createdAt) + " · " + esc(h.status) + (h.source === "admin" ? " by Turnly" : "") + (h.reviewerNote ? " · " + esc(h.reviewerNote) : "") + "</div></div>" +
          (h.hasFile ? '<button data-file="' + h.id + '">View</button>' : "") + "</div>";
      }).join("") + "</div>";
    }
    if (j.reveals && j.reveals.length) {
      html += '<div class="label" style="margin:22px 0 8px">Private answers viewed</div><div class="card">' + j.reveals.map(function (r) {
        return '<div class="row"><div class="grow"><div>' + esc(r.question) + '</div><div class="sub">' + esc(r.viewedBy) + " · " + fmtDate(r.viewedAt) + "</div></div></div>";
      }).join("") + "</div>";
    }
    app.innerHTML = html;
    app.querySelectorAll("[data-reveal]").forEach(function (el) { el.onclick = function () {
      if (el.dataset.shown) return;
      el.textContent = "Opening…";
      api("/admin/submissions/" + el.dataset.sub + "/reveal", { body: { questionId: el.dataset.reveal } }).then(function (r) {
        el.dataset.shown = "1"; el.textContent = r.value; el.style.cursor = "text"; el.style.color = "inherit";
        setTimeout(function () { if (el.isConnected) { el.textContent = el.dataset.masked + " · show"; delete el.dataset.shown; el.style.cursor = "pointer"; el.style.color = "var(--gold-text)"; } }, 30000);
      }).catch(function (e) { el.textContent = el.dataset.masked + " · show"; alert(e.message); });
    }; });
    app.querySelectorAll("[data-toggle]").forEach(function (b) { b.onclick = function () {
      var box = document.getElementById(b.dataset.toggle); box.hidden = !box.hidden; b.textContent = box.hidden ? b.dataset.show : "Hide answers";
    }; });
    document.getElementById("back").onclick = renderContractors;
    app.querySelectorAll("[data-file]").forEach(function (b) { b.onclick = function () { openLink("/admin/submissions/" + b.dataset.file + "/link"); }; });
    app.querySelectorAll("[data-approve]").forEach(function (b) { b.onclick = function () {
      api("/admin/submissions/" + b.dataset.approve + "/review", { body: { decision: "approved" } }).then(function (r) { setFlash("Approved.", true); renderFile(r); }).catch(function (e) { alert(e.message); });
    }; });
    app.querySelectorAll("[data-reject]").forEach(function (b) { b.onclick = function () {
      askNote("Send back", "Tell the contractor what to fix", true, function (note) {
        return api("/admin/submissions/" + b.dataset.reject + "/review", { body: { decision: "rejected", note: note } }).then(function (r) { setFlash("Sent back to the contractor.", true); renderFile(r); });
      });
    }; });
    app.querySelectorAll("[data-mark]").forEach(function (b) { b.onclick = function () {
      var it = j.items.filter(function (x) { return x.id === b.dataset.mark; })[0];
      askNote("Mark on file", "Note (optional), e.g. \"Signed on paper 3/1\"", false, function (note, exp) {
        return api("/admin/contractors/" + c.userId + "/items/" + it.id + "/mark", { body: { note: note, expirationDate: exp } }).then(function (r) { setFlash("Marked as on file.", true); renderFile(r); });
      }, it.requiresExpiration);
    }; });
    app.querySelectorAll("[data-reset]").forEach(function (b) { b.onclick = function () {
      askNote("Ask to redo", "Tell the contractor why", true, function (note) {
        return api("/admin/contractors/" + c.userId + "/items/" + b.dataset.reset + "/reset", { body: { note: note } }).then(function (r) { setFlash("The contractor will be asked to complete this again.", true); renderFile(r); });
      });
    }; });
  }

  var answerBox = 0;
  /** New submissions store an array of answers grouped by section; older ones a {label: value} map. */
  var CONTACT = [["name", "Legal name"], ["business_name", "Business name"], ["phone", "Phone"], ["email", "Email"], ["address", "Address"], ["city_state_zip", "City, state, ZIP"]];
  function contactHtml(contact) {
    if (!contact) return "";
    var rows = CONTACT.filter(function (k) { return contact[k[0]]; }).map(function (k) { return "<div>" + k[1] + "</div><div>" + esc(contact[k[0]]) + "</div>"; }).join("");
    if (!rows) return "";
    return '<div class="label" style="margin-bottom:8px">Contractor information</div><div class="card" style="padding:14px 16px;margin-bottom:22px"><div class="kv">' + rows + "</div></div>";
  }

  /** Private answers arrive masked; "show" fetches the real value (each view is logged). */
  function answersHtml(fields, submissionId) {
    if (!fields) return "";
    if (!Array.isArray(fields)) {
      return Object.keys(fields).map(function (k) { return "<div>" + esc(k) + "</div><div>" + esc(fields[k]) + "</div>"; }).join("");
    }
    if (!fields.length) return "";
    var id = "ans" + (answerBox++);
    var section = null, rows = "";
    fields.forEach(function (a) {
      if (a.section !== section) { section = a.section; rows += '<div style="grid-column:1/-1;margin-top:10px" class="label">' + esc(section || "Answers") + "</div>"; }
      var value = a.sensitive && (a.sealed || a.value)
        ? '<span data-reveal="' + esc(a.id) + '" data-sub="' + esc(submissionId) + '" data-masked="' + esc(a.masked || "****") + '" style="cursor:pointer;color:var(--gold-text)" title="Click to show (logged)">' + esc(a.masked || "****") + " · show</span>"
        : !a.value ? '<span class="sub">-</span>'
        : esc(a.value);
      rows += "<div>" + esc(a.label) + "</div><div>" + value + "</div>";
    });
    var label = "Show " + fields.length + " answers";
    return '<div style="grid-column:1/-1"><button type="button" data-toggle="' + id + '" data-show="' + label + '" style="margin-top:6px">' + label + "</button></div>" +
      '<div id="' + id + '" hidden class="kv" style="grid-column:1/-1;grid-template-columns:minmax(140px,40%) 1fr">' + rows + "</div>";
  }

  function askNote(title, placeholder, required, submit, withDate) {
    var dlg = document.getElementById("noteDialog"), form = document.getElementById("noteForm");
    document.getElementById("noteTitle").textContent = title;
    form.innerHTML = '<div class="field"><textarea id="n-text" placeholder="' + esc(placeholder) + '"></textarea></div>' +
      (withDate ? '<div class="field"><label class="label">Expiration date</label><input type="date" id="n-date"></div>' : "") +
      '<div class="msg err" id="n-err" hidden></div><div class="actions"><button value="cancel" formnovalidate>Cancel</button><button class="primary" id="n-save">' + esc(title) + "</button></div>";
    form.querySelector("#n-save").onclick = function (ev) {
      ev.preventDefault();
      var note = form.querySelector("#n-text").value.trim();
      var err = form.querySelector("#n-err");
      if (required && !note) { err.hidden = false; err.textContent = "Add a note."; return; }
      var d = form.querySelector("#n-date");
      ev.target.disabled = true;
      submit(note, d ? d.value || null : null).then(function () { dlg.close(); }).catch(function (e) { ev.target.disabled = false; err.hidden = false; err.textContent = e.message; });
    };
    dlg.showModal();
  }

  loadSession();
  if (session) start(); else renderSignIn();
})();
</script>
</body>
</html>`;

