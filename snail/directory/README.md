# SNAIL lab directory

Published at `/psi-docs/snail/directory/`, alongside the onboarding manual.
This is a static ES-module site, with no backend, tracking, API keys, or build step.
Serve the repository root over HTTP for local testing.

## Maintaining the directory

- `people.js`: 16 people, their public profile sources, portraits, research tags,
  and sketch-based seats. Edit the `seat` coordinates to move a desk. No surveyed
  dimensions or cardinal orientation are implied.
- `scene.js`: hand-built Three.js room, chairs, glass walls, lounge, plants, and
  the two-arm YAM robot station identified by Klemen as RENE.
- `app.js`: accessible HTML desk buttons, profile cards, search, filters, camera
  controls, deep links (`#person-kristine`, `#person-khai`, `#rene`), and SVG fallback
  when WebGL is unavailable. Without JavaScript, a static public-profile list remains.
- `styles.css`: self-contained responsive styling; no changes to the PSI dashboard.

Yifan's full name, biography, and portrait still need confirmation. Baihan Zhang's
research biography and portrait are pending. Do not substitute similarly named
people or infer identities from faces in room photos. The two blank desks in the
sketch are labeled "Unlabeled", not "Available". This is not a live presence map.

## Sources and assets

The owner supplied the whiteboard and room photographs, and confirmed publication.
Those originals and inspection screenshots remain local in `scratch/`; they must
not be committed or published. The room is reconstructed in code, not a photograph.

Each completed biography is paraphrased from the public source linked in
`people.js` and displayed in its profile. Sources checked September 21, 2026.
Research areas are broad navigational groupings, not formal affiliations.

Portraits for Dan, Klemen, Rahul, Atlas, Gia, Imran, Yash, Lilian, and Khai come from
Klemen's existing public collaborator directory. Additional assets come from:

- Clíona: Stanford Psychology public profile.
- Seojin: Stanford VPNL public profile.
- Greyson: `https://agbrothers.github.io/content/profile.png` (his stylized portrait).
- Arjun: `https://arjunchandra2.github.io/assets/img/misc/prof_pic.jpg`.
- Kristine: `https://kristinezheng.github.io/img/kristine_headshot.png`.

Portrait credits are displayed in the profile panel. No private contact details,
raw room photos, credentials, or presence/schedule data are included.

`vendor/` contains Three.js r185, RoundedBoxGeometry, and BufferGeometryUtils from the same release,
with the upstream MIT license in `vendor/LICENSE.txt`. Dependencies are served
locally, so the directory does not rely on a third-party CDN or remote portraits.
Static furniture is merged by material, and rendering happens only on changes
(selection, camera movement, resize), rather than in a continuous animation loop.
