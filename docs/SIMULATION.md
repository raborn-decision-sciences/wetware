# Simulation study of the analysis choices

Status: **rounds 1–4 run**, 2026-11-24. Shipped models: study (round 1), training trends (round 2), diagnostics (round 4). The plan was committed before any
simulation ran (5867f5b). The decision rules are unchanged since then. Deviations, results and the
round 2 plan are at the end.

The structure follows ADEMP: aims, data-generating mechanisms, estimands, methods, performance
measures (Morris, White & Crowther, 2019).

**Implementation:**
- **Simulation (`tools/sim/*.js`, Node, no dependencies):** generates the data and runs the
  shipped analysis code (`core/bayes.js`, `reliable.js`, `study.js`, `trends.js`), loaded exactly
  as the app loads it. Runs are seeded and spread across worker threads.
- **Analysis (`tools/sim/analyse.R`, R with nlme, data.table and ggplot2):** fits the frequentist
  comparators to the same saved datasets, computes every performance measure with its Monte Carlo
  SE, and draws the figures.
- **Output:** raw output goes to `tools/sim/out/` (not committed); summaries and figures to
  `docs/sim/`.

**Effect sizes** are in SEM units: the probe's prior noise SD (`docs/RELIABLE_CHANGE.md`). One SEM
converts to a between-person d as SEM ÷ published between-person SD, wherever the source gives
that SD. The results include a conversion table.

## Aims

1. **Diagnostics change** (`reliable.js`):
   - calibration of the 89% intervals and of P(improved);
   - the rate of false "change" when nothing changes;
   - bias and shrinkage;
   - sensitivity to the assumed priors, and to a published SEM that is wrong for the person.
2. **The study** (`study.js`):
   - bias, coverage, power and false positive rate of the own − other difference, for each
     schedule option;
   - robustness when the model's assumptions fail;
   - size and power of the randomization test.
3. **Training trends** (`trends.js`):
   - coverage and error of the change since the first session;
   - whether pooling across modules helps, including when modules differ in noise;
   - behaviour with learning curves that aren't random walks.

## Data-generating mechanisms

### Common: one measure's true level and observations

```
level(t) = base + dir·S·[gain terms](t) + drift(t)
y_k      = level(t_k) − dir·S·practice(k) + noise_k        (then rounded or clamped by type)
```

- `S` is the probe's SEM.
- `dir` is the better direction: +1 when higher is better, −1 when lower is better.
- The noise and the rounding depend on the **measure type**:

| Type | Stands in for | Noise | Rounding |
|---|---|---|---|
| `rt` | choice RT median (S 37.2 ms, base 470 ms) | Normal(0, (ρ·S)²) | none |
| `span` | digit span forward (S 0.69, base 5) | Normal(0, (ρ·S)²) | integer, clamped to 2–9 (ceiling 9) |
| `items` | held-out matrices (10 items, base 4) | Binomial(10, level/10) | inherent |

**Factors common to Aims 1 and 2:**

| Factor | Levels |
|---|---|
| Noise ratio ρ (true noise ÷ published SEM; `rt` and `span` only) | **1**, 0.5, 2 |
| Practice | none; **first run 1 SEM worse**; exponential, 1.5·S·exp(−k/1.5) on run k = 0, 1, 2, … |
| Drift | **none**; random walk with SD 0.5 S per 30 days; seasonal, amplitude 0.5 S over 365 days with random phase |

The **bold** level is the core setting. Every other factor is varied one at a time from the core.

### Aim 1: diagnostics series

- **Runs:** a run-in on days 0, 1 and 2, then monthly retests. The total number of runs n is 2
  (one retest only, on day 30), 6, or 15 (a year).
- **True change:** linear over the series, Δ = 0, 0.5, 1 or 2 S in total, in the better direction.
- **Core grid:** Δ × n × type = 4 × 3 × 3 = 36 cells.
- **One-at-a-time variations:** ρ (2 levels), practice (2), drift (2), each at Δ ∈ {0, 1}, n = 15,
  for all 3 types where they apply. That is 30 more cells.

### Aim 2: the study

- **Times:**
  - A run-in on days −3, −2 and −1 before the start.
  - Then a probe at every probe point of the schedule option, taken uniformly in the 2 days
    before the point.
  - The order of arms is a random draw from the 24 allowed orders. The measure belongs to arm A.
- **Gains:**
  - an arm-specific gain of δ S per period of own-arm training;
  - a non-specific gain of γ S per period of any training, at core γ = 0.
- **Core grid:** δ ∈ {0, 0.25, 0.5, 1, 2} × schedule ∈ {3w, 4w, 6w} × type = 45 cells.
- **One-at-a-time variations** (at δ ∈ {0, 1}, 3w schedule, all 3 types):

