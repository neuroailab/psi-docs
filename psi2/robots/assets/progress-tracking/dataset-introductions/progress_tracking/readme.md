# Progress tracking

Does a model's progress score increase as a successful manipulation advances?
This study measures **video-order correlation (VOC)** on Robometer's released
out-of-distribution successful episodes. It does not classify failures or
transfer an ABC success threshold.

## Data and examples

Use the six datasets in the released `rbm-1m-ood` collection. Following the
release sampling order, select up to 30 robot rows per dataset with seed 42,
then keep rows labeled successful. The frozen cohort is:

| Dataset | Successful episodes | Used in paired-camera study |
|---|---:|---:|
| USC Trossen | 15 | — |
| MIT Franka | 16 | 6 |
| UTD SO101 | 10 | 10 |
| USC xArm | 11 | — |
| USC Franka | 8 | — |
| USC Koch | 12 | — |
| Total | 72 | 16 |

The main comparison covers all 72 episodes. A separate paired-camera comparison
uses 6 MIT + 10 UTD episodes. Equal released-frame indices pair external and
wrist views; loader provenance and frame counts were checked, but raw capture
timestamps are unavailable. Exact physical synchronization cannot be reverified.
The wrist is assigned to `rgblh`, never `rgbrh`, in the current sweep.

The page shows illustrative successful Trossen, MIT and UTD videos. MIT/UTD
previews show both supplied views. GIFs sample whole encoded episodes uniformly
and use illustrative timing; released video playback does not establish physical
robot time. Examples are not selected by model performance.

Raw release IDs, revisions, hashes and selected rows are in
`/ccn2b/dataset/brd/rwm_progress_tracking/eval3_public/voc_success_v1/protocol.json`.
These are our reproducible release samples, not verified historical author IDs.
This is the OOD collection; the paper's separate ID collection is not covered.

## How inference works

### Our PSI model

Use `psi_0.5_r_abc_v2/model_00820000` and its checkpoint-derived configuration.
At each sampled query, provide the **same episode's exact final external-camera
image** as the goal. This is a hindsight goal from a successful episode, not an
independent reference and not a goal-matching algorithm for failed episodes.

For the main cohort, serialize `rgb0,rgb0^g,dt0`: current external image, exact
goal, then DT. For paired views, use `rgb0,rgblh0,rgb0^g,dt0`, adding the current
left-wrist observation. There is no wrist-goal image. Images resize to 256×336;
select 235/336 patches per image with the fixed seed. Inputs contain 2,351 tokens
(single view) or 3,526 tokens (paired views).

Run a forward pass and restrict next-token logits to valid DT bins. Compute
`score = -sum_b b * softmax(logits/T)[b]`; T=0 uses negative argmax instead.
All reductions are deterministic, not sampled token generations. The best-tested
configurations are T=.3 for full72 and T=.7 for paired16. Temperature and model
selection use these reported cohorts, so this is exploratory, not a held-out
selection claim.

Five query positions span the released episode; the first is moved to frame 4
to support the history ablations. Plot all five, but use the **first four** for
PSI's main VOC, excluding the identical final observation/goal. Actual released
frame positions, not query ordinals, define time. DT is displayed in positive
bins on the right axis but enters the metric as negative distance.

Surprisal/entropy ablations use `rgb0,...,rgb{h-1},rgb{h-1+R}` for h=1,3,5,
where R is the remaining released-frame horizon (minimum one). The final RGB
is the actual goal and is teacher-forced. Native S/H scores the first content
code of each selected goal patch using RGB-local probabilities; earlier goal
tokens condition later ones. We reuse PSI2's native statistics through
`ccwm.rwm.evals.surprisal`. S/H input lengths are 2,349 / 4,699 / 7,049 tokens;
S3/S5 exceed the 4,096-token training context. The older four-code surprisal is
a labeled separate ablation, not the planned matched native all-four S/H test.

### Robometer

Use the official Robometer-4B model and collator, task instruction, and **eight
uniformly sampled external-camera frames from the entire episode**, including
first and final frames. It receives no visual goal or wrist input. One
full-trajectory forward pass produces eight native progress-head expectations;
**all eight outputs** enter VOC at their corresponding sampled-frame positions.
The success head is not the paper's primary VOC score.

This is the author-clarified offline protocol: `use_frame_steps=false`,
`max_frames=8`, all output/target arrays, `last_frame_only=False` in compilation.
See the authors' [command and explanation](https://github.com/robometer/robometer/issues/22#issuecomment-4413819302).
This is not eight causal-prefix queries: the early output scores are computed
with the whole sampled episode supplied. By contrast, the failure-identification
study queries causal prefixes and keeps the last output at each query.

