# Failure identification

Can a model distinguish a completed manipulation from an incomplete attempt?
This study uses **controlled ABC simulator continuations with matched successful
goal images**. The main metric is terminal success AUROC. A separate calibrated
binary comparison reports failure F1 and class recalls.

## Data and examples

Source data: `/ccn2b/dataset/brd/raw/abc_sim_all/val_sim/`. We use six successful
mug-uprighting demonstrations and branch at 50%, 70% or 90% of each demonstration:

| Continuation | What happens after the branch |
|---|---|
| `replay_control` | Follow the recorded joint targets in the simulator. |
| `hold` | Keep the joint targets from the branch point. |
| `random_walk` | Apply bounded random movements. |

Each continuation has original-arm and goal-pose-arm (`parked`) conditions.
The parked condition adds a continuation toward the successful source's final
arm pose and can increase episode duration. The physics is simulated after the
branch; rendering later replays the saved states without stepping physics.

There are **108 continuations**: 36 development examples from two source scenes,
and 72 test examples from four different scenes. Test labels are 43 successful
and 29 incomplete, supplied by the ABC mug evaluator. Mode names do not assign
labels: a hold/random walk can succeed, and a replay is not guaranteed to do so.
These are evaluator-defined outcomes, not an independent human annotation of
all physical failures. Related branches are correlated, and the four test scenes
have already been inspected. This is an exploratory reused-scene study.

The page introduction shows three real test videos from the same source and
50% branch: successful replay, incomplete hold, and incomplete random walk.
The GIFs sample each complete encoded episode uniformly and use illustrative
playback timing. Full videos and evaluator judgments remain in the results viewer.
Example selection uses condition/outcome, never a model's score.

## Goals and camera inputs

Every branch, including failures, gets its **successful source demonstration's
final top-camera frame** as the goal. We never use an incomplete attempt's own
endpoint as its target. The source scene and pre-branch trajectory are shared.

`rgb` denotes the top/external camera; `rgblh` denotes the synchronized left wrist.
No right-wrist view is used. Native MuJoCo images are 342×256; PSI resizes to
256×336 before quantization. The quantizer makes 16×21 = 336 spatial patches;
235 patches/image (69.94%) are selected with a fixed seed. GIF/video panels show
both full observations before quantization and patch selection. The goal is a
separate top-camera image, not a second wrist view.

## How inference works

### Our PSI model

Checkpoint: `psi_0.5_r_abc_v2/model_00820000`, stored at
`/ccn2b/dataset/brd/checkpoints_atlask/psi_0.5_r_abc_v2/model_00820000/`.
The loader reconstructs and checks the configuration against checkpoint metadata.

At each query, serialize `rgb0,rgblh0,rgb0^g,dt0`. The first two elements are
current observations at the same time. `rgb0^g` is the matched successful goal.
One teacher-forced forward pass predicts the next DT token, with 3,526 input
tokens. Restrict logits to valid DT bins; no output token is sampled:

```text
T > 0: distance = sum_b b * softmax(valid_DT_logits / T)[b]
T = 0: distance = argmax_b valid_DT_logits[b]
terminal success score = -distance
```

Sweep T = 0, .3, .5, .7, 1 using the same saved logits. Select the temperature
on development terminal AUROC separately for `rgb` and `rgb + rgblh`, breaking
ties toward T=1. Both currently select T=1. Single-view DT uses
`rgb0,rgb0^g,dt0` and 2,351 tokens. Its test AUROC is higher than multiview in this
run; the camera ablation makes that visible. DT bins are not seconds or a
calibrated probability of success. Intermediate scores are for visualization;
the main AUROC uses only the terminal score from each continuation.

For the separate binary comparison, select a DT threshold using development
balanced accuracy, with conservative tie-breaking. Freeze it for test: predict
success iff terminal expected DT ≤ 3.1662302017211914 bins. Failure is the
positive class when computing F1, failure recall and success recall.

### Robometer

Use the official Robometer-4B model class and collator with the saved checkpoint,
task language ("Turn the mug right side up.") and **top-camera images only**.
For each queried time, uniformly subsample the causal prefix from frame zero to
the current frame to eight inputs using native sampling/padding helpers. Keep
the last frame's native success-head probability for the current prediction.
Robometer receives neither a visual goal nor the wrist observation.

At the episode endpoint, terminal success-head probability enters AUROC. This
uses no ABC-tuned threshold. The native progress head is retained as an ablation.
This causal-prefix/last-output procedure follows the authors' dense reward
[explanation](https://github.com/robometer/robometer/issues/16#issuecomment-4137870681).
Our sparse 19–24 query timestamps are our choice, not a reproduced paper cadence.

The **separate failure-detector table is a reconstruction**: a five-query window
with Pearson(progress,time) < −.5 raises a failure alarm; success probability
≥.5 at any sampled time overrides it. No alarm predicts success; constant
windows produce no alarm. W9 and final-time-only overrides are sensitivity
checks. The complete quantitative detector code/cadence/override state machine
was not found publicly, so this is not an exact reproduction of the paper's
failure table. DT is development-calibrated; these Robometer settings are paper
example settings without ABC fitting.

Robometer inference uses batch1 SDPA BF16, with float32 output reduction. Code
revision: `352d160389daa964788de1ec933d1925f3a6de4f`; checkpoint revision:
`beef63bc914c5c189329d49c6d712d96d632aa34`. Author runtime/batch32 parity is not
established. See [the repository audit](../ROBOMETER_REPOSITORY_AUDIT.md).

### DINO baseline

Encode the current top image and the same successful goal with DINOv2-base and
its native image processor. Compute cosine similarity between normalized CLS
embeddings. Higher similarity is the success-oriented score; no wrist or task
language is supplied.

## Code, outputs and reproduction

| Module | Responsibility |
|---|---|
| `experiment.py` | Frozen jobs, left-wrist renders, quantization and DT logits/temperatures |
| `media.py` | Exact observation panels and dual-view videos |
| `report.py` | Development selection, terminal AUROC, validation and main publication |
| `detector.py` | DT calibration, Robometer rule reconstruction and failure metrics |
| `overview.py` | Dataset/inference introduction attached before website results |

Run commands from `/ccn2/u/atlask/ccwm`:

```bash
# Cached metrics; no model inference.
/tmp/rwm-progress-venv/bin/python -m ccwm.rwm.evals.progress_tracking.failure_identification.report report
# Build the example GIFs from existing videos, then publish.
/tmp/rwm-baselines-venv/bin/python -m ccwm.rwm.evals.progress_tracking.common.dataset_previews failure_identification
/tmp/rwm-progress-venv/bin/python -m ccwm.rwm.evals.progress_tracking.failure_identification.report publish
/tmp/rwm-progress-venv/bin/python -m ccwm.rwm.evals.progress_tracking.failure_identification.detector
```

Artifacts retain their frozen names under `/ccn2b/dataset/brd/rwm_progress_tracking/`:
`abc_multiview_temperature_v1/` and `abc_paper_detector_v1/`. Inputs also depend on
`synthetic_mugs_native256_v4/` and `episode_curves_abc_v1/`. Renaming the Python
package does not rename or regenerate these experiment records.

See the [complete protocol](../docs/ABC_PROTOCOL.md), [shared score equations](../docs/SCORES.md),
and [runbook](../docs/RUNBOOK.md) for full inference stages, environments,
resume/overwrite behavior, input hashes and checks. The webpage is
[Failure identification](http://node8-ccn2cluster.stanford.edu:8787/studies/progress-abc-outcomes).