| Variation | What changes |
|---|---|
| ρ = 0.5, 2 | noise |
| practice none / exponential | practice |
| drift random walk / seasonal | drift |
| γ = 0.5 | non-specific gain |
| carryover | 50% of an own period's gain rate continues through the following period |
| missed | 20% of probe points skipped at random |
| late | probes up to 7 days after their point instead of 2 days before |
| off-arm | contamination: the arm's probes also gain 15% of δ per period of other-arm training |

  That is 12 variations × 2 × 3 = 72 cells.
- **Randomization test:** a full battery of all 8 probes (10 measures), each with its own type,
  all three arms with the same δ. δ ∈ {0, 0.5, 1} × 3 schedules = 9 cells.

### Aim 3: training trends

- **Each simulated person** has 8 modules, played over 60 days. Module j gets n_j sessions on
  random days, with n_j drawn from {3, …, 40}, so modules differ in how much data they have.
- **Learning curve on the 0–1 tune scale**, with total gain G ∈ {0, 0.05, 0.15} over the 60 days:
  - none (G = 0);
  - linear;
  - exponential approach (most of the gain early);
  - random walk with no fixed gain.
- **Noise:** homogeneous (SD 0.04 in every module) or heterogeneous (SD drawn from 0.01–0.12 per
  module).
- **Grid:** curve × G × noise, without the redundant cells: 14 cells. Each module is analysed.

## Estimands

| Aim | Estimand | Units |
|---|---|---|
| 1 | true level(last run) − true level(first run), excluding practice and noise | the measure's own |
| 2 | δ·S: the gain per period of own-arm training minus per period of other-arm training, in the better direction | the measure's own |
| 3 | true level(last session) − true level(first session) | tune scale |

- **Aim 2 with carryover:** the estimand stays δ·S. Carryover then shows as bias, which is the
  point of that variation.
- **Aim 2 with contamination:** the estimand is (1 − 0.15)·δ·S, the actual difference.

## Methods

### Aim 1

- **M1.0 (shipped):** `reliable.change`, with ν0 = 4, drift 0.1–3 S per 30 days, and a practice
  offset with SD 1 S.
- **Prior variants:**
  - M1.1: ν0 = 2;
  - M1.2: ν0 = 8;
  - M1.3: drift range 0.1–6 S;
  - M1.4: drift range 0.05–1.5 S;
  - M1.5: no practice offset.
- **M1.R (R):** Jacobson–Truax, first run against latest. Published SEM, 89% interval
  `diff ± 1.598·√2·S`; for `items`, Lord's SEM of each run.

### Aim 2

- **M2.0 (shipped):** `study.analyse`, with slope prior SD 1 S per period.
- **Slope prior variants:**
  - M2.1: SD 0.5;
  - M2.2: SD 2;
  - M2.3: effectively flat (SD 100).
- **M2.4:** the plain random walk, contrasting levels at the period boundaries. This is the earlier
  approach, kept in `tools/sim` for comparison.
- **M2.5:** M2.0 without the practice offset.
- **M2.R (R):** segmented GLS: `y ~ first_run + e_own + e_other`, with
  `correlation = corCAR1(form = ~ t)` (`nlme::gls`, ML). The estimand is b_own − b_other, with an
  89% Wald interval.
- **M2.T:** the randomization test over the 24 orders, as shipped, in the full-battery cells.

### Aim 3

- **M3.0 (shipped):** `trends.changeAll`, pooled across modules.
- **M3.1:** the same without pooling (flat prior over the grid).
- **M3.R (R):** the earlier method, the first k against the last k sessions with k = min(5, ⌊n/2⌋).
  Mean difference with an 89% Welch interval.

## Performance measures

For each method and cell:
- bias;
- empirical SE;
- RMSE;
- coverage of the 89% interval, against a nominal 0.89;
- mean interval width;
- **power:** the share of intervals that exclude 0 on the improvement side, in cells with a true
  effect;
- **false positive rate:** the share of intervals that exclude 0 on either side, in null cells,
  against a nominal 0.11;
- **calibration** of P(improved) / P(specific) / P(up): reported probabilities in bins of 0.1
  against the observed share of positive true effects, pooled over the grid's effect sizes. Only
  meaningful pooled over a range of effects, so read with care;
- **randomization test:** the share of p ≤ 1/24, and of p ≤ 3/24.

**Monte Carlo SEs** come from the usual formulas (Morris et al., 2019, Table 6).

**Repetitions:**
- 1,000 per cell for Aims 1–3, which gives a Monte Carlo SE of coverage of about 0.01;
- 200 per cell for the randomization-test cells, which are slow because of 24 refits.

## Decision rules, fixed in advance

