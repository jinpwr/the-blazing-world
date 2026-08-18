/* admin.js — writes posts straight to the repo via the GitHub Contents API. */

const TOKEN_KEY = "blog.token";
const DRAFT_KEY = "blog.draft";
const API = "https://api.github.com";

let token = localStorage.getItem(TOKEN_KEY) || "";
let originalSlug = null;   // set when editing an existing post
let dirty = false;

/* ---------- base64 that survives UTF-8 ---------- */
function b64encode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin);
}
function b64decode(b64) {
  const bin = atob(String(b64).replace(/\s/g, ""));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}
function bytesToB64(buffer) {
  const bytes = new Uint8Array(buffer);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

/* ---------- GitHub client ---------- */
async function gh(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {})
    }
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error("GitHub rejected the token. Check that it has Contents: Read and write on this repo.");
  }
  return res;
}

const contentsUrl = (p) =>
  `/repos/${SITE.owner}/${SITE.repo}/contents/${p.split("/").map(encodeURIComponent).join("/")}`;

async function getFile(path) {
  const res = await gh(`${contentsUrl(path)}?ref=${SITE.branch}&t=${Date.now()}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Could not read ${path} (${res.status})`);
  const json = await res.json();
  return { sha: json.sha, text: json.content ? b64decode(json.content) : "" };
}

