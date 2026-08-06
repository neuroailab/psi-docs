const LANG_ORDER = ["fizz", "blip", "morsel", "burble", "drawl", "rumble", "glint", "cascade",
                    "rasp", "murmur", "growl", "smudge10", "smudge25", "smudge40", "hiccup",
                    "saga", "saga95", "saga90", "smolder"];
const LANG_VAR = {
  fizz: "--l8", blip: "--l1", morsel: "--l2", burble: "--l3",
  drawl: "--l4", rumble: "--l6", glint: "--l5", cascade: "--l7", rasp: "--l9",
};
// noise-round languages: fixed hexes (theme-neutral mid-tones)
const LANG_HEX = {
  murmur: "#a06718", growl: "#4a3f8f", smudge10: "#d1a13d", smudge25: "#b07a20",
  smudge40: "#8a5a10", hiccup: "#3a8a99", saga: "#7a4a9e",
  saga95: "#9a6ab8", saga90: "#b98ad0", smolder: "#7d4536",
};
const REFRESH_MS = 60_000;

const themeToggle = document.querySelector("#theme-toggle");
let DATA = null;

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function langColor(lang) {
  if (LANG_HEX[lang]) return LANG_HEX[lang];
  return cssVar(LANG_VAR[lang] || "--l8");
}

function baseLayout(overrides = {}) {
  const ink = cssVar("--ink");
  const grid = cssVar("--grid-line");
  const muted = cssVar("--muted");
  return Object.assign({
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: { family: "Inter, sans-serif", size: 12, color: ink },
    margin: { l: 58, r: 18, t: 44, b: 48 },
    xaxis: { gridcolor: grid, zeroline: false, linecolor: grid, tickcolor: muted },
    yaxis: { gridcolor: grid, zeroline: false, linecolor: grid, tickcolor: muted },
    legend: { orientation: "h", y: -0.18, font: { size: 11 } },
    hovermode: "closest",
  }, overrides);
}

const PLOT_CONFIG = { displayModeBar: false, responsive: true };

function empty(id, msg) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = `<div class="plot-empty">${msg}</div>`;
}

/* ---- data helpers ------------------------------------------------------ */
function probeVal(run, task) {
  const p = run.probes && run.probes[task];
  if (!p) return null;
  return p.acc ?? p.auc ?? null;
}

function runVal(run, task) {
  if (["word", "word_tok", "position", "boundary", "phrase", "phrase_tok",
       "shimmer", "letter"].includes(task)) {
    return probeVal(run, task);
  }
  return run[task] ?? null;
}

// The registered pooled-span word probe saturates at 100% on these noiseless
// lexicons; the single-token probe is the sensitive word-decodability readout.
function pickWordTask(runs, lang, opts) {
  return curve(runs, lang, "word_tok", opts).ns.length ? "word_tok" : "word";
}

function curve(runs, lang, task, { size = "trout", control = "none", agg = "mean" } = {}) {
  const byN = new Map();
  for (const r of runs) {
    if (r.lang !== lang || r.size !== size || r.control !== control || r.loss_agg !== agg) continue;
    const v = runVal(r, task);
    if (v === null || v === undefined) continue;
    if (!byN.has(r.n)) byN.set(r.n, []);
    byN.get(r.n).push(v);
  }
  const ns = [...byN.keys()].sort((a, b) => a - b);
  return { ns, vals: ns.map((n) => byN.get(n).reduce((a, b) => a + b, 0) / byN.get(n).length) };
}

function argmaxN(runs, lang, task, opts) {
  const { ns, vals } = curve(runs, lang, task, opts);
  if (!ns.length) return null;
  return ns[vals.indexOf(Math.max(...vals))];
}

/* ---- hero dots --------------------------------------------------------- */
function renderHeroDots() {
  const el = document.getElementById("hero-dots");
  if (!el || el.childElementCount) return;
  const vars = ["--l1", "--l2", "--l3", "--l4", "--l5", "--l6", "--l7", "--l8"];
  let word = 0, remaining = 0;
  for (let i = 0; i < 42; i++) {
    if (remaining === 0) { remaining = 2 + Math.floor(Math.random() * 5); word++; }
    const dot = document.createElement("i");
    dot.style.background = cssVar(vars[(word * 3 + remaining) % 8]);
    dot.style.opacity = word % 2 ? 0.95 : 0.55;
    el.append(dot);
    remaining--;
  }
}