A rule fires only when the deviation is larger than 2 Monte Carlo SEs.

1. **Coverage.** If a shipped method's coverage falls below 0.85 in any core cell (no
   misspecification), its priors are revised before use. Coverage under misspecification is
   reported, not acted on, unless it falls below 0.75.
2. **False positives.** If a shipped method's false positive rate in a core null cell exceeds 0.13,
   that is fixed before use.
3. **Prior choices.** If a variant beats the shipped default on RMSE in most core cells without
   losing coverage (staying ≥ 0.87), it becomes the default:
   - slope prior SD;
   - ν0;
   - drift range;
   - the practice offset.
4. **Schedule.** The recommended option stays 3w unless 4w matches it: power within 0.03 at
   δ = 0.5 and 1, and no lower coverage. If 6w covers below 0.85 in core cells, its warning becomes
   stronger, or the option goes.
5. **Pooling.** If unpooled has lower RMSE than pooled in the heterogeneous-noise cells without
   losing coverage, pooling becomes conditional (or goes).
6. **Comparators.** If a frequentist comparator beats the shipped method on both RMSE and
   coverage in most core cells, that is reported prominently, and the shipped method is
   reconsidered.

## Out of scope (possible later)

- **Randomizing the period lengths** (Edgington-style start points) to enlarge the randomization
  test's reference set beyond 24. This changes the design, not just the analysis.
- **Ceiling and floor behaviour** beyond the span ceiling already in the `span` type.

## References

- Morris, T. P., White, I. R., & Crowther, M. J. (2019). Using simulation studies to evaluate
  statistical methods. *Statistics in Medicine, 38*, 2074–2102.

## Deviations from the plan

Recorded before the full run. Only the pipeline check (20 reps per cell) had been run at this
point.

1. **Starting levels for the bounded types.** The plan had span at 6 and items at 6 of 10. The
   pipeline check showed that the larger effects push these into the ceiling: δ = 2 over two
   own periods asks for about 12.5 correct of 10. The ceiling truncates the gain, so the latent
   estimand isn't achievable. Changed to span 5 and items 4 of 10 (the item SEM is the same at 4
   and 6). δ = 2 is still ceiling-limited for `items` (4 + 6.5 > 10), and its cells are
   reported as such. Spans stay below 9 in expectation up to δ = 2.
2. **The arm of each measure type** follows its probe: `rt` is arm A, `span` arm B and `items`
   arm C, not arm A for all. The order is drawn at random, so this is symmetric.
3. **Aim 3 has 12 cells, not 14.** "Without the redundant cells" leaves 12.

## Results (round 1)

**Run.** 188,800 reps in 336 s on 9 workers, plus the R analysis (107,000 GLS fits, 82 of which
fell back to OLS). That is 1,000 reps per cell, and 200 per randomization cell.

- Raw output: `tools/sim/out/` (not committed).
- Summaries: `docs/sim/summary_*.csv`.
- Rule checks: `docs/sim/decisions.csv`.
- Figures: `docs/sim/*.png`.

Monte Carlo SEs are about 0.01 for coverage and power, and about 0.03 for the randomization
cells.

### Decision rules

| Rule | Outcome |
|---|---|
| 1. Coverage ≥ 0.85 in core cells | **Fired for all three shipped methods** (details below) |
| 2. False positives ≤ 0.13 in core null cells | Passed: diagnostics max 0.063, study max 0.029 (both *below* the nominal 0.11, so conservative) |
| 3. A prior variant beats the default | No variant met both conditions. The narrower priors win on RMSE near the null by shrinking, but lose coverage |
| 4. Schedule | 3w gave the most power in every comparison that had any power (randomization test: 0.725 vs 0.62 vs 0.645 at δ = 1). 3w stays recommended. The "6w coverage < 0.85" check fired only in the ceiling-limited `items` δ = 2 cell (deviation 1) |
| 5. Pooling | Not fired: unpooled had lower RMSE in only 17% of heterogeneous-noise cells |
| 6. Comparators | Not fired: neither comparator beat the shipped method on both RMSE and coverage in most cells |

### Aim 2: the study

**The shipped slope prior (SD 1 SEM per period) is far too sceptical:**
- estimates are 40–60% of the true difference;
- power is under 8% for δ ≤ 1;
- coverage drops to 0.72–0.74 at δ = 2.

**A flat slope prior (M2.3) fixes this:**
- estimates are roughly unbiased (0.92–1.26 of the truth);
- coverage is 0.88–0.94 in every core cell (minimum 0.882);
- it holds up under every one-at-a-time misspecification, with coverage 0.87–0.97; the exception
  is `items` with a non-specific gain, 0.85, which is ceiling-related;
- null false positive rates are 0.03–0.12.