We reuse the cached final-prefix prediction, which is exactly this full-trajectory
input, and verify aggregation against the native compiler. Code revision:
`352d160389daa964788de1ec933d1925f3a6de4f`; checkpoint revision:
`beef63bc914c5c189329d49c6d712d96d632aa34`. Our inference uses batch1 SDPA BF16
and float32 output reduction; the authors' command uses batch32. Native compiler
parity is verified, but historical episode IDs and full runtime parity are not.
Our Robometer full72 VOC is .948649, compared with the reported OOD mean .945;
closeness alone does not establish exact end-to-end reproduction.

## Metric and comparison limits

For each successful episode, compute Pearson correlation between progress score
and actual released-frame index. Undefined constant correlations count as zero.
Average episodes within each dataset, then average dataset means equally: six
for the main study, two for paired16. Do not use pooled correlation or give the
larger datasets extra weight.

PSI uses four metric samples with exact goals; Robometer uses all eight offline
outputs with language. These are each model's own disclosed protocols, not a
same-timestamp or equal-information architecture comparison. VOC measures temporal
alignment: a clock scores one by construction. It does not establish success
recognition, calibrated completion probability or physical-time accuracy.

Current full72 PSI/Robometer VOC: .844464/.948649; paired16: .955544/.937222.
The page presents full72 first, paired16 second, then compact ablation tables.

## Entry points

All module names below have prefix `ccwm.rwm.evals.progress_tracking.eval3`.

| Module | Stages / interface | Role |
|---|---|---|
| `public_voc` | `prepare`, `tokenize`, `score [--shard I --shards N]`, `dino`, `robometer` | Frozen public cohort, original images/codes and baseline inference cache |
| `public_voc_report` | `media`, `report`, `publish` | Source-cache reports/media; publication always delegates to the current main publisher |
| `dt_temperature` | `prepare`, `score [--shard I --shards N]`, `report`, `publish` | Full72 single-view DT temperature sweep |
| `multiview_dt` | See module CLI | Upstream paired-view reconstruction / inputs |
| `multiview_temperature` | `prepare`, `score`, `report`, `publish` | Paired16 rgb versus rgb+rgblh DT sweep |
| `native_entropy_surprisal` | `prepare`, `score [--shard I --shards N]`, `report`, `publish` | Native first-code S/H at histories 1,3,5 |
| `surprisal_temperature` | See module CLI | Historical full-vocabulary four-code temperature ablation |
| `robometer_paper_protocol` | No arguments | Author-offline all-eight-output aggregation and native compiler parity |
| `paired_public_report` | `media` | Build paired observation/video assets; entry builder called by main publisher |
| `public_best_report` | No arguments | Select best-tested PSI; publish full72, paired16 and compact ablation tables |
| `own_protocol_curves` | Imported helper | Independent model series, actual target times and metric-point CSV |

Use progress environment for PSI and reports, baseline environment for native
Robometer/compiler. Reports reuse cached inference. The current publication
chain is `robometer_paper_protocol` → `public_best_report`, with existing media
and completed ablations as prerequisites. The main publisher owns both comparisons.

## Protocol layers and legacy traps

`voc_success_v1/protocol.json` describes the original cached multi-query inputs.
The derived `robometer_paper_protocol_v1/results.json` selects the final full
trajectory cache and uses all eight native progress outputs, following the
authors' `use_frame_steps=false` clarification. Do not infer the current headline
procedure from an old manifest's `paper_query_frames` field name.

`public_voc_audit.py` and the archived .938/.910 outputs refer to earlier
frame-steps-true/common-grid aggregation audits. The current native-compiler
check is `robometer_paper_protocol.py`. Early pilot, marker, matched-reference and dense-transfer runners have been
removed. Historical artifacts and audit receipts remain available.

PSI .844464 vs Robometer .948649 is the full72 result. PSI .955544 vs Robometer
.937222 is paired16. PSI is selected on the reported cohort, and its four metric
queries differ from Robometer's eight offline outputs. See the protocol for
exact interpretation and limitations before calling either model “best”.


## Preview media and cached publication

Run from `/ccn2/u/atlask/ccwm`:

```bash
/tmp/rwm-baselines-venv/bin/python -m ccwm.rwm.evals.progress_tracking.common.dataset_previews progress_tracking
/tmp/rwm-baselines-venv/bin/python -m ccwm.rwm.evals.progress_tracking.progress_tracking.robometer_paper_protocol
/tmp/rwm-progress-venv/bin/python -m ccwm.rwm.evals.progress_tracking.progress_tracking.public_best_report
```

The preview command uses existing videos, not new model inference. Versioned
artifact directories retain `eval3_public/` names for provenance even though the
Python package is now `progress_tracking/`. The [full protocol](../PUBLIC_VOC_PROTOCOL.md),
[score definitions](../docs/SCORES.md), and [runbook](../docs/RUNBOOK.md) describe
raw-data preparation, inference stages and reproducibility limits.

Webpage: [Progress tracking](http://node8-ccn2cluster.stanford.edu:8787/studies/progress-public-transfer).
