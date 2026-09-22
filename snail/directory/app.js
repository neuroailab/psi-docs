import { PEOPLE, EXTRA_DESKS, LANDMARKS, AREAS } from "./people.js";

const $ = (selector) => document.querySelector(selector);
const state = { selected: null, filter: "All people", query: "", view: "3d" };
const pins = new Map();
const leaders = document.createElementNS("http://www.w3.org/2000/svg", "svg");
leaders.classList.add("pin-leaders");
leaders.setAttribute("aria-hidden", "true");
$("#pins").append(leaders);
let lab = null;
const normalize = (text) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const escape = (text) =>
  String(text).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const photoCredits = {
  cliona: [
    "Stanford Psychology",
    "https://psychology.stanford.edu/people/cliona-o-doherty",
  ],
  seojin: ["Stanford VPNL", "https://vpnl.stanford.edu/people/seojin-lee"],
  greyson: ["Personal website", "https://agbrothers.github.io/"],
  arjun: ["Personal website", "https://arjunchandra2.github.io/"],
  kristine: ["Personal website", "https://kristinezheng.github.io/"],
};
function face(person, className) {
  return `<span class="${className}">${person.photo ? `<img src="./assets/people/${person.photo}" alt="" loading="lazy" />` : escape(person.initials)}</span>`;
}
function handleImages(root) {
  root.querySelectorAll("img").forEach((img) => {
    img.addEventListener(
      "error",
      () => {
        const owner = img.closest("[data-person]");
        const person = PEOPLE.find((p) => p.id === owner?.dataset.person);
        img.parentElement.textContent = person?.initials || "—";
      },
      { once: true },
    );
  });
}
function matches(person) {
  return (
    (state.filter === "All people" || person.area === state.filter) &&
    normalize(
      [person.name, person.short, person.role, person.bio, ...person.tags].join(
        " ",
      ),
    ).includes(normalize(state.query))
  );
}
function renderPeople() {
  const visible = PEOPLE.filter(matches);
  $("#people-grid").innerHTML = visible
    .map(
      (person) =>
        `<button type="button" class="person-card" data-person="${person.id}" aria-pressed="${state.selected === person.id}" style="--person-color:${AREAS[person.area]}">${face(person, "person-avatar")}<span class="person-info"><span class="person-name">${escape(person.name)}</span><span class="person-topic"><i aria-hidden="true"></i>${escape(person.area)}</span></span><span class="person-arrow" aria-hidden="true">↗</span></button>`,
    )
    .join("");
  $("#people-count").textContent = PEOPLE.length;
  $("#empty-state").hidden = visible.length !== 0;
  $("#search-status").textContent =
    `${visible.length} of ${PEOPLE.length} people shown.`;
  $("#people-grid")
    .querySelectorAll("[data-person]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        selectPerson(button.dataset.person, { scroll: true }),
      ),
    );
  handleImages($("#people-grid"));
  for (const person of PEOPLE) {
    const match = matches(person);
    pins.get(person.id)?.classList.toggle("is-muted", !match);
  }
}
function renderProfile(person) {
  const credit = photoCredits[person.id] || [
    "Klemen’s directory",
    "https://klemenkotar.github.io/#collabs",
  ];
  $("#profile").dataset.person = person.id;
  $("#profile").innerHTML =
    `<div class="profile-top"><p class="eyebrow">A person behind the work</p>${face(person, "profile-avatar")}<h2 id="profile-name">${escape(person.name)}</h2><p class="profile-role">${escape(person.role)}</p></div><div class="profile-body">${person.tags.length ? `<div class="profile-tags">${person.tags.map((tag) => `<span>${escape(tag)}</span>`).join("")}</div>` : '<p class="pending-note">Research profile &amp; portrait to be confirmed</p>'}<p class="profile-bio">${escape(person.bio)}</p><div class="seat-info"><p class="eyebrow">Find this desk</p><p>${escape(person.seat.label)}</p></div>${person.website ? `<a class="profile-link" href="${person.website}" target="_blank" rel="noopener noreferrer">Visit website <span aria-hidden="true">↗</span></a>` : ""}<p class="profile-sources">${person.source ? `Bio: <a href="${person.source}" target="_blank" rel="noopener noreferrer">${escape(person.sourceLabel)}</a><br />` : ""}${person.photo ? `Portrait: <a href="${credit[1]}" target="_blank" rel="noopener noreferrer">${escape(credit[0])}</a>` : "Portrait not yet available."}</p></div>`;
  handleImages($("#profile"));
}
function selectPerson(id, { scroll = false, updateHash = true } = {}) {
  const person = PEOPLE.find((p) => p.id === id);
  if (!person) return;
  state.selected = id;
  renderProfile(person);
  // Keep existing buttons in place so keyboard focus is not destroyed.
  document
    .querySelectorAll(".person-card, .pin")
    .forEach((button) =>
      button.setAttribute("aria-pressed", String(button.dataset.person === id)),
    );
  lab?.select(id);
  if (!lab) positionFallback();
  $("#directory-status").textContent =
    `Selected ${person.name}. ${person.seat.label}.`;
  if (updateHash) history.replaceState(null, "", `#person-${id}`);
  if (scroll) {
    const target = window.innerWidth <= 760 ? $("#profile") : $(".workspace");
    target.scrollIntoView({
      block: "start",
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }
}
function createPins() {
  for (const person of PEOPLE) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "pin";
    button.dataset.person = person.id;
    button.setAttribute(
      "aria-label",
      `View ${person.name}, ${person.seat.label}`,
    );
    button.setAttribute("aria-pressed", "false");
    button.innerHTML = `${face(person, "pin-face")}<span class="pin-name">${escape(person.short)}</span>`;
    button.addEventListener("click", () => selectPerson(person.id));
    $("#pins").append(button);
    pins.set(person.id, button);
  }
  for (const extra of [...EXTRA_DESKS, ...LANDMARKS]) {
    const label = document.createElement("span");
    label.className = "sketch-pin";
    label.textContent = extra.short;
    label.title = extra.description || "Desk unlabeled in the sketch";
    $("#pins").append(label);
    pins.set(extra.id, label);
  }
  handleImages($("#pins"));
}
function fallbackMap() {
  const desks = [
    ...PEOPLE.map((person) => ({ ...person.seat, id: person.id })),
    ...EXTRA_DESKS,
  ];
  $("#map-fallback").innerHTML =
    `<svg viewBox="-7 -11 16 23" xmlns="http://www.w3.org/2000/svg"><rect x="-5.7" y="-9.8" width="13.9" height="20.6" rx=".2" fill="#d0d5c5" stroke="#a6b398" stroke-width=".12"/><path d="M-5.7 10.8V-9.8H8.2" fill="none" stroke="#adced0" stroke-width=".3"/>${desks.map((d) => `<g transform="translate(${d.x} ${d.z}) rotate(${((d.rotation || 0) * 180) / Math.PI})"><rect x="-1.03" y="-.44" width="2.06" height=".88" rx=".08" fill="#fffef3" stroke="#9aab8c" stroke-width=".06"/><rect x="-.37" y="-.22" width=".74" height=".17" rx=".03" fill="#53634d"/><circle cx="0" cy=".8" r=".27" fill="#7d8775"/></g>`).join("")}<rect x="4.25" y="7.4" width="2.1" height="1.2" rx=".1" fill="#b9cfbf"/><text x="5.3" y="8.25" text-anchor="middle" font-size=".35" fill="#39594c">YAM</text><text x="-4.9" y="9.8" font-size=".4" fill="#69765c">LOUNGE</text></svg>`;
  positionFallback();
}
function positionFallback() {
  if (lab) return;
  const container = $("#map-fallback");
  const css = getComputedStyle(container);
  const left = parseFloat(css.paddingLeft),
    right = parseFloat(css.paddingRight);
  const top = parseFloat(css.paddingTop),
    bottom = parseFloat(css.paddingBottom);
  const width = container.clientWidth - left - right,
    height = container.clientHeight - top - bottom;
  const scale = Math.min(width / 16, height / 23);
  const ox = left + (width - 16 * scale) / 2,
    oy = top + (height - 23 * scale) / 2;
  const positions = new Map();
  for (const item of [
    ...PEOPLE.map((person) => ({ ...person.seat, id: person.id })),
    ...EXTRA_DESKS,
    ...LANDMARKS,
  ]) {
    positions.set(item.id, {
      x: ox + (item.x + 7) * scale,
      y: oy + (item.z + 11) * scale,
      visible: true,
      order: 1,
    });
  }
  positionPins(positions);
}
// Keep nearby names legible, with short leaders pointing to their actual desks.
// HTML buttons preserve keyboard navigation independently of the 3D renderer.
function positionPins(positions) {
  const width = $("#scene").clientWidth,
    height = $("#scene").clientHeight;
  const placed = [],
    lines = [];
  const ordered = [...positions].sort((a, b) => a[1].y - b[1].y);
  for (const [id, point] of ordered) {
    const pin = pins.get(id);
    if (!pin) continue;
    pin.hidden = !point.visible;
    if (!point.visible) continue;
    const w = pin.offsetWidth,
      h = pin.offsetHeight;
    const overlap = (a, b) =>
      Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left) + 4) *
      Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) + 4);
    let best = null,
      cost = Infinity;
    for (const radius of [0, 14, 28, 42, 60, 84, 110]) {
      for (let i = 0; i < (radius ? 16 : 1); i++) {
        const angle = (i * Math.PI) / 8;
        const x = Math.max(
          w / 2 + 6,
          Math.min(width - w / 2 - 6, point.x + Math.cos(angle) * radius),
        );
        const y = Math.max(
          h + 38,
          Math.min(height - 82, point.y + Math.sin(angle) * radius),
        );
        const rect = {
          left: x - w / 2,
          right: x + w / 2,
          top: y - h,
          bottom: y,
        };
        const penalty =
          placed.reduce((sum, other) => sum + overlap(rect, other) * 1000, 0) +
          Math.hypot(x - point.x, y - point.y);
        if (penalty < cost) {
          cost = penalty;
          best = { x, y, rect };
        }
      }
      if (cost < radius + 1) break;
    }
    placed.push(best.rect);
    pin.style.left = `${best.x}px`;
    pin.style.top = `${best.y}px`;
    pin.style.zIndex = String(point.order);
    if (Math.hypot(best.x - point.x, best.y - point.y) > 4) {
      lines.push(
        `<line x1="${best.x}" y1="${best.y}" x2="${point.x}" y2="${point.y}"/><circle cx="${point.x}" cy="${point.y}" r="2"/>`,
      );
    }
  }
  leaders.innerHTML = lines.join("");
}
function setView(view) {
  state.view = view;
  $("#view-3d").setAttribute("aria-pressed", String(view === "3d"));
  $("#view-top").setAttribute("aria-pressed", String(view === "top"));
  lab?.setView(view);
}
function showLandmark() {
  state.selected = null;
  $("#profile").removeAttribute("data-person");
  $("#profile").innerHTML =
    '<div class="profile-top"><p class="eyebrow">Meet the hardware</p><div class="profile-avatar" aria-hidden="true">⌁</div><h2 id="profile-name">RENE</h2><p class="profile-role">YAM robot station</p></div><div class="profile-body"><div class="profile-tags"><span>Robotics</span><span>Physical interaction</span></div><p class="profile-bio">The YAM robot setup at the front of the lab, identified as RENE in the seating sketch. A place for embodied experiments—not a person or a spare desk.</p><div class="seat-info"><p class="eyebrow">Find this station</p><p>Front-right · robot workbench</p></div><p class="profile-sources">Station identification supplied by Klemen.</p></div>';
  document
    .querySelectorAll(".pin,.person-card")
    .forEach((el) => el.setAttribute("aria-pressed", "false"));
  lab?.select("rene");
  $("#directory-status").textContent = "Selected RENE, the YAM robot station.";
  history.replaceState(null, "", "#rene");
}