Segmented GLS (M2.R) has slightly more power, with coverage just under nominal (0.86–0.90) and
false positives of 0.10–0.14. The plain random walk (M2.4) recovers 10–40% of the truth, which
confirms the switch to slopes.

| 3w, core | δ = 0.25 | 0.5 | 1 | 2 |
|---|---|---|---|---|
| Power, shipped (rt / span / items) | .01 / .01 / .03 | .02 / .03 / .02 | .04 / .04 / .07 | .15 / .11 / .21 |
| Power, flat slope prior | .05 / .06 / .08 | .09 / .10 / .11 | .17 / .19 / .28 | .51 / .48 / .57 |
| Power, segmented GLS | .09 / .09 / .09 | .12 / .15 / .12 | .24 / .24 / .30 | .59 / .56 / .68 |

**The randomization test** (full battery, all arms with the same δ):

| δ | 3w | 4w | 6w | Nominal under H0 |
|---|---|---|---|---|
| 0 | 0.010 | 0.020 | 0.025 | ≤ 0.042 |
| 0.5 | 0.34 | 0.26 | 0.24 | |
| 1 | 0.73 | 0.62 | 0.65 | |

The share of p ≤ 1/24 is valid, and the test is the most powerful tool here, because it pools
all ten measures.

**What the effect sizes mean.** One SEM of our probes is about 0.6 between-person SD for choice
RT, 0.6–0.8 for the spans, 0.4 for SART and 1.5 for Stroop. That is SEM divided by the published
between-person SD; trails and the item tests have no published SD. δ = 0.5 SEM per 3-week period
is therefore about 0.3 d per period, or 0.6 d over a study's two own periods. That is far above
the 0.1–0.2 d that meta-analyses report for transfer. **For realistic transfer effects, the study
is badly underpowered.** It can show a large arm-specific effect, or the absence of one, but not
a small one.

### Aim 1: diagnostics

| Measure | Result |
|---|---|
| Coverage | ≥ 0.85 at Δ ≤ 1 (often 0.95–1.0, i.e. conservative); falls to 0.72–0.84 at Δ = 2 |
| False positives | ≤ 0.063 |
| Bias | Estimates for `rt` and `span` are 55–75% of the true change; `items` is nearly unbiased at n = 15 |
| Power at n = 15 | 16% at Δ = 1, about 50% at Δ = 2 |
| Prior variants | ν0 changed nothing. Wider drift helped a little at n = 2. No variant fixed the shrinkage |
| Jacobson–Truax | Badly biased (1.5–3× the truth), because the practice jump on the first run lands in its difference. Coverage 0.63–0.85 |

### Aim 3: training trends

| Measure | Result |
|---|---|
| Coverage, pooled (shipped) | 0.54–0.85 for real learning curves; 0.97–0.99 under no change |
| Bias | Estimates are 43–85% of the true gain |
| Unpooled | Similar (0.72–0.84) |
| First k vs last k | Better coverage for small gains (about 0.88), worse for large ones |

### Diagnosis

Aims 1 and 3 share a cause. A **local-level (random walk) model shrinks smooth trends:**
- the likelihood barely distinguishes drift values;
- so the log-uniform drift prior, with much of its mass at small drift, pulls the change towards
  zero.

The study had the same problem for the same reason. The phase slopes fixed it there once their
prior was not sceptical.

### Recommendations (for decision)

1. **The study:** switch the slope prior to flat (M2.3). Rule 1 requires a revision, and M2.3 is
   the tested variant that meets coverage everywhere.
2. **Diagnostics and training:** add a trend term, an unknown linear slope with a flat prior, to
   the local-level model. The random walk then only absorbs departures from a trend. That is a
   model change, not a prior change, so it needs a **round 2** of this simulation (Aims 1 and 3,
   same cells, same rules) before it ships.
3. **The study's power:** be explicit in the hub and in `docs/STUDY.md` that only large
   arm-specific effects can show. Possible ways to gain power (each needing its own evaluation):
   - longer probes;
   - more periods;
   - treating the randomization test, which pools every measure, as the primary result.


## Round 2 plan (pre-registered before its full run)

The user chose both recommendations.

**Already applied, on the strength of round 1:**
- The study's slope prior is now flat (`SLOPE_SD = 100`). This is round 1's M2.3, which met rule 1
  in every core cell. Aim 2 isn't rerun.

**What round 2 tests:**
- **The change:** the local-level model gains a linear trend, a change per day with prior SD of
  10 SEMs per 30 days for the diagnostics, and one whole tune scale per 30 days for training. Both
  are effectively flat. `core/bayes.js` `localLevel`, `trendSd`. A test checks it against
  brute-force Gaussian conditioning. It is now the default in `reliable.change` and
  `trends.changeAll`.
