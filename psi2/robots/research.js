
'use strict';
const content = document.getElementById('content');
const sync = document.getElementById('sync');
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeURL = value => { try { const u = new URL(ROBOT_SITE.url(value), location.href); return ['http:', 'https:'].includes(u.protocol) ? esc(u.href) : '#'; } catch { return '#'; } };
const labels = {incomplete:'Incomplete',in_progress:'In progress',done:'Done'};
const normalizeStatus = status => ({planned:'incomplete',running:'in_progress',results:'done',complete:'done'}[status] || status);
const badge = status => `<span class="badge ${esc(normalizeStatus(status))}">${esc(labels[normalizeStatus(status)] || status)}</span>`;
const trackerStatus = item => item.tasks.length && item.tasks.every(t=>t.status==='done') ? 'done' : item.tasks.some(t=>['done','in_progress'].includes(t.status)) ? 'in_progress' : 'incomplete';
const trackerEvaluations = item => (item.evaluations || []).flatMap(e=>[e,...trackerEvaluations(e)]);
const trackerItem = (data,id) => {
 const items = data.tracker?.items || [];
 const direct = items.find(item=>item.study_id===id);
 if (direct) return direct;
 for (const item of items) {
  const evaluation = trackerEvaluations(item).find(e=>e.study_id===id);
  if (evaluation) {
   const ids = new Set([id,...trackerEvaluations(evaluation).map(e=>e.study_id)]);
   return {...evaluation, group:item.group, tasks:item.tasks.filter(t=>ids.has(t.evaluation_id))};
  }
 }
};
const studyStatus = (data,s) => trackerItem(data,s.id) ? trackerStatus(trackerItem(data,s.id)) : normalizeStatus(s.status);
const list = values => `<ul>${values.map(v => `<li>${esc(v)}</li>`).join('')}</ul>`;
const updates = values => values.map(u => `<div class="update"><time>${esc(u.date)}</time><p>${esc(u.text)}</p></div>`).join('');
const studyURL = s => s.href || `/studies/${encodeURIComponent(s.id)}`;
let lastRevision = null;
function studyCard(s, data) {
 const children = data.studies.filter(child => child.parent === s.id && (!s.featured_children || s.featured_children.includes(child.id)));
 if (!children.length) return card(s);
 return `<div class="study-family">${card(s)}<div class="child-studies" aria-label="${esc(s.title)} evaluations">${children.map(child => `<a class="child-study" href="${safeURL(studyURL(child))}"><span>${esc(child.title)}</span>${badge(child.status)}<span aria-hidden="true">→</span></a>`).join('')}</div></div>`;
}
function card(s) {
 const hasResults = s.status === 'results' || s.status === 'complete' || s.results.length > 0;
 return `<a class="study-card" href="${safeURL(studyURL(s))}"><div class="card-top">${badge(s.status)}<span class="arrow" aria-hidden="true">↗</span></div><h4>${esc(s.title)}</h4><p>${esc(s.summary)}</p><div class="card-bottom"><span>${esc(s.environment)}</span><span class="${hasResults ? 'available' : ''}">${hasResults ? 'Explore results' : 'View study plan'} →</span></div></a>`;
}
function trackerChecklist(data,item) {
 if (item.evaluations?.length) return item.evaluations.map((evaluation,index)=>{
  const nested = trackerItem(data,evaluation.study_id);
  const study = data.studies.find(s=>s.id===evaluation.study_id);
  return `<section class="tracker-evaluation" data-evaluation-id="${esc(evaluation.study_id)}"><div class="tracker-evaluation-heading"><div><div class="eyebrow">${esc(evaluation.label || 'Evaluation')} ${index+1}</div><h4><a href="${safeURL(studyURL(study))}">${esc(evaluation.title)}</a></h4></div>${badge(trackerStatus(nested))}</div><p class="tracker-purpose">${esc(evaluation.description)}</p>${trackerChecklist(data,nested)}</section>`;
 }).join('');
 return `<ul class="tracker-tasks" aria-label="${esc(item.title)} tasks">${item.tasks.map(task=>{
  const target = data.studies.find(s=>s.id===task.study_id);
  const url = task.href || (target ? studyURL(target)+(target.href ? '' : '#results') : '#');
  return `<li class="tracker-task" data-task-id="${esc(task.id)}" data-status="${esc(task.status)}"><span class="task-icon ${esc(task.status)}" aria-hidden="true">${task.status==='done' ? '✓' : task.status==='in_progress' ? '◔' : '○'}</span><div class="task-description"><span>${esc(task.title)}</span>${task.note ? `<p>${esc(task.note)}</p>` : ''}</div>${badge(task.status)}<a class="task-link" href="${safeURL(url)}" aria-label="${esc(task.status==='done' ? 'Results for ' : 'Study page for ')}${esc(task.title)}">${task.status==='done' ? 'Results' : 'Study page'} <span aria-hidden="true">→</span></a></li>`;
 }).join('')}</ul>`;
}
function trackerGoal(data,item,index) {
 const study = data.studies.find(s=>s.id===item.study_id);
 const done = item.tasks.filter(t=>t.status==='done').length;
 return `<article class="tracker-goal" data-goal-id="${esc(item.study_id)}" data-status="${trackerStatus(item)}"><div class="tracker-goal-heading"><div><div class="eyebrow">Experiment ${index+1}</div><h4><a href="${safeURL(studyURL(study))}">${esc(item.title)}</a></h4></div>${badge(trackerStatus(item))}</div><p class="tracker-purpose">${esc(item.description)}</p>${trackerChecklist(data,item)}<div class="tracker-goal-footer"><span>${done} of ${item.tasks.length} tasks done</span><a href="${safeURL(studyURL(study))}">Results & plan <span aria-hidden="true">→</span></a></div></article>`;
}
function home(data) {
 const items = (data.tracker?.items || []).filter(item=>!item.hidden);
 const tasks = items.flatMap(item=>item.tasks);
 const done = tasks.filter(t=>t.status==='done').length;
 document.title = 'RWM · Project tracker';
 return `<section class="tracker-hero"><div><div class="eyebrow">Robot world model</div><h1>Project tracker</h1><p class="intro">The experiments we need to run, what’s finished, and where to find the results.</p></div><a class="outline-button" href="${safeURL(data.source)}" target="_blank" rel="noopener">Original plan ↗</a></section>
 <div class="tracker-summary" aria-label="Experiment status summary"><div><b>${items.length}</b><span>Experiments</span></div>${['incomplete','in_progress','done'].map(status=>`<div data-summary-status="${status}"><b>${items.filter(item=>trackerStatus(item)===status).length}</b><span>${labels[status]}</span></div>`).join('')}</div>
 <div class="tracker-completion"><span><strong>${done} of ${tasks.length}</strong> tasks done</span><progress value="${done}" max="${tasks.length || 1}" aria-label="Completed project tasks">${done} of ${tasks.length}</progress><span class="subtle">Updated ${esc(data.tracker?.updated || data.updated)}</span></div>
 <section id="goals"><div class="section-top"><h2>Experiments & tasks</h2><div class="tabs">${data.groups.map(g=>`<a href="#${esc(g.id)}">${esc(g.title.replace('Model as ',''))} <span aria-hidden="true">↓</span></a>`).join('')}</div></div>
 ${data.groups.map(g=>`<section class="research-group tracker-group" id="${esc(g.id)}" aria-labelledby="group-${esc(g.id)}"><div class="group-info"><div class="group-number">/${esc(g.number)}</div><h3 id="group-${esc(g.id)}">${esc(g.title)}</h3><p>${esc(g.question)}</p></div><div class="tracker-goals">${items.filter(item=>item.group===g.id).map((item,index)=>trackerGoal(data,item,index)).join('')}${g.id==='progress' ? '<a class="tracker-history" href="/studies/progress-tracking">All progress evaluations & earlier experiments →</a>' : ''}</div></section>`).join('')}</section>
 <section class="tracker-updates" id="updates"><h2>Project updates</h2>${updates(data.updates)}</section>`;
}
function result(r) {
 let media = '';
 if (r.type === 'score_guide') media = `<div class="metric-table-wrap"><table class="score-guide-table"><thead><tr><th>Method</th><th>Inputs & equation</th><th>Conditioning frame sequence</th><th>What it measures</th><th>Predict complete when…</th></tr></thead><tbody>${r.rows.map(row=>`<tr><th scope="row">${esc(row.method)}</th><td><small>${esc(row.inputs)}</small><code>${esc(row.equation)}</code></td><td class="score-conditioning"><code>${esc(row.conditioning || '')}</code><small>${esc(row.conditioning_note || '')}</small></td><td>${esc(row.meaning)}</td><td><code>${esc(row.decision)}</code></td></tr>`).join('')}</tbody></table></div><p class="subtle score-conditioning-legend">${esc(r.conditioning_legend || '')}</p><details class="score-guide-notes"><summary>Notation, exact scoring details, calibration and fusion parameters</summary>${list(r.notes)}${r.fit_details.map(f=>`<pre>${esc(f)}</pre>`).join('')}</details>`;
 if (r.type === 'benchmark_comparison') media = `<img class="benchmark-summary-plot" src="${safeURL(r.figure_url)}" alt="${esc(r.figure_alt)}"><div class="episode-curves" data-curve-url="${safeURL(r.curve_url)}">Loading episode curves…</div>`;
 if (r.type === 'episode_curves') media = `<div class="episode-curves" data-curve-url="${safeURL(r.url)}">Loading episode curves…</div>`;
 if (r.type === 'metrics_table') media = `<div class="metric-table-wrap"><table class="metric-table${r.wrap ? ' wrap' : ''}"><thead><tr>${r.columns.map(c=>`<th scope="col">${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${r.rows.map(row=>`<tr>${r.columns.map(c=>`<td${row.best?.includes(c.key) ? ' class="metric-best" title="Highest value in this column"' : ''}>${row.best?.includes(c.key) ? '<strong>' : ''}${esc(row[c.key] ?? '—')}${row.best?.includes(c.key) ? '</strong>' : ''}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
 if (r.type === 'image') media = `<img src="${safeURL(r.url)}" alt="${esc(r.caption || r.title)}" loading="lazy">`;
 if (r.type === 'video') media = `<video controls preload="metadata" playsinline>${r.webm_url ? `<source src="${safeURL(r.webm_url)}" type="video/webm">` : ''}<source src="${safeURL(r.url)}" type="video/mp4"></video>${r.review ? `<div class="review-actions"><button type="button" data-video-tail="10">Play last 10 seconds</button><button type="button" data-video-tail="0">Play from start</button><a href="${safeURL(r.url)}" target="_blank" rel="noopener">Open full video ↗</a></div><details class="evaluator-note"><summary>Show evaluator judgment</summary><p>${esc(r.evaluator)}</p></details>` : ''}`;
 if (r.type === 'link') media = `<a href="${safeURL(r.url)}" target="_blank" rel="noopener">${esc(r.label || 'Open result')} ↗</a>`;
 const explanation = r.explanation ? `<div class="result-explanation"><h4>${esc(r.explanation.title)}</h4>${r.explanation.paragraphs.map(p=>`<p>${esc(p)}</p>`).join('')}<div class="metric-table-wrap"><table class="metric-table wrap"><thead><tr>${r.explanation.columns.map(c=>`<th scope="col">${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${r.explanation.rows.map(row=>`<tr>${r.explanation.columns.map(c=>`<td${row.best?.includes(c.key) ? ' class="metric-best" title="Highest value in this column"' : ''}>${row.best?.includes(c.key) ? '<strong>' : ''}${esc(row[c.key] ?? '—')}${row.best?.includes(c.key) ? '</strong>' : ''}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p>${esc(r.explanation.note)}</p></div>` : '';
 const details = r.details ? `<details class="result-methods"><summary>${esc(r.details.title || 'Protocol and downloads')}</summary>${(r.details.paragraphs || []).map(p=>`<p>${esc(p)}</p>`).join('')}${(r.details.links || []).map(l=>`<p><a href="${safeURL(l.url)}">${esc(l.label)}</a></p>`).join('')}</details>` : '';
 return `<article class="result-item${r.review ? ' video-review' : ''}"${r.id ? ` id="${esc(r.id)}"` : ''}><h3>${esc(r.title)}</h3>${r.date ? `<span class="subtle">${esc(r.date)}</span>` : ''}${r.text ? `<p>${esc(r.text)}</p>` : ''}${media}${r.caption ? `<p class="subtle">${esc(r.caption)}</p>` : ''}${explanation}${details}</article>`;
}

function studyIntroduction(info) {
 if (!info) return '';
 const playing = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 return `<section class="study-introduction panel" id="dataset" aria-labelledby="dataset-title" data-preview-playing="${playing}">
  <div class="section-top"><div><div class="eyebrow">Dataset & evaluation</div><h2 id="dataset-title">${esc(info.heading)}</h2></div><a href="#results">Jump to results ↓</a></div>
  <p class="dataset-description">${esc(info.description)}</p>
  <ul class="dataset-facts">${info.facts.map(f=>`<li>${esc(f)}</li>`).join('')}</ul>
  <div class="dataset-preview-heading"><h3>Example episodes</h3><button type="button" class="preview-toggle" data-preview-toggle aria-pressed="${playing}">${playing ? 'Pause GIFs' : 'Play GIFs'}</button></div>
  <div class="dataset-examples">${info.examples.map(e=>`<figure class="dataset-example"><img src="${safeURL(playing ? e.gif_url : e.poster_url)}" data-gif-url="${safeURL(e.gif_url)}" data-poster-url="${safeURL(e.poster_url)}" alt="${esc(e.title+' · '+e.task)}" loading="lazy" decoding="async"><figcaption><h4>${esc(e.title)}</h4><p class="example-task">${esc(e.task)}</p><p>${esc(e.caption)}</p><button type="button" class="preview-inspect" data-preview-episode="${esc(e.episode_id)}" data-result-id="${esc(e.result_id)}">Inspect this episode ↓</button></figcaption></figure>`).join('')}</div>
  <p class="subtle dataset-preview-note">${esc(info.preview_note)}</p>
  <h3>How the models see each episode</h3><div class="dataset-inference">${info.methods.map(m=>`<div><h4>${esc(m.name)}</h4><code>${esc(m.sequence)}</code><p>${esc(m.text)}</p></div>`).join('')}</div>
  <p class="subtle dataset-limitations">${esc(info.note)}</p><a href="${safeURL(info.readme_url)}">Full dataset & inference README ↗</a>
 </section>`;
}

function detail(data,s) {
 const group = data.groups.find(g=>g.id===s.group);
 const parent = data.studies.find(study=>study.id===s.parent);
 const children = data.studies.filter(study=>study.parent===s.id);
 document.title = `${s.title} · RWM`;
 return `<div class="breadcrumbs"><a href="/#goals">Project tracker</a> / <a href="/#${esc(group.id)}">${esc(group.title)}</a>${parent ? ` / <a href="${safeURL(studyURL(parent))}">${esc(parent.title)}</a>` : ''}</div><section class="study-hero"><div class="eyebrow">${esc(group.title)} / ${s.compact ? 'Results' : 'Study plan'}</div><h1>${esc(s.title)}</h1><p class="intro">${esc(s.introduction?.question || s.summary)}</p><div class="study-meta">${badge(studyStatus(data,s))}<span>${esc(s.environment)}</span></div></section>
 ${trackerItem(data,s.id) ? `<section class="tracker-detail" aria-labelledby="task-checklist"><div class="section-top"><h2 id="task-checklist">Task checklist</h2><a href="/#${esc(s.group)}">Back to tracker →</a></div>${trackerChecklist(data,trackerItem(data,s.id))}</section>` : ""}
 ${studyIntroduction(s.introduction)}
 ${s.compact ? '<details class="panel"><summary>Protocol and study plan</summary>' : ''}<div class="detail-grid"><div><section class="panel"><h2>The plan</h2><ol>${s.plan.map(v=>`<li>${esc(v)}</li>`).join('')}</ol></section><section class="panel"><h2>Details to define</h2>${list(s.questions)}<p class="subtle">Initial outline · Protocol will be fleshed out before the study.</p></section></div><section class="panel"><div class="eyebrow">What we want to show</div><h2>Planned evidence</h2><ul class="output-list">${s.outputs.map(v=>`<li>${esc(v)}</li>`).join('')}</ul></section></div>${s.compact ? '</details>' : ''}
 ${children.length && !s.compact ? `<section class="results-block" id="evaluations"><div class="section-top"><h2>Evaluations & results</h2><span class="subtle">Results organized by evaluation</span></div><div class="study-grid">${children.map(card).join('')}</div></section>` : ''}
 ${s.planning_notes?.length ? `<section class="results-block" id="planning" aria-labelledby="planning-title"><div class="section-top"><h2 id="planning-title">Comparison design & training plan</h2><span class="subtle">Proposed protocol · Not measured results</span></div>${s.planning_notes.map(result).join('')}</section>` : ''}
 ${!children.length || s.results.length || trackerItem(data,s.id) ? `<section class="results-block" id="results"><div class="section-top"><h2>Results</h2><span class="subtle">${s.results.length ? `${s.results.length} published entries` : 'Awaiting study results'}</span></div>${s.results.length ? s.results.map(result).join('') : '<div class="pending"><div class="eyebrow">Study placeholder</div><h3>No results yet</h3><p>This study is planned. Figures, comparisons, and rollout videos will be added here as the work progresses.</p></div>'}</section>` : ''}
 ${s.compact ? '<details class="panel"><summary>Study updates</summary>' : ''}<section class="results-block"><h2>Study updates</h2>${updates(s.updates)}</section>${s.compact ? '</details>' : ''}<p><a class="outline-button" href="${parent ? safeURL(studyURL(parent)) : '/#'+esc(group.id)}">← Back to ${esc(parent ? parent.title : group.title.toLowerCase())}</a></p>`;
}
async function refresh() {
 try {
  const response = await fetch(ROBOT_SITE.url('/api/studies'), {cache:'no-store'});
  if (!response.ok) throw new Error('Unable to load study data');
  const data = await response.json();
  if (data.revision !== lastRevision) {
   const pagePath = ROBOT_SITE.path();
   const slug = pagePath.startsWith('/studies/') ? decodeURIComponent(pagePath.split('/')[2]) : null;
   const s = data.studies.find(s=>s.id===slug);
   const firstLoad = lastRevision === null;
   content.innerHTML = slug ? (s ? detail(data,s) : '<h1>Study not found</h1><a href="/">Return to goals & plans</a>') : home(data);
   ROBOT_SITE.rewrite(content);
   lastRevision = data.revision;
   if (typeof hydrateEpisodeCurves === "function") hydrateEpisodeCurves();
   if (firstLoad && location.hash) requestAnimationFrame(()=>document.getElementById(location.hash.slice(1))?.scrollIntoView());
  }
  sync.textContent = ROBOT_SITE.isStatic ? `Published · ${data.exported_at?.slice(0,10) || data.updated}` : 'Live · checks every 15s';
  sync.title = ROBOT_SITE.isStatic ? `Snapshot exported ${data.exported_at}. Updates appear after the next publication.` : `Last checked: ${new Date().toLocaleTimeString()}`;
  sync.classList.remove('error');
 } catch(error) {
  sync.textContent = ROBOT_SITE.isStatic ? 'Snapshot unavailable · try reloading' : 'Updates disconnected · retrying'; sync.classList.add('error');
  if (lastRevision === null) { content.innerHTML = '<div class="error-panel"><h1>Journal temporarily unavailable</h1><p>Could not load the study plans. Retrying automatically.</p><button id="retry">Try again</button> <a href="/libero">Open LIBERO results</a></div>'; document.getElementById('retry').onclick = refresh; }
  if (ROBOT_SITE.isStatic && lastRevision === null) content.querySelector('p').textContent = 'Could not load the published study plans. Try again or reload this page.';
  ROBOT_SITE.rewrite(content);
 }
}
// Keep previously shared LIBERO section links working at the old root URL.
const legacySections = ['sim-500stem','dt-mv-capacity','four-suite','video-viewer','per-bucket-loss','success-vs-loss','per-task-group','ood-heatmap'];
function redirectLegacySection() {
 if (ROBOT_SITE.path() !== '/' || !legacySections.includes(location.hash.slice(1))) return false;
 location.replace(ROBOT_SITE.url('/libero'+location.hash));
 return true;
}
window.addEventListener('hashchange', redirectLegacySection);
if (!redirectLegacySection()) {
 refresh();
 if (!ROBOT_SITE.isStatic) {
  setInterval(()=>{if(!document.hidden)refresh();},15000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
 }
}

content.addEventListener('click', async event => {
 const button = event.target.closest('[data-video-tail]');
 if (!button) return;
 const video = button.closest('.result-item').querySelector('video');
 if (video.error) return;
 if (video.readyState < 1) await new Promise(resolve => video.addEventListener('loadedmetadata', resolve, {once:true}));
 document.querySelectorAll('video').forEach(v => { if (v !== video) v.pause(); });
 const seconds = Number(button.dataset.videoTail);
 video.currentTime = seconds ? Math.max(0, video.duration - seconds) : 0;
 try { await video.play(); } catch (_) { video.focus(); }
});


content.addEventListener('click', event => {
 const toggle = event.target.closest('[data-preview-toggle]');
 if (toggle) {
  const section = toggle.closest('.study-introduction');
  const playing = section.dataset.previewPlaying !== 'true';
  section.dataset.previewPlaying = String(playing);
  section.querySelectorAll('[data-gif-url]').forEach(img => { img.src = playing ? img.dataset.gifUrl : img.dataset.posterUrl; });
  toggle.textContent = playing ? 'Pause GIFs' : 'Play GIFs';
  toggle.setAttribute('aria-pressed', String(playing));
  return;
 }
 const inspect = event.target.closest('[data-preview-episode]');
 if (!inspect) return;
 const result = document.getElementById(inspect.dataset.resultId);
 const select = result?.querySelector('[aria-label="Select episode"]');
 const option = select && [...select.options].find(o => o.dataset.episodeId === inspect.dataset.previewEpisode);
 if (option) { select.value = option.value; select.dispatchEvent(new Event('change', {bubbles:true})); }
 result?.scrollIntoView({behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block:'start'});
});
