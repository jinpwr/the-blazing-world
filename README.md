# Build Log — a minimal blog on GitHub Pages

Static HTML + Markdown files. No build step, no dependencies to update, no server.
Posts are written in the browser at `/admin.html`, which commits straight to this
repo through the GitHub Contents API.

```
index.html        entry list  + "Export all"
post.html         single post + "Export"
about.html        edit the text directly
admin.html        the editor (noindex)
assets/config.js  ← the only file you must edit
assets/style.css  all styling
assets/app.js     rendering + export
assets/admin.js   GitHub API client + editor
posts/*.md        your posts (Markdown + front matter)
posts/index.json  the list the homepage reads
images/           uploaded images
```

## Setup

**1. Create the repo.** On GitHub, make a new *public* repo — name it
`<your-username>.github.io` for a root domain, or anything else for
`username.github.io/reponame/`. Upload the contents of this folder (or push it):

```bash
git init && git add . && git commit -m "Initial blog"
git branch -M main
git remote add origin https://github.com/<user>/<repo>.git
git push -u origin main
```

**2. Turn on Pages.** Repo → **Settings → Pages** → Source: *Deploy from a branch* →
Branch `main`, folder `/ (root)` → Save. The URL appears after a minute.

**3. Edit `assets/config.js`:**

```js
window.SITE = {
  title:  "Build Log",
  tagline: "One line under the title.",
  owner:  "your-github-username",
  repo:   "your-repo-name",
  branch: "main"
};
```

**4. Make a token.** GitHub → Settings → Developer settings →
**Personal access tokens → Fine-grained tokens → Generate new token**

- Repository access: **Only select repositories** → this repo
- Permissions → Repository permissions → **Contents: Read and write**
- Expiration: 90 days or whatever you're comfortable renewing

**5. Write.** Open `https://<your-site>/admin.html`, paste the token once, hit
**New post**. Title, body in Markdown, drag or paste images in, **Publish**.
The post is live after GitHub Pages rebuilds (~1 min).

## Daily use

| Action | Where |
|---|---|
| New post | `admin.html` → New post |
| Re-edit a post | `admin.html` → Edit, or the **Edit** button under any post |
| Add an image | Drag onto the drop zone, or paste into the body field |
| Delete a post | Open it in the editor → Delete |
| Export one post | Post page → **Export ▾** → `.md` or `.pdf` |
| Export everything | Home page → **Export all ▾** → `.md` (zip) or `.pdf` |

PDF export opens your browser's print dialog — choose *Save as PDF*. Turn
**off** "Headers and footers" for a clean page. This uses a print stylesheet
instead of a PDF library, so the typography matches the site and nothing extra
gets downloaded.

## About the token

It is stored in this browser's `localStorage` and sent only to `api.github.com`.
Anyone with access to your machine and browser can post as you, so use it on a
device you control, and click **Sign out** on shared machines. Scope it to this one
repo with Contents-only permission so the worst case stays contained. Revoke it at
any time from GitHub settings.

You never have to use the editor: `posts/*.md` and `posts/index.json` can also be
edited directly on github.com. Keep the two in sync — `index.json` is what the
homepage lists.

## Notes

- Posts render client-side, so search engines index this less thoroughly than a
  pre-built site. If that matters later, the `posts/` folder drops into Astro or
  Eleventy unchanged.
- Two CDN scripts are used, loaded only when needed: `marked` (Markdown) and
  `jszip` (bulk `.md` export). Nothing else.
- Dark mode follows the operating system setting.