- **Rerun:** Aims 1 and 3, with the same cells, seeds and repetitions as round 1.
- **New methods:**
  - M1.0 and M3.0 are now the trend model;
  - M1.N and M3.N are the round-1 defaults without the trend;
  - M1.1–M1.5 apply their prior variants on top of the trend model;
  - M3.1 is unpooled with the trend.

**Rules:**
- **Rules 1–3, 5 and 6** are as before, now also checking false positives for M3.0 in the
  no-change cells.
- **Rule 7 (new):** the trend model stays only if it passes rules 1 and 2, and beats the no-trend
  model on RMSE in most non-null cells. If it fails rule 1 or 2, the trend is removed again and the
  round-1 model ships with its coverage problem documented. If it passes 1 and 2 but loses on RMSE,
  the result is reported, and the trend stays only if its coverage is clearly better.

**Before the full run,** a 20-rep pipeline check of the round-2 tooling ran; only its rule
booleans were printed, as a smoke test.

**Output:** `tools/sim/out2/` and `docs/sim/round2/`.

## Results (round 2)

**Run.** 80,000 reps in 112 s: Aims 1 and 3, with the same cells, seeds and repetitions as round
1. Summaries are in `docs/sim/round2/`.

### Decision rules

| Rule | Outcome |
|---|---|
| 1. Coverage ≥ 0.85 | **Training (M3.0): passed** (min 0.851). **Diagnostics (M1.0): fired**, only for `items` (0.79–0.82 in 3 cells) |
| 2. False positives ≤ 0.13 | **Training: passed** (max 0.129). **Diagnostics: fired**, `items` 0.135–0.159; `rt` and `span` were at most 0.112 |
| 3. Prior variants | None met the conditions |
| 5. Pooling | Not fired. Unpooled matched pooled on RMSE (50% of cells), with coverage a little closer to nominal (0.88–0.90 vs 0.85–0.89) |
| 6. Comparator | Jacobson–Truax better in 0% of cells |
| 7. Trend vs no trend | The trend model lost on RMSE (15% of cells for diagnostics, 30% for training), as expected when the alternative shrinks. **Training:** it passed rules 1 and 2, and its coverage is clearly better, so the **trend stays**. **Diagnostics:** it failed rules 1 and 2, so the **trend is removed again**, as pre-registered |

### What the trend did

| | No trend (round 1) | With trend |
|---|---|---|
| Training: share of the gain recovered | 0.43–0.85 | 0.90–1.00 |
| Training: coverage | 0.54–0.84 | 0.85–0.89 |
| Diagnostics, `rt` / `span`, n = 15: share recovered | 0.70–0.76 | 1.07–1.35 |
| Diagnostics, `rt` / `span`: coverage | 0.72–1.00 | 0.89–0.98 (n = 2: 0.91–0.98) |
| Diagnostics, `items`: coverage | 0.75–0.99 | 0.79–0.87 |
| Diagnostics, `items`: false positives | ≤ 0.063 | 0.135–0.159 |

**With only one retest (n = 2),** the trend model reports the raw difference: 2.7–3.0× the truth at
Δ = 0.5. The planted practice jump (1 SEM) can't be separated from change with two runs, and the
practice prior is centred on 0. The no-trend model hid this by shrinking. Its intervals are wide
enough that coverage holds. This is the run-in's job.

**Under misspecification,** the trend model's coverage drops under exponential practice (`items`
0.67–0.69, `rt` and `span` 0.80–0.84), because a one-run practice offset can't absorb a decaying
practice curve. Under random-walk drift (`items` 0.79–0.80) and with noise twice the published SEM
(0.84–0.85) it drops a little. With half the noise it is conservative (0.96–0.98).

### Where this leaves the shipped models

| Model | State |
|---|---|
| **Study** | Flat slope priors (round 1). Unbiased, nominal coverage, power as reported |
| **Training trends** | Trend on. Passes all rules |
| **Diagnostics** | No trend (the round-1 model). It still shrinks large changes (coverage 0.72–0.84 at Δ = 2), as documented in round 1 |

### Possible round 3 (not pre-registered; for decision)

Turn the trend on for the sourced measures only (`rt`- and `span`-like), where it passed both
rules, and fix the item tests separately. Their error is Lord's binomial SEM with no free noise
term, which leaves no room for misfit. Candidates:
- add a free overdispersion term on top of Lord's error, with a prior;
- give practice a decaying shape, since a one-run offset fails under exponential practice once a
  trend is in the model.

Either needs its own pre-registered run.

## Round 3 plan (pre-registered before its full run)