/* ---- status ------------------------------------------------------------ */
function renderStatus() {
  const s = DATA.status || {};
  const live = document.getElementById("status-live");
  const ageMin = (Date.now() - Date.parse(DATA.generated_at)) / 60000;
  const fresh = ageMin < 20;
  live.classList.toggle("stale", !fresh);
  live.innerHTML = `<i></i>${fresh ? (s.sweep_done ? "sweep complete" : "sweep running") : "last known state"}`;
  for (const ph of [1, 2, 3]) {
    const el = document.getElementById(`status-phase${ph}`);
    const p = s[`phase${ph}`] || { done: 0, total: 0 };
    el.textContent = `phase ${ph}  ${p.done}/${p.total}`;
    el.style.color = p.total && p.done === p.total ? cssVar("--pass") : "";
  }
  const upd = document.getElementById("status-updated");
  upd.textContent = `updated ${new Date(DATA.generated_at).toLocaleTimeString()} (${
    ageMin < 1 ? "just now" : `${Math.round(ageMin)} min ago`})`;
  const rc = document.getElementById("runs-count");
  if (rc) rc.textContent = `${(DATA.runs || []).length} runs with results`;
}

/* ---- headline scatter plots ------------------------------------------- */
function identityLine(lo, hi) {
  return {
    x: [lo, hi], y: [lo, hi], mode: "lines", showlegend: false,
    line: { color: cssVar("--faint"), width: 1.3, dash: "dash" }, hoverinfo: "skip",
  };
}

function logAxis(title) {
  return {
    type: "log", title: { text: title, font: { size: 12.5 } },
    gridcolor: cssVar("--grid-line"), zeroline: false,
    tickvals: [1, 2, 3, 6, 12, 24, 48, 96],
    range: [Math.log10(0.75), Math.log10(130)],
  };
}

function renderHorizon() {
  const runs = DATA.runs || [];
  const pts = [];
  for (const lang of LANG_ORDER) {
    const info = DATA.langs[lang];
    const n = argmaxN(runs, lang, pickWordTask(runs, lang));
    if (n !== null && info) pts.push({ lang, x: info.mean_len, y: n });
  }
  if (!pts.length) return empty("plot-horizon", "waiting for the first trained models…");
  const traces = [identityLine(0.75, 130)];
  for (const p of pts) {
    traces.push({
      x: [p.x], y: [p.y], mode: "markers+text", text: [p.lang], name: p.lang,
      textposition: "top right", textfont: { color: langColor(p.lang), size: 12.5 },
      marker: { size: 15, color: langColor(p.lang), line: { color: cssVar("--panel-high"), width: 2 } },
      hovertemplate: `${p.lang}: L̄=%{x:.1f}, n*=%{y}<extra></extra>`, showlegend: false,
    });
  }
  Plotly.react("plot-horizon", traces, baseLayout({
    title: { text: "Optimal horizon n* vs mean word length L̄", font: { size: 14 } },
    xaxis: logAxis("mean word length L̄ (tokens)"),
    yaxis: logAxis("optimal MTP horizon n* (word probe)"),
  }), PLOT_CONFIG);
}

function renderMoney() {
  const runs = DATA.runs || [];
  const mi = DATA.mi || {};
  const pts = [];
  for (const lang of LANG_ORDER) {
    if (!mi[lang]) continue;
    const knee = mi[lang].knee;
    const nWord = argmaxN(runs, lang, pickWordTask(runs, lang));
    if (nWord !== null) pts.push({ lang, task: "word", x: knee, y: nWord, sym: "circle" });
    if (lang === "cascade") {
      const phTask = curve(runs, lang, "phrase_tok", {}).ns.length ? "phrase_tok" : "phrase";
      const nPh = argmaxN(runs, lang, phTask);
      if (nPh !== null) pts.push({ lang, task: "phrase", x: knee, y: nPh, sym: "square" });
    }
    if (lang === "glint") {
      const nSh = argmaxN(runs, lang, "shimmer");
      if (nSh !== null) pts.push({ lang, task: "shimmer", x: knee, y: nSh, sym: "diamond" });
    }
  }
  if (!pts.length) return empty("plot-money", "waiting for the first trained models…");
  const traces = [identityLine(0.75, 130)];
  for (const p of pts) {
    traces.push({
      x: [p.x], y: [p.y], mode: "markers+text",
      text: [p.task === "word" ? p.lang : `${p.lang} (${p.task})`],
      textposition: "top right", textfont: { color: langColor(p.lang), size: 11.5 },
      marker: { size: 14, symbol: p.sym, color: langColor(p.lang),
                line: { color: cssVar("--panel-high"), width: 2 } },
      hovertemplate: `${p.lang} ${p.task}: knee=%{x}, n*=%{y}<extra></extra>`, showlegend: false,
    });
  }
  traces.push({
    x: [40], y: [40], mode: "markers+text", text: ["AuriStream (200 ms)"],
    textposition: "bottom right", textfont: { color: cssVar("--ink"), size: 12 },
    marker: { size: 20, symbol: "star", color: "rgba(0,0,0,0)",
              line: { color: cssVar("--ink"), width: 1.6 } },
    hovertemplate: "AuriStream: n=40 ≈ 200 ms ≈ one word<extra></extra>", showlegend: false,
  });
  Plotly.react("plot-money", traces, baseLayout({
    title: { text: "Money plot: MI knee lag vs optimal horizon", font: { size: 14 } },
    xaxis: logAxis("MI knee lag (model-free)"),
    yaxis: logAxis("optimal MTP horizon n*"),
  }), PLOT_CONFIG);
}