async function putFile(path, base64, message, sha) {
  const res = await gh(contentsUrl(path), {
    method: "PUT",
    body: JSON.stringify({ message, content: base64, branch: SITE.branch, ...(sha ? { sha } : {}) })
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(`Could not save ${path}: ${j.message || res.status}`);
  }
  return res.json();
}

async function deleteFile(path, message) {
  const existing = await getFile(path);
  if (!existing) return;
  const res = await gh(contentsUrl(path), {
    method: "DELETE",
    body: JSON.stringify({ message, sha: existing.sha, branch: SITE.branch })
  });
  if (!res.ok) throw new Error(`Could not delete ${path} (${res.status})`);
}

async function readIndex() {
  const file = await getFile("posts/index.json");
  if (!file) return { sha: null, posts: [] };
  let posts = [];
  try { posts = JSON.parse(file.text); } catch { posts = []; }
  return { sha: file.sha, posts };
}

async function writeIndex(posts, sha, message) {
  posts.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  await putFile("posts/index.json", b64encode(JSON.stringify(posts, null, 2) + "\n"), message, sha);
}

/* ---------- UI plumbing ---------- */
const show = (id, on) => { document.getElementById(id).hidden = !on; };
const val = (id) => document.getElementById(id).value.trim();
const setVal = (id, v) => { document.getElementById(id).value = v ?? ""; };
function say(id, msg, isErr = false) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.classList.toggle("err", isErr);
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function makeSlug(title, date) {
  const s = slugify(title);
  if (s) return s;
  return `${date || today()}-${Math.random().toString(36).slice(2, 6)}`;
}

/* ---------- entry point ---------- */
async function initAdmin() {
  mountChrome("admin");
  document.getElementById("repo-name").textContent = `${SITE.owner}/${SITE.repo}`;

  document.getElementById("connect").addEventListener("click", connect);
  document.getElementById("token").addEventListener("keydown", (e) => { if (e.key === "Enter") connect(); });
  document.getElementById("sign-out").addEventListener("click", () => {
    localStorage.removeItem(TOKEN_KEY);
    token = "";
    location.href = "admin.html";
  });
  document.getElementById("new-post").addEventListener("click", () => openEditor(null));
  document.getElementById("cancel").addEventListener("click", () => {
    if (dirty && !confirm("Leave without publishing? Unsaved text stays in this browser.")) return;
    location.href = "admin.html";
  });
  document.getElementById("publish").addEventListener("click", publish);
  document.getElementById("delete").addEventListener("click", removePost);
  document.getElementById("toggle-preview").addEventListener("click", togglePreview);

  wireImages();
  wireDraftAutosave();

  if (!SITE.owner || SITE.owner.startsWith("YOUR-")) {
    say("gate-status", "Set owner and repo in assets/config.js first.", true);
  }

  if (!token) { show("gate", true); return; }
  await afterAuth();
}

async function connect() {
  const t = document.getElementById("token").value.trim();
  if (!t) return say("gate-status", "Paste a token to continue.", true);
  token = t;
  say("gate-status", "Checking…");
  try {
    const res = await gh(`/repos/${SITE.owner}/${SITE.repo}`);
    if (!res.ok) throw new Error(`Repo ${SITE.owner}/${SITE.repo} not reachable (${res.status}).`);
    localStorage.setItem(TOKEN_KEY, token);
    say("gate-status", "");
    show("gate", false);
    await afterAuth();
  } catch (e) {
    token = "";
    say("gate-status", e.message, true);
  }
}

async function afterAuth() {
  const slug = new URLSearchParams(location.search).get("slug");
  if (slug) return openEditor(slug);
  show("browse", true);
  await renderList();
}

async function renderList() {
  say("browse-status", "Loading…");
  const ul = document.getElementById("admin-list");
  try {
    const { posts } = await readIndex();
    say("browse-status", `${posts.length} post${posts.length === 1 ? "" : "s"}`);
    ul.innerHTML = posts.length
      ? posts.map((p) => `
        <li>
          <span class="date">${esc(p.date)}</span>
          <span class="name">${esc(p.title)}</span>
          <a class="btn" href="admin.html?slug=${encodeURIComponent(p.slug)}">Edit</a>
          <a class="btn" href="post.html?slug=${encodeURIComponent(p.slug)}">View</a>
        </li>`).join("")
      : `<li><span class="name note">Nothing published yet.</span></li>`;
  } catch (e) {
    say("browse-status", e.message, true);
  }
}

/* ---------- editor ---------- */
async function openEditor(slug) {
  show("browse", false);
  show("editor", true);
  originalSlug = slug;
  document.getElementById("delete").hidden = !slug;

  if (!slug) {
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
    setVal("f-date", draft?.date || today());
    if (draft && (draft.title || draft.body)) {
      setVal("f-title", draft.title);
      setVal("f-slug", draft.slug);
      setVal("f-tags", draft.tags);
      setVal("f-summary", draft.summary);
      setVal("f-body", draft.body);
      say("editor-status", "Recovered an unpublished draft.");
    }
    document.getElementById("f-title").focus();
    return;
  }

  say("editor-status", "Loading…");
  try {
    const file = await getFile(`posts/${slug}.md`);
    if (!file) throw new Error("That post no longer exists.");
    const { meta, body } = parseFrontMatter(file.text);
    setVal("f-title", meta.title || slug);
    setVal("f-date", meta.date || today());
    setVal("f-slug", slug);
    setVal("f-tags", meta.tags || "");
    setVal("f-summary", meta.summary || "");
    setVal("f-body", body.trim());
    say("editor-status", "");
  } catch (e) {
    say("editor-status", e.message, true);
  }
}

function currentDraft() {
  return {
    title: val("f-title"),
    date: val("f-date") || today(),
    slug: val("f-slug"),
    tags: val("f-tags"),
    summary: val("f-summary"),
    body: document.getElementById("f-body").value
  };
}

function wireDraftAutosave() {
  const ids = ["f-title", "f-date", "f-slug", "f-tags", "f-summary", "f-body"];
  ids.forEach((id) => document.getElementById(id).addEventListener("input", () => {
    dirty = true;
    if (!originalSlug) localStorage.setItem(DRAFT_KEY, JSON.stringify(currentDraft()));
  }));
  window.addEventListener("beforeunload", (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } });
}

function togglePreview() {
  const box = document.getElementById("preview");
  const on = box.hidden;
  box.hidden = !on;
  document.getElementById("toggle-preview").textContent = on ? "Hide preview" : "Preview";
  if (on) box.innerHTML = renderMarkdown(document.getElementById("f-body").value);
}