The user chose to run it. It covers **Aim 1 only** (the diagnostics), with the same cells, seeds
and 1,000 reps per cell as before, run with `SIM_ROUND=3`. Output goes to `tools/sim/out3/` and
`docs/sim/round3/`.

**Candidates.** All are options of `reliable.change`; the defaults are unchanged until selection.

| Method | What it is |
|---|---|
| M1.0 | Shipped: no trend (the round-1 model) |
| M1.TS | Trend for measures with a published SEM only; item tests unchanged |
| M1.TO | Trend for all measures, plus a free overdispersion term for the item tests: extra noise SD on a linear grid 0–1.5 SEM, half-normal prior with scale 0.5 SEM, on top of Lord's error |
| M1.TOD | M1.TO plus decaying practice: practice reaches run k with weight exp(−k/1), so 1, 0.37, 0.14, …. The decay constant is fixed at 1 run, which deliberately differs from the 1.5 in the exponential-practice condition |

The new code paths are checked against brute-force Gaussian conditioning (decaying practice) and
by unit tests (overdispersion, sourced-only trend).

**Comparator:** M1.R, Jacobson–Truax, as before.

**Selection rule (rule 8):**
1. A candidate must pass rules 1 and 2 in every core cell: coverage ≥ 0.85 and null false
   positives ≤ 0.13, each beyond 2 Monte Carlo SEs.
2. Among those that pass, take the highest minimum coverage over the one-at-a-time cells
   (misspecification).
3. Among candidates within 0.02 of that, take the lowest mean RMSE in SEM units over the core
   non-null cells.
4. If no candidate passes, M1.0 stays, with its coverage problem documented.

The selected candidate becomes the default for the diagnostics.

**Before the full run,** a 20-rep pipeline check ran and printed its selection line, as a smoke
test only.

## Results (round 3)

**Run.** 68,000 reps in 41 s (Aim 1). Summaries are in `docs/sim/round3/`; the selection table is
`round3_selection.csv`.

### Selection (rule 8)

| Candidate | Rule 1 (core coverage ≥ 0.85) | Rule 2 (null FP ≤ 0.13) | Minimum core coverage | Maximum null FP | Minimum one-at-a-time coverage | Mean RMSE (SEM) |
|---|---|---|---|---|---|---|
| M1.0 (shipped) | fails | passes | 0.718 | 0.063 | 0.777 | 0.81 |
| M1.TS | fails | passes | 0.752 | 0.112 | 0.777 | 1.11 |
| M1.TO | fails | passes | 0.794 | 0.115 | 0.720 | 1.22 |
| M1.TOD | fails | passes | 0.793 | 0.135 | 0.769 | 1.23 |

**No candidate passed, so M1.0 stays** as pre-registered, with its coverage problem documented:
coverage 0.72–0.83 at Δ = 2, because it shrinks large changes.

**Where each candidate failed:**
- **M1.TS:** only in the item cells. It leaves them on the round-1 model, whose coverage is 0.75
  at n = 6 and Δ = 2. For `rt` and `span` it passes every core cell (0.89–0.98).
- **M1.TO and M1.TOD:** only in the item cells with **one retest** (n = 2, Δ = 2: 0.79). With two
  runs, practice, change and overdispersion can't be told apart. At n = 6 and n = 15, both pass
  for every type: M1.TO 0.86–0.92, M1.TOD 0.88–0.94, with null false positives ≤ 0.115.
- **Decaying practice (M1.TOD)** raised coverage under exponential practice compared with M1.TO
  (`items` 0.77–0.80 vs 0.72–0.75; `rt` and `span` 0.83–0.88 vs 0.80–0.84). The round-1 model
  still did better there (0.82–0.96), because it shrinks.

### Post-hoc observation (not a decision)

All the candidates' failures sit at n = 2: one retest with no run-in. In the app, the run-in
schedules three runs on consecutive days, so n = 2 only happens:
- within the run-in, where the runs are a day apart and change is meaningless;
- if the run-in is skipped.

Suppose the panel showed estimates only from the third run (after the run-in). Then M1.TO and
M1.TOD would pass rules 1 and 2 in the remaining core cells, and by the rule-8 ordering M1.TOD
would be chosen. But that conclusion was reached *after* seeing these results, on these seeds. It
would need its own confirmatory round with **new seeds**, pre-registered with that restriction,
before shipping.

## Round 4 plan (confirmatory; pre-registered before its full run)

The user chose to run it. It tests round 3's post-hoc observation on fresh data.

**Hypothesis.** If diagnostic estimates are shown only after the run-in, M1.TOD passes rules 1
and 2 in every core cell. M1.TOD is the trend, plus overdispersion for the item tests, plus
practice decaying with weight exp(−k/1).