createPins();
fallbackMap();
// RENE is equipment; use a separately labeled control, not a people card.
const rene = pins.get("rene");
rene.setAttribute("role", "button");
rene.tabIndex = 0;
rene.style.pointerEvents = "auto";
rene.style.cursor = "pointer";
rene.addEventListener("click", showLandmark);
rene.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    showLandmark();
  }
});
$("#filters").innerHTML = ["All people", ...Object.keys(AREAS)]
  .map(
    (name) =>
      `<button type="button" aria-pressed="${name === state.filter}" data-filter="${name}">${name}</button>`,
  )
  .join("");
$("#filters").addEventListener("click", (event) => {
  const button = event.target.closest("[data-filter]");
  if (!button) return;
  state.filter = button.dataset.filter;
  $("#filters")
    .querySelectorAll("button")
    .forEach((el) => el.setAttribute("aria-pressed", String(el === button)));
  renderPeople();
});
$("#search").addEventListener("input", (event) => {
  state.query = event.target.value;
  renderPeople();
});
$("#view-3d").addEventListener("click", () => setView("3d"));
$("#view-top").addEventListener("click", () => setView("top"));
$("#rotate-left").addEventListener("click", () => lab?.rotate(-0.28));
$("#rotate-right").addEventListener("click", () => lab?.rotate(0.28));
$("#zoom-in").addEventListener("click", () => lab?.zoom(1.15));
$("#zoom-out").addEventListener("click", () => lab?.zoom(1 / 1.15));
$("#reset-view").addEventListener("click", () => {
  lab?.reset();
  setView("3d");
});
new ResizeObserver(positionFallback).observe($("#scene"));
renderPeople();
const initial = location.hash.replace("#person-", "");
selectPerson(
  PEOPLE.some((person) => person.id === initial) ? initial : "klemen",
  { updateHash: false },
);
if (location.hash === "#rene") showLandmark();
window.addEventListener("hashchange", () => {
  if (location.hash === "#rene") showLandmark();
  else
    selectPerson(location.hash.replace("#person-", ""), { updateHash: false });
});

try {
  const { createLab } = await import("./scene.js");
  lab = createLab($("#scene"), {
    people: PEOPLE,
    extras: EXTRA_DESKS,
    landmarks: LANDMARKS,
    onSelect: (id) => (id === "rene" ? showLandmark() : selectPerson(id)),
    onProject: positionPins,
  });
  $("#scene").classList.add("has-webgl");
  $("#scene").dataset.renderer = "webgl";
  $("#scene-hint").textContent =
    "Drag to orbit · select a desk to meet its person";
  lab.select(state.selected || "rene");
  lab.setView(state.view);
} catch (error) {
  $("#scene").querySelector("canvas")?.remove();
  $("#scene").classList.add("webgl-unavailable");
  $("#scene").dataset.renderer = "fallback";
  $("#scene-hint").textContent =
    "3D unavailable here. The top-down map and directory still work.";
  $("#view-3d").disabled = true;
  setView("top");
  for (const id of [
    "rotate-left",
    "rotate-right",
    "zoom-in",
    "zoom-out",
    "reset-view",
  ])
    $("#" + id).disabled = true;
  console.info(
    "Using the accessible top-down directory fallback.",
    error.message,
  );
}
