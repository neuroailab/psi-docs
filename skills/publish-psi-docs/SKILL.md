---
name: publish-psi-docs
description: Add, update, preview, or publish public static pages in neuroailab/psi-docs on GitHub Pages. Use for new page URLs, navigation, or an explicitly requested website push. Does not authorize publishing local drafts or deploying the separate office-hours backend.
---

# Publish PSI docs pages

Maintain the public site at `https://neuroailab.github.io/psi-docs/` and repository
`https://github.com/neuroailab/psi-docs`. Work in the user's checkout; do not assume
a particular workstation path. For human-facing instructions, read
`PUBLISHING.md` at the checkout root.

## Establish scope

- Read applicable `AGENTS.md` files, the root README, page-specific instructions,
  and `.github/workflows/deploy-pages.yml` before editing or publishing.
- Inspect the remote, branch, tracked/untracked changes, and index. Treat existing
  edits as someone else's unless the conversation establishes ownership.
- Creating or previewing a page does not authorize a commit, push, deployment,
  backend change, or publication of other drafts. Follow the requested scope.
- The PSI dashboard in `psi2/training_plan/` is synchronized from the private
  `neuroailab/ccwm` source. Locate its canonical source/publishing instructions
  before changing it; do not copy private source, checkpoints, or logs into this
  public repository. Other standalone pages can be edited here.

## Add or update a page

- A folder such as `snail/new-page/` containing `index.html` becomes
  `/psi-docs/snail/new-page/`. There is no new domain or per-page Pages setup.
- Use page-local HTML, CSS, JavaScript, and public assets. Prefer relative links;
  root-relative links must include `/psi-docs/`. Reuse an appropriate existing
  design without leaking styles or event handlers into unrelated pages.
- The workflow copies static files without compilation or Markdown rendering.
  Use real HTML entry points, not routes requiring server rewrites. Keep secrets
  and server-only functionality on an authorized separate backend.
- Add discoverable navigation only for pages included in the intended release.
  Do not publish links to another person's local draft.

## Check the result

- Serve the checkout on loopback for local review. A root-served preview omits
  `/psi-docs/`; account for that difference when testing asset and navigation URLs.
  A remote loopback address needs a tunnel or an approved preview service.
- For UI changes, test representative desktop and phone widths, interaction,
  keyboard access, and console/network errors. Check referenced files and data.
  For documentation-only changes, validate links and instructions against the
  actual workflow; a browser UI test is not required.
- Recheck the entire staged diff for public suitability. Workflow exclusions and
  `.gitignore` do not make committed files private. Unlinked assets are still
  public. Never include credentials, tokens, databases, raw private logs, or
  unapproved research/personnel content.
- `scratch/`, presentations, and other local review material are not automatically
  safe to publish. Check the current exclusions; do not assume their names protect
  them. Publish only the intended files, including necessary public dependencies.

## Publish when authorized

- Fetch the remote and check for divergence. Preserve unrelated staged and
  unstaged changes; stage explicit paths or the relevant hunks, never the whole
  dirty worktree. Do not force-push to resolve a conflict.
- Review staged content and run `git diff --cached --check` before committing.
  Push the intended release to `main`, or use the requested branch/PR workflow.
  Reaching `main` triggers the existing **Deploy PSI docs** GitHub Actions workflow.
- If a requested push has no new changes, verify the remote and live files rather
  than creating an empty commit. Say when everything was already current.
- Check the workflow for the exact pushed commit, then verify the public URL and
  relevant assets. Use GitHub's web UI or public API if the `gh` CLI is unavailable.
  If checks are still running, wait with bounded polls; if they fail, inspect the
  cause. Do not repeatedly redeploy an unchanged failure or broaden permissions.
- Stop for missing credentials, conflicting work, or a required scope expansion;
  report what remains without claiming a deployment succeeded.

Finish with the GitHub and public links, the commit when one was created, checks
performed, and any unresolved deployment issue. Identify which unrelated edits
were intentionally left local.