**Design:**
- **Aim 1 only**, with **new seeds** (`sim4:` prefix).
- **Core grid:** Δ ∈ {0, 0.5, 1, 2} × n ∈ **{4, 6, 15}** × type, so 36 cells. n = 4 means the
  run-in plus one monthly retest (days 0, 1, 2, 32), the first estimate the app would show.
  n = 2 is dropped, because the app won't show estimates before the run-in is complete.
- **One-at-a-time cells:** as before, at n = 15.
- 1,000 reps per cell. Run with `SIM_ROUND=4`, output to `tools/sim/out4/` and `docs/sim/round4/`.

**Methods:** M1.0 (shipped) and M1.TOD, plus Jacobson–Truax for reference.

**Rule 9:** M1.TOD is adopted if it passes rule 1 (coverage ≥ 0.85) and rule 2 (null false
positives ≤ 0.13) in every core cell, beyond 2 Monte Carlo SEs. Otherwise M1.0 stays.

**If M1.TOD is adopted:**
- M1.TOD becomes the default in `reliable.change`.
- The Diagnostics panel shows a probe's estimates only once it has more runs than the run-in
  (4 or more).
- The study keeps its round-1 setup, with no trend, overdispersion or decaying practice. Its
  analysis was validated that way, so `reliable.setup` keeps its own defaults unchanged.

**Before the full run,** a 20-rep pipeline check ran; no rule outcomes were looked at.

## Results (round 4)

**Run.** 68,000 reps in 20 s (Aim 1, new seeds). Summaries are in `docs/sim/round4/`.

**Rule 9: M1.TOD passes rules 1 and 2 in every core cell**, with coverage 0.871–0.951 and null false
positives of at most 0.101. The post-hoc observation from round 3 holds on fresh data, so M1.TOD is
adopted, as pre-registered.

| Core cells, n ∈ {4, 6, 15} | M1.0 (round-1 model) | M1.TOD |
|---|---|---|
| Coverage | 0.685–1.000; under 0.85 in 10 cells | 0.871–0.951 |
| Null false positives | ≤ 0.066 (conservative) | 0.055–0.101 |
| Power at Δ = 1, n = 15 (`rt` / `span` / `items`) | .14 / .15 / .32 | .32 / .32 / .39 |
| Share of the true change recovered at Δ = 2 | 0.43–0.96 | 1.04–1.21 |

**What M1.TOD gets wrong.** It overstates small changes: estimates are 1.2–1.7 times the truth at
Δ = 0.5. The fading practice offset doesn't remove all of a 1-SEM first-run jump, and the remainder
reads as improvement. The intervals still cover. Under misspecification its coverage is 0.78–0.99:
lowest under exponential practice (0.78–0.88) and with noise twice the published SEM (0.84–0.88).
Jacobson–Truax, for reference, has false positives around 0.20.

**Applied:**
- `reliable.change` now uses `CHANGE_DEFAULTS = { trend: true, overdisp: true, practiceDecay: 1 }`.
- The Diagnostics panel shows a probe's estimate only from its 4th run.
- `reliable.setup` keeps the round-1 defaults, so the study's analysis is unchanged.

## Round 5 plan (pre-registered before any run, 2026-11-24)

**Question.** Two check-up measures have no published retest data, so their noise prior is
borrowed from a sister measure and given the weight of one run (`nu0 = 1`) instead of four:
- the spatial Stroop's interference (opt-in colour-free Stroop), borrowing the colour Stroop's SEM;
- backward Corsi span, borrowing forward Corsi's SEM.

Earlier rounds never tested a borrowed prior. If the measure's real noise differs from the
borrowed value, do the shipped intervals (`reliable.change`, M1.TOD) still hold?

**Design (Aim 1 machinery, new seeds `sim5:`):**
- **Measures:** `rt-borrow` (probe `dx-stroop-spatial`, continuous, base 45 ms, lower is better)
  and `span-borrow` (probe `dx-corsi`, measure `bwdSpan`, rounded and clamped to 2–9, base 5).
- **ρ, true noise ÷ borrowed SEM:** 0.5, 1, 2, 3. Δ and the practice jump stay in units of the
  borrowed SEM, as in round 1's ρ cells.
- **Δ (true change over the series):** 0, 0.5, 1, 2. **n:** 4, 6, 15 (the app shows estimates
  from run 4). Schedules as round 4: run-in days 0, 1, 2, then monthly.