/* ---- tuning curves ----------------------------------------------------- */
function renderTuning() {
  const grid = document.getElementById("tuning-grid");
  const runs = DATA.runs || [];
  grid.innerHTML = "";
  for (const lang of LANG_ORDER) {
    const info = DATA.langs[lang] || {};
    const card = document.createElement("div");
    card.className = "plot-card";
    const div = document.createElement("div");
    div.className = "plot";
    div.id = `tuning-${lang}`;
    card.append(div);
    grid.append(card);
    const tasks = [
      ["word", cssVar("--faint"), "word id (pooled)"],
      ["word_tok", langColor(lang), "word id (1-token)"],
    ];
    if (["glint", "rasp"].includes(lang)) tasks.push(["shimmer", cssVar("--aqua"), "shimmer"]);
    if (lang === "cascade") {
      tasks.push(["phrase", cssVar("--violet"), "phrase id (pooled)"]);
      tasks.push(["phrase_tok", cssVar("--violet"), "phrase id (1-token)"]);
    }
    if (lang.startsWith("saga")) tasks.push(["topic", cssVar("--violet"), "topic id"]);
    tasks.push(["boundary", cssVar("--gold"), "boundary AUC"]);
    tasks.push(["position", cssVar("--aqua"), "position-in-word"]);
    const traces = [];
    for (const [task, color, label] of tasks) {
      const { ns, vals } = curve(runs, lang, task);
      if (!ns.length) continue;
      if (Math.min(...vals) >= 0.99) continue; // saturated flat line = clutter
      traces.push({
        x: ns, y: vals, name: label, mode: "lines+markers",
        line: { color, width: 2.4, shape: "spline", smoothing: 0.6 },
        marker: { size: 7, color, line: { color: cssVar("--panel-high"), width: 1.5 } },
        hovertemplate: `${label} @ n=%{x}: %{y:.3f}<extra></extra>`,
      });
    }
    if (!traces.length) {
      div.innerHTML = `<div class="plot-empty">${lang}: training…</div>`;
      continue;
    }
    const shapes = [{
      type: "line", x0: info.pred_nstar, x1: info.pred_nstar, y0: 0, y1: 1,
      yref: "paper", line: { color: langColor(lang), width: 1.2, dash: "dot" },
    }];
    if (info.pred_nstar2) {
      shapes.push({
        type: "line", x0: info.pred_nstar2, x1: info.pred_nstar2, y0: 0, y1: 1,
        yref: "paper", line: { color: cssVar("--faint"), width: 1, dash: "dot" },
      });
    }
    Plotly.react(div.id, traces, baseLayout({
      title: { text: `${lang}  ·  L̄=${info.mean_len ?? "?"}, predicted n*=${info.pred_nstar ?? "?"}`,
               font: { size: 13, color: langColor(lang) } },
      xaxis: { type: "log", tickvals: [1, 2, 3, 6, 12, 24, 48, 96],
               gridcolor: cssVar("--grid-line"), title: { text: "n", font: { size: 11 } } },
      yaxis: { range: [0, 1.03], gridcolor: cssVar("--grid-line") },
      margin: { l: 40, r: 10, t: 40, b: 40 },
      legend: { orientation: "h", y: -0.26, font: { size: 10 } },
      shapes,
    }), PLOT_CONFIG);
  }
}