async function publish() {
  const d = currentDraft();
  if (!d.title) return say("editor-status", "Add a title before publishing.", true);
  const slug = slugify(d.slug) || makeSlug(d.title, d.date);

  const btn = document.getElementById("publish");
  btn.disabled = true;
  say("editor-status", "Publishing…");

  try {
    const md = fullMarkdown(d, d.body);
    const existing = await getFile(`posts/${slug}.md`);
    await putFile(`posts/${slug}.md`, b64encode(md),
      `${existing ? "Update" : "Add"} post: ${d.title}`, existing?.sha);

    const { sha, posts } = await readIndex();
    const entry = { slug, title: d.title, date: d.date, summary: d.summary, tags: d.tags };
    const next = posts.filter((p) => p.slug !== slug && p.slug !== originalSlug);
    next.push(entry);
    await writeIndex(next, sha, `Index: ${d.title}`);

    if (originalSlug && originalSlug !== slug) {
      await deleteFile(`posts/${originalSlug}.md`, `Rename post to ${slug}`);
    }

    localStorage.removeItem(DRAFT_KEY);
    dirty = false;
    say("editor-status", "Published. GitHub Pages takes about a minute to update.");
    setTimeout(() => { location.href = `post.html?slug=${encodeURIComponent(slug)}`; }, 1200);
  } catch (e) {
    say("editor-status", e.message, true);
  } finally {
    btn.disabled = false;
  }
}

async function removePost() {
  if (!originalSlug) return;
  if (!confirm(`Delete "${val("f-title")}"? This removes the file from the repo.`)) return;
  say("editor-status", "Deleting…");
  try {
    await deleteFile(`posts/${originalSlug}.md`, `Delete post: ${originalSlug}`);
    const { sha, posts } = await readIndex();
    await writeIndex(posts.filter((p) => p.slug !== originalSlug), sha, `Index: remove ${originalSlug}`);
    dirty = false;
    location.href = "admin.html";
  } catch (e) {
    say("editor-status", e.message, true);
  }
}

/* ---------- images ---------- */
function wireImages() {
  const zone = document.getElementById("dropzone");
  const input = document.getElementById("file-input");
  const body = document.getElementById("f-body");

  document.getElementById("pick-image").addEventListener("click", () => input.click());
  input.addEventListener("change", () => uploadAll([...input.files]));

  ["dragenter", "dragover"].forEach((ev) =>
    zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add("over"); }));
  ["dragleave", "drop"].forEach((ev) =>
    zone.addEventListener(ev, () => zone.classList.remove("over")));
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    uploadAll([...e.dataTransfer.files].filter((f) => f.type.startsWith("image/")));
  });
  body.addEventListener("paste", (e) => {
    const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith("image/"));
    if (files.length) { e.preventDefault(); uploadAll(files); }
  });
}

async function uploadAll(files) {
  if (!files.length) return;
  for (const file of files) {
    try {
      say("editor-status", `Uploading ${file.name}…`);
      const path = await uploadImage(file);
      insertAtCursor(`\n![${file.name.replace(/\.[^.]+$/, "")}](${path})\n`);
      say("editor-status", "Image added.");
    } catch (e) {
      say("editor-status", e.message, true);
    }
  }
}

async function uploadImage(file) {
  if (file.size > 8 * 1024 * 1024) throw new Error(`${file.name} is over 8 MB — resize it first.`);
  const stamp = today().slice(0, 7); // YYYY-MM
  const safe = slugify(file.name.replace(/\.[^.]+$/, "")) || "image";
  const ext = (file.name.match(/\.[^.]+$/) || [".png"])[0].toLowerCase();
  const path = `images/${stamp}/${safe}-${Math.random().toString(36).slice(2, 6)}${ext}`;
  const buf = await file.arrayBuffer();
  await putFile(path, bytesToB64(buf), `Add image ${path}`);
  return path;
}

function insertAtCursor(text) {
  const ta = document.getElementById("f-body");
  const start = ta.selectionStart ?? ta.value.length;
  const end = ta.selectionEnd ?? ta.value.length;
  ta.value = ta.value.slice(0, start) + text + ta.value.slice(end);
  ta.selectionStart = ta.selectionEnd = start + text.length;
  ta.focus();
  dirty = true;
}