- **Fixed:** practice is a 1-SEM first-run jump; no drift.
- 2 × 4 × 4 × 3 = **96 cells, 1,000 reps each.**
- **Methods:** the shipped model (M1.TOD with the measure's own `nu0 = 1`). For reference only,
  the same model with `nu0 = 4`, as if the borrowed SEM were published.

**Performance measures** (with Monte Carlo SEs): coverage of the 89% interval; false-clear rate at
Δ = 0 (interval excludes zero); power at Δ = 1 and 2; bias (mean estimate − truth); and, for
`span-borrow`, the share of values at a bound.

**Rule 10, fixed in advance.** For each measure, in every cell with ρ ∈ {0.5, 1, 2} (all Δ, n):
- (a) coverage ≥ 0.85, failing only if coverage + 2 MCSE < 0.85;
- (b) at Δ = 0, false-clear rate ≤ 0.13, failing only if rate − 2 MCSE > 0.13.

ρ = 3 cells and the `nu0 = 4` reference are reported, not judged.

**What follows from rule 10:**
- **Passes at every n:** the borrowed weak prior stays as shipped.
- **Fails only at the smaller n:** that measure's estimate is shown only from the smallest n in
  {6, 15} at which it passes every judged cell (a per-measure minimum number of runs).
- **Fails at n = 15:** report to the user and change nothing until they decide. No tuning of the
  prior after seeing results.

**Before the full run,** a 20-rep pipeline check only (no rule outcomes looked at). Output:
`tools/sim/out5/` (git-ignored) and `docs/sim/round5/`. Run with
`SIM_ROUND=5 node tools/sim/run.js --aims=1b --out=tools/sim/out5`, then
`Rscript tools/sim/analyse_round5.R tools/sim/out5 docs/sim/round5`.

## Results (round 5)

**Run.** 96,000 reps in 32 s. Summaries and the coverage figure are in `docs/sim/round5/`
(`summary_round5.csv`, `rule10.csv`, `round5_coverage.png`).

**Rule 10 fails at n = 4 or 6 and passes at n = 15, for both measures.** All failures are at
ρ = 2, true noise twice the borrowed SEM. At ρ = 0.5 and 1 every cell passes (coverage 0.90–1.00,
null false clears ≤ 0.10).

| Shipped model, judged cells (ρ 0.5–2) | n = 4 | n = 6 | n = 15 |
|---|---|---|---|
| Spatial Stroop: pass? | yes (borderline) | **no**: null false clears 0.154 at ρ = 2 | yes |
| Spatial Stroop: min coverage, max null false clears | 0.830, 0.149 | 0.831, 0.154 | 0.882, 0.118 |
| Backward Corsi: pass? | **no**: coverage 0.823 at ρ = 2, Δ = 0.5 | **no**: null false clears 0.166 at ρ = 2 | yes |
| Backward Corsi: min coverage, max null false clears | 0.823, 0.130 | 0.834, 0.166 | 0.886, 0.114 |

- The spatial Stroop's pass at n = 4 is within Monte Carlo error of the line (null false clears
  0.149, threshold 0.13 + 2 × 0.011). n = 4 and n = 6 behave alike; I read it as one result.
- **Stress (ρ = 3, not judged):** coverage 0.75–0.89, null false clears up to 0.25 at n = 4 and
  0.15 at n = 15.
- **Reference, prior worth 4 runs (not judged):** worse, as expected. Minimum coverage 0.77 and
  null false clears up to 0.22 in the judged cells. The weak weight is doing its job; it just
  needs more runs to learn the noise.
- **Power** at ρ = 1, Δ = 1: 0.16 / 0.23 / 0.33 (spatial Stroop) and 0.10 / 0.25 / 0.34 (backward
  Corsi) at n = 4 / 6 / 15, similar to the published-prior measures in round 4.
- **Bias:** up to 0.43 borrowed SEMs toward improvement, as round 4's overstatement of small
  changes.
- **Bounds:** backward-Corsi values at 2 or 9 were under 1% at ρ ≤ 1, 8% at ρ = 2 and 21% at ρ = 3.

**Analysis bug fixed before reading power.** The first version of `analyse_round5.R` computed
power as `dir × lo > 0`, which is wrong for lower-is-better measures (it gave the spatial Stroop
power near 1). Fixed to round 1's definition. Coverage, false clears and so rule 10 don't use the
direction, so the rule outcome was unaffected.

**Applied, as pre-registered** ("fails only at the smaller n"): both measures' estimates are shown
only from **run 15**, the smallest n in {6, 15} at which they pass every judged cell (`minRuns: 15`
in `core/reliable.js`). Until then the Results view lists them as "needs more runs", saying why.
Forward Corsi and every other probe still show from run 4. The study's analysis is unchanged.
The test-profile visibility check follows the same rule (deviation 6 in `docs/PROFILES.md`).

**What this costs.** On the monthly schedule, run 15 is about a year in (3 run-in runs plus 12
retests); with weekly study probes, about 12 weeks. A better-founded noise value for either
measure (published retest data, or your own judgement) would shorten that, but it needs a new
pre-registered round.
