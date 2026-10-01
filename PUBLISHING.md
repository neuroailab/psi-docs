# Publishing public pages

Use this guide to add a publicly accessible page to the existing PSI documentation
site. Create static files in this repository, preview them, and push the intended
changes to `main`; the existing GitHub Actions workflow publishes the site. A new
page does not need a new repository, domain, server, or Pages configuration.

- Repository: [neuroailab/psi-docs](https://github.com/neuroailab/psi-docs).
- Site prefix: `https://neuroailab.github.io/psi-docs/`.
- Deployment: [Deploy PSI docs](https://github.com/neuroailab/psi-docs/actions/workflows/deploy-pages.yml).
- Agent instructions: [publish-psi-docs](skills/publish-psi-docs/SKILL.md).

## Choose the page location

Use a descriptive lowercase folder, with `index.html` as its entry point. Group
related pages under an existing section when appropriate. Repository paths map
directly to paths below the site's `/psi-docs/` prefix:

| Repository file | Public URL path |
| --- | --- |
| `my-page/index.html` | `/psi-docs/my-page/` |
| `snail/my-page/index.html` | `/psi-docs/snail/my-page/` |
| `psi2/training_plan/index.html` | `/psi-docs/psi2/training_plan/` |

For example, `snail/my-page/index.html` would be available at
`https://neuroailab.github.io/psi-docs/snail/my-page/`. These `my-page` paths are
examples, not existing pages. Keep CSS, JavaScript, and public assets beside the
page, such as `styles.css`, `app.js`, and `assets/`.

The model dashboard under `psi2/training_plan/` has a canonical source in the
private `neuroailab/ccwm` repository. Follow its publishing workflow when changing
that dashboard so a later synchronization does not overwrite the change. The
independent SNAIL pages are maintained directly here.

## Build a static page

Start from an existing page with a suitable layout, or write a standalone HTML
page. Include a descriptive title, a viewport meta tag, accessible controls, and
a layout that works on phones. Scope styles and JavaScript to the new page;
avoid changing existing pages unless the task calls for it.

Use relative asset references such as `./styles.css`, `./app.js`, and
`./assets/photo.jpg`. A URL beginning with `/` starts at `neuroailab.github.io`,
not at this repository. If using a root-relative site link, include `/psi-docs/`.
Prefer real folders and HTML files rather than routes requiring a server rewrite.

Add a link from the appropriate existing navigation and from the repository
README so visitors can find the page. Navigation is not generated automatically.
Do not link public navigation to a page that is still only a local draft.

GitHub Pages serves static content. This repository's
[deployment workflow](.github/workflows/deploy-pages.yml) copies files as-is and
adds `.nojekyll`: it does not compile a frontend, render Markdown into HTML, or
run Python, Node, a database, or authentication on the server. A Markdown guide
can be read on GitHub; use HTML for a rendered website page. Interactive services
need a separate HTTPS backend, like the existing office-hours service. Its
deployment is a separate operation, not part of a Pages push.

See [GitHub Pages basics](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
and [custom Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
for the platform details; the checked-in workflow is the source of truth for this
repository.

## Preview and test

From the repository root, run:

```bash
python3 -m http.server 8000 --bind 127.0.0.1
```

On that machine, open `http://127.0.0.1:8000/snail/my-page/`, substituting your
actual folder. If working on a remote machine, use an approved SSH tunnel or an
existing preview service; your laptop's `127.0.0.1` is not the remote machine.

This simple preview serves the repository at `/`, without the production
`/psi-docs/` prefix. Relative links work in both places. Verify any root-relative
URLs against the real deployment path or a preview mounted at `/psi-docs/`.

Check desktop and phone widths, navigation, keyboard controls, images, videos,
and the browser console and network panel. Fix missing assets and JavaScript
errors. For JSON-driven pages, validate the data too. A successful upload alone
does not establish that the page works.

## Review public content and publish

Both this repository and the website are public. Never commit passwords, OAuth
client secrets, tokens, private keys, personal configuration, calendar data,
databases, raw logs, or unapproved research/personnel material. Anything in
browser JavaScript or downloaded assets is visible to visitors.

The current workflow excludes `.git/`, `.github/`, `backend/`, `client_secret*.json`,
`.env`, `.env.*`, and files named `README.md` from the Pages artifact. **These
exclusions do not make committed files private on GitHub.** Other tracked files
can be published even without a navigation link. In particular, `scratch/` and
presentation drafts are not protected by a blanket workflow exclusion: leave
unapproved material untracked and unstaged.

Inspect the branch, remote, local edits, and staged changes first:

```bash
git remote -v
git fetch origin
git status --short --branch
git diff
git diff --cached
```

Publish only when authorized. Preserve unrelated edits and existing staged work.
If the branch is behind or diverged, resolve that deliberately; do not force-push
or reset someone else's work. A feature branch and pull request is also fine;
deployment occurs after the changes reach `main`.

For a reviewed change on `main`, adapt this explicit file list:

```bash
git add -- snail/my-page/index.html snail/my-page/styles.css snail/my-page/app.js
git diff --cached --stat
git diff --cached
git diff --cached --check
git commit -m "Add public SNAIL page"
git push origin main
```

Also stage the intended assets and navigation changes, but do not use `git add .`
in a workspace containing unrelated material. If the README already has local
edits, stage only your intended hunk, for example with `git add -p -- README.md`.
Review the entire staged diff before committing; an explicit `git add` list does
not remove files that someone previously staged.

## Verify the deployment

Open [Deploy PSI docs](https://github.com/neuroailab/psi-docs/actions/workflows/deploy-pages.yml),
find the run for the pushed commit, and confirm both build and deploy succeeded.
The workflow also supports a manual run from that page when a redeploy is needed.
There is no need to change the existing Pages source setting for an additional
folder.

Then open the full public URL, test the page and its assets, and confirm the
expected content is live. If it looks stale, use a private window or a hard reload.
If the workflow fails, inspect its logs before changing settings or pushing
again. Report the commit and public URL, and distinguish a successful push from
a verified deployment.

## Use the shared skill

The reusable skill is versioned at `skills/publish-psi-docs/SKILL.md`. In a coding
chat with this repository available, ask:

> Read skills/publish-psi-docs/SKILL.md, then add the requested page. Keep it local
> until I approve publishing.

For an approved release, replace the last sentence with an explicit request to
push the reviewed page and verify its deployment. Keeping the skill in the
repository does not install it globally; another agent can read it directly from
the checkout, or it can be installed through that agent's skill-management tools.