/* ---- P5 panel ---------------------------------------------------------- */
function renderP5() {
  const row = document.getElementById("p5-row");
  const runs = DATA.runs || [];
  row.innerHTML = "";
  const metrics = [
    ["head1_eval_loss", "head-1 eval loss (nats)", false],
    ["parse_rate", "parse rate of head-1 generations", false],
    ["oracle_ppl", "oracle word PPL (log scale)", true],
  ];
  let any = false;
  for (const [task, label, logy] of metrics) {
    const card = document.createElement("div");
    card.className = "plot-card";
    const div = document.createElement("div");
    div.className = "plot";
    div.id = `p5-${task}`;
    card.append(div);
    row.append(card);
    const traces = [];
    for (const lang of ["morsel", "rumble"]) {
      const { ns, vals } = curve(runs, lang, task);
      if (!ns.length) continue;
      traces.push({
        x: ns, y: vals, name: lang, mode: "lines+markers",
        line: { color: langColor(lang), width: 2.4 },
        marker: { size: 7 },
        hovertemplate: `${lang} @ n=%{x}: %{y:.3f}<extra></extra>`,
      });
    }
    if (!traces.length) { div.innerHTML = `<div class="plot-empty">training…</div>`; continue; }
    any = true;
    Plotly.react(div.id, traces, baseLayout({
      title: { text: label, font: { size: 13 } },
      xaxis: { type: "log", tickvals: [1, 2, 3, 6, 12, 24, 48, 96],
               gridcolor: cssVar("--grid-line"), title: { text: "training horizon n", font: { size: 11 } } },
      yaxis: { type: logy ? "log" : "linear", gridcolor: cssVar("--grid-line") },
      margin: { l: 52, r: 12, t: 40, b: 46 },
    }), PLOT_CONFIG);
  }
  if (!any) row.querySelectorAll(".plot-empty").forEach((e) => (e.textContent = "waiting for generations…"));
}

/* ---- MI curves --------------------------------------------------------- */
function renderMI() {
  const mi = DATA.mi || {};
  const traces = [];
  for (const lang of LANG_ORDER) {
    if (!mi[lang]) continue;
    const m = mi[lang].mi;
    traces.push({
      x: m.map((_, i) => i + 1), y: m, name: `${lang} (knee=${mi[lang].knee})`,
      mode: "lines", line: { color: langColor(lang), width: 2.2 },
      hovertemplate: `${lang} @ lag %{x}: %{y:.4f} bits<extra></extra>`,
    });
  }
  if (!traces.length) return empty("plot-mi", "MI curves pending…");
  Plotly.react("plot-mi", traces, baseLayout({
    xaxis: { type: "log", tickvals: [1, 2, 4, 8, 16, 32, 64, 128],
             gridcolor: cssVar("--grid-line"), title: { text: "lag k (tokens)" } },
    yaxis: { type: "log", gridcolor: cssVar("--grid-line"),
             title: { text: "mutual information (bits)" } },
    legend: { orientation: "h", y: -0.16 },
  }), PLOT_CONFIG);
}

/* ---- capacity + controls ----------------------------------------------- */
function renderCapacity() {
  const runs = DATA.runs || [];
  const langs = ["blip", "morsel", "rumble", "glint", "cascade"];
  const sizes = ["minnow", "trout", "heron"];
  const traces = [];
  for (const size of sizes) {
    const at1 = [], atStar = [];
    for (const lang of langs) {
      const { ns, vals } = curve(runs, lang, pickWordTask(runs, lang, { size }), { size });
      const d = new Map(ns.map((n, i) => [n, vals[i]]));
      at1.push(d.get(1) ?? null);
      const star = DATA.langs[lang]?.pred_nstar;
      let best = null, bestDist = Infinity;
      for (const n of ns) {
        const dist = Math.abs(Math.log(n / star));
        if (dist < bestDist) { bestDist = dist; best = n; }
      }
      atStar.push(best !== null ? d.get(best) : null);
    }
    const alpha = { minnow: 0.45, trout: 0.75, heron: 1.0 }[size];
    traces.push({ x: langs, y: at1, name: `${size} @ n=1`, type: "bar",
                  marker: { color: cssVar("--faint"), opacity: alpha } });
    traces.push({ x: langs, y: atStar, name: `${size} @ n≈n*`, type: "bar",
                  marker: { color: cssVar("--accent"), opacity: alpha } });
  }
  if (!traces.some((t) => t.y.some((v) => v !== null))) {
    return empty("plot-capacity", "phase 2 pending…");
  }
  Plotly.react("plot-capacity", traces, baseLayout({
    title: { text: "P6 capacity substitution: word accuracy by size", font: { size: 14 } },
    barmode: "group",
    yaxis: { range: [0, 1.03], gridcolor: cssVar("--grid-line"), title: { text: "word-probe accuracy" } },
    legend: { orientation: "h", y: -0.2, font: { size: 10 } },
  }), PLOT_CONFIG);
}

