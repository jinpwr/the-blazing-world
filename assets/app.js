/* app.js — list, read, export. No build step, no framework. */

const SITE = window.SITE;

/* ---------- helpers ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function bust(path) {
  return `${path}${path.includes("?") ? "&" : "?"}v=${Date.now()}`;
}

async function loadIndex() {
  const res = await fetch(bust("posts/index.json"), { cache: "no-store" });
  if (!res.ok) throw new Error("Could not load posts/index.json");
  const posts = await res.json();
  return posts.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

async function loadMarkdown(slug) {
  const res = await fetch(bust(`posts/${slug}.md`), { cache: "no-store" });
  if (!res.ok) throw new Error(`Post not found: ${slug}`);
  return res.text();
}

/* front matter: --- key: value --- */
function parseFrontMatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { meta: {}, body: raw };
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (kv) meta[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, "");
  }
  return { meta, body: raw.slice(m[0].length) };
}

function renderMarkdown(body) {
  marked.setOptions({ breaks: true, gfm: true, headerIds: false, mangle: false });
  return marked.parse(body);
}

function download(filename, content, type) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function loadScript(src) {
  return new Promise((ok, fail) => {
    if (document.querySelector(`script[src="${src}"]`)) return ok();
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => ok();
    s.onerror = () => fail(new Error("Could not load " + src));
    document.head.appendChild(s);
  });
}

/* ---------- chrome ---------- */
function mountChrome(current) {
  document.title = current === "home"
    ? SITE.title
    : `${document.title} · ${SITE.title}`;
  const mast = $("#masthead");
  if (!mast) return;
  const link = (href, label, key) =>
    `<a href="${href}"${current === key ? ' aria-current="page"' : ""}>${label}</a>`;
  mast.innerHTML = `
    <h1><a href="./">${esc(SITE.title)}</a></h1>
    <nav class="nav">
      ${link("./", "posts", "home")}
      ${link("about.html", "about", "about")}
      ${link("admin.html", "write", "admin")}
    </nav>`;
}

/* ---------- dropdown menu ---------- */
function menu(button, items) {
  const list = document.createElement("div");
  list.className = "menu-list";
  list.hidden = true;
  for (const [label, fn] of items) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.addEventListener("click", () => { list.hidden = true; fn(); });
    list.appendChild(b);
  }
  const holder = document.createElement("span");
  holder.className = "menu";
  button.replaceWith(holder);
  holder.append(button, list);
  button.addEventListener("click", (e) => {
    e.stopPropagation();
    list.hidden = !list.hidden;
  });
  document.addEventListener("click", () => { list.hidden = true; });
}

/* ---------- exports ---------- */
function fullMarkdown(meta, body) {
  const fm = [
    "---",
    `title: ${meta.title || ""}`,
    `date: ${meta.date || ""}`,
    meta.summary ? `summary: ${meta.summary}` : null,
    meta.tags ? `tags: ${meta.tags}` : null,
    "---",
    ""
  ].filter(Boolean).join("\n");
  return `${fm}\n${body.trim()}\n`;
}

async function exportPostMd(slug) {
  const raw = await loadMarkdown(slug);
  download(`${slug}.md`, raw, "text/markdown;charset=utf-8");
}

async function exportAllMd(posts) {
  await loadScript("https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js");
  const zip = new JSZip();
  const folder = zip.folder("posts");
  for (const p of posts) {
    folder.file(`${p.slug}.md`, await loadMarkdown(p.slug));
  }
  zip.file("index.md", [
    `# ${SITE.title}`, "",
    ...posts.map((p) => `- ${p.date} — [${p.title}](posts/${p.slug}.md)`)
  ].join("\n"));
  const blob = await zip.generateAsync({ type: "blob" });
  download(`${slugify(SITE.title) || "blog"}-markdown.zip`, blob);
}

function exportPdf() {
  window.print(); // choose "Save as PDF" in the print dialog
}

function slugify(s) {
  return String(s).toLowerCase().trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/[^a-z0-9-]/g, "");
}

/* ---------- page: home ---------- */
async function initHome() {
  mountChrome("home");
  $("#lede").textContent = SITE.tagline || "";
  const list = $("#list");
  let posts = [];
  try {
    posts = await loadIndex();
  } catch (e) {
    list.innerHTML = `<p class="status err">${esc(e.message)}</p>`;
    return;
  }
  if (!posts.length) {
    list.innerHTML = `<p class="note">No entries yet. <a href="admin.html">Write the first one.</a></p>`;
    return;
  }
  const total = posts.length;
  list.innerHTML = posts.map((p, i) => `
    <article class="entry">
      <div class="entry-meta"><span class="no">${String(total - i).padStart(3, "0")}</span> &nbsp;${esc(p.date)}</div>
      <div>
        <h2 class="entry-title"><a href="post.html?slug=${encodeURIComponent(p.slug)}">${esc(p.title)}</a></h2>
        ${p.summary ? `<p class="entry-summary">${esc(p.summary)}</p>` : ""}
        ${p.tags ? `<p class="entry-tags">${esc(p.tags)}</p>` : ""}
      </div>
    </article>`).join("");

  const btn = $("#export-all");
  menu(btn, [
    ["Download .md (zip)", () => exportAllMd(posts).catch((e) => alert(e.message))],
    ["Save as .pdf", () => openPrintAll(posts)]
  ]);
}

async function openPrintAll(posts) {
  const holder = $("#print-all");
  holder.innerHTML = `<p class="note">Preparing ${posts.length} entries…</p>`;
  const parts = [];
  for (const p of posts) {
    const { meta, body } = parseFrontMatter(await loadMarkdown(p.slug));
    parts.push(`<article class="post print-post">
      <div class="post-meta">${esc(meta.date || p.date)}</div>
      <h1 class="title">${esc(meta.title || p.title)}</h1>
      <div class="prose">${renderMarkdown(body)}</div>
    </article>`);
  }
  holder.innerHTML = parts.join("");
  document.body.classList.add("printing-all");
  window.print();
}

/* ---------- page: post ---------- */
async function initPost() {
  const slug = new URLSearchParams(location.search).get("slug");
  const root = $("#post");
  if (!slug) { root.innerHTML = `<p class="status err">No post specified.</p>`; mountChrome(""); return; }

  let meta, body;
  try {
    ({ meta, body } = parseFrontMatter(await loadMarkdown(slug)));
  } catch (e) {
    root.innerHTML = `<p class="status err">${esc(e.message)}</p>`;
    mountChrome("");
    return;
  }

  document.title = meta.title || slug;
  mountChrome("");
  root.innerHTML = `
    <div class="post-meta">${esc(meta.date || "")}${meta.tags ? " &nbsp;·&nbsp; " + esc(meta.tags) : ""}</div>
    <h1 class="title">${esc(meta.title || slug)}</h1>
    <div class="prose">${renderMarkdown(body)}</div>`;

  $("#edit-link").href = `admin.html?slug=${encodeURIComponent(slug)}`;
  menu($("#export-post"), [
    ["Download .md", () => exportPostMd(slug).catch((e) => alert(e.message))],
    ["Save as .pdf", exportPdf]
  ]);
}
