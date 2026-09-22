# PSI docs

Public documentation and interactive visualizations for PSI models.

## Published documentation

- [PSI dashboard](https://neuroailab.github.io/psi-docs/psi2/training_plan/)
- [SNAIL — ccn2 onboarding](https://neuroailab.github.io/psi-docs/snail/onboarding/)
- [SNAIL — lab directory](https://neuroailab.github.io/psi-docs/snail/directory/)
- [SNAIL — office hours](https://neuroailab.github.io/psi-docs/snail/office-hours/)

The dashboard files under `psi2/training_plan/` are generated from the private
`neuroailab/ccwm` repository. Update the canonical source there; its publishing
workflow synchronizes only the static website assets into this repository.

## SNAIL onboarding

The independent onboarding manual lives in `snail/onboarding/`. It uses plain
HTML, CSS, and a small progressive-enhancement script; the guide also works
without JavaScript. Edit these files directly in this repository. GitHub Pages
deploys them at `/psi-docs/snail/onboarding/` on the same site as the dashboard.
The repository prefix is part of this project's Pages URL.

Keep the guide public-safe: use placeholder usernames, never include passwords,
private keys, tokens, or copies of personal configuration. Explain shared homes
and caches without suggesting unsafe home-directory replacement, and emphasize
minimal, coordinated use of shared GPUs. Confirm current node/access policies
with the cluster administrators before changing operational guidance.

For a local preview, serve this repository with `python3 -m http.server` and
open `/snail/onboarding/`. Publish only the intended website files; `scratch/`
contains local review material and is not part of the site.

## SNAIL directory

The interactive lab map lives in `snail/directory/`. Edit `people.js` for names,
verified profile sources, portraits, research tags, and schematic desk positions;
`scene.js` contains the code-built room. The map is not surveyed or a live
occupancy tracker. RENE is a robot station, not a person. Unconfirmed profiles
remain explicit placeholders. See the directory's README for maintenance notes.

## SNAIL office hours

The static booking page lives in `snail/office-hours/`; its persistent HTTPS API
lives on the dedicated `snail-services` Google Cloud VM. See
[backend/office_hours/SETUP.md](backend/office_hours/SETUP.md) for the one-time
Google/Microsoft app registrations and host calendar authorization. Each sign-in
provider stays disabled until its credentials are configured; booking slots stay
unavailable until the selected host has connected and configured calendars. Secrets,
tokens, databases, and virtual environments must never be committed. Backend
source is excluded from the Pages artifact.