function renderControls() {
  const runs = DATA.runs || [];
  const variants = [
    ["none", "mean", "MTP (mean)", cssVar("--accent")],
    ["none", "sum", "loss-agg sum", cssVar("--gold")],
    ["shuffled", "mean", "shuffled offsets", cssVar("--faint")],
    ["past", "mean", "past (t−k)", cssVar("--muted")],
  ];
  const traces = [];
  for (const [control, agg, label, color] of variants) {
    const xs = [], ys = [];
    for (const lang of ["morsel", "rumble"]) {
      const { ns, vals } = curve(runs, lang, "word", { control, agg });
      for (let i = 0; i < ns.length; i++) { xs.push(`${lang} n=${ns[i]}`); ys.push(vals[i]); }
    }
    if (xs.length) traces.push({ x: xs, y: ys, name: label, type: "bar", marker: { color } });
  }
  if (!traces.length) return empty("plot-controls", "phase 3 pending…");
  Plotly.react("plot-controls", traces, baseLayout({
    title: { text: "P0 controls: shuffled / past-prediction word accuracy", font: { size: 14 } },
    barmode: "group",
    yaxis: { range: [0, 1.03], gridcolor: cssVar("--grid-line"), title: { text: "word-probe accuracy" } },
    xaxis: { tickangle: -35, gridcolor: "rgba(0,0,0,0)" },
    legend: { orientation: "h", y: -0.3, font: { size: 10 } },
  }), PLOT_CONFIG);
}

/* ---- predictions + run table ------------------------------------------- */
function renderPredictions() {
  const el = document.getElementById("pred-table");
  el.innerHTML = "";
  for (const p of DATA.predictions || []) {
    const row = document.createElement("div");
    row.className = "pred-row";
    row.innerHTML = `
      <div class="pred-id">${p.id}</div>
      <div class="pred-text">${p.text}${p.detail ? `<small>${p.detail}</small>` : ""}</div>
      <div class="pred-status ${p.status}">${p.status.toUpperCase()}</div>`;
    el.append(row);
  }
}

function renderRunTable() {
  const table = document.getElementById("run-table");
  const runs = [...(DATA.runs || [])].sort((a, b) => a.run.localeCompare(b.run));
  const cols = ["run", "lang", "size", "n", "seed", "control", "loss_agg",
                "word", "word_tok", "boundary", "phrase", "shimmer",
                "parse_rate", "oracle_ppl", "head1_eval_loss"];
  const fmt = (v) => (v === null || v === undefined ? "·" : typeof v === "number" ? (Number.isInteger(v) ? v : v.toFixed(3)) : v);
  table.innerHTML =
    `<thead><tr>${cols.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>` +
    runs.map((r) => `<tr>${cols.map((c) => {
      let v = ["word", "word_tok", "boundary", "phrase", "shimmer"].includes(c) ? probeVal(r, c) : r[c];
      return `<td>${fmt(v)}</td>`;
    }).join("")}</tr>`).join("") + "</tbody>";
}

/* ---- top-level --------------------------------------------------------- */
function renderAll() {
  if (!DATA) return;
  renderStatus();
  renderHorizon();
  renderMoney();
  renderTuning();
  renderP5();
  renderMI();
  renderCapacity();
  renderControls();
  renderPredictions();
  renderRunTable();
}

async function load() {
  try {
    const resp = await fetch(`data.json?t=${Date.now()}`, { cache: "no-store" });
    if (!resp.ok) throw new Error(resp.status);
    DATA = await resp.json();
    renderAll();
  } catch (err) {
    const live = document.getElementById("status-live");
    if (!DATA) {
      live.classList.add("stale");
      live.innerHTML = "<i></i>no data yet — first results incoming";
    }
  }
}

themeToggle.addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("dotling-theme", next);
  renderAll();
});

renderHeroDots();
load();
setInterval(load, REFRESH_MS);
