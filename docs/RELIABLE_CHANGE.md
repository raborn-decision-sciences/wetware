# Change over time: diagnostics and training

Code: `core/bayes.js` (the model), `core/reliable.js` (diagnostic priors), `core/trends.js`
(training games). Shown in the hub under Rig → Results (`core/results.js`). Built 2026-11-24, replacing a
Jacobson–Truax reliable change index (first run against latest, 95%).

## Model

Each measure is a true level that drifts, seen through noise (a local-level model; t in days):

```
y_k        = level(t_k) + practice·[k = 1] + e_k        e_k ~ N(0, noise² + v_k)
level(t_k) = level(t_k−1) + d_k                       d_k ~ N(0, drift × (t_k − t_k−1))
```

- **The question:** how far has the true level moved since the first run? That is the posterior of
  `level(t_n) − level(t_1)`, using every run, not just the first and latest. A Kalman filter on
  the state `[level_t, level_1, practice]` gives it exactly, along with the marginal likelihood
  (a test checks both against brute-force Gaussian conditioning). The first level has a flat
  prior.
- **Shown:** first → latest as scored, the posterior mean change, an **89% interval** (McElreath's
  pointedly arbitrary width), and P(improved).
- **The variances are integrated, not plugged in.** Noise SD and drift are each put on a grid,
  and the posterior is the mixture over the grid weighted by marginal likelihood × prior. With
  the 2–12 runs a probe gets in a year, plugging in point estimates would be overconfident.
- **Drift scales with time,** so a jump between consecutive days reads as noise, while the same
  jump spread across a month can be change.

## Where the priors come from (the empirical Bayes part)

### Diagnostics (`core/reliable.js`)

- **Noise.** The prior is a scaled inverse chi-square on noise², centred on the published
  retest SEM in the table below and worth `NU0 = 4` runs. Your own run-to-run spread outweighs
  it after a handful of runs, which also washes out the mismatches between the published tasks
  and ours. The hub shows the posterior noise next to the prior.
  - **Corsi backward** has no published value. It borrows forward span's SEM, worth 1 run.
  - **Item tests** (matrices, paper folding) use a new parallel form each run. Their noise is the
    known Lord binomial error of each run's own score; there is no free noise term.
- **Drift.** Log-uniform over a drift SD of 0.1 to 3 SEMs per 30 days. This is an assumption, not
  a sourced value. With two runs the likelihood barely constrains drift, so intervals are pulled
  towards no change; that pull fades as runs accumulate.
- **Practice.** A practice offset with prior N(0, SEM²) reaches run k with weight exp(−k): fully on
  the first run, 0.37 on the second, 0.14 on the third. That way, getting used to the task isn't
  read as change, even when it takes a few runs.
- **Trend.** A linear trend with an effectively flat prior (10 SEMs per 30 days). Without it, a
  random walk shrinks large changes towards zero.
- **Item tests:** a free extra noise term (overdispersion) on top of Lord's binomial error,
  with a half-normal prior of scale 0.5 SEM. It is shown as "extra noise".
- **Estimates only after the run-in.** A probe shows an estimate once it has had its run-in and
  one more run, 4 runs in all. Before that, practice and change can't be told apart.
- **How this model was chosen.** It is M1.TOD in `docs/SIMULATION.md`. Round 3 found it failed
  only with a single retest. The confirmatory round 4, on new seeds and with estimates from 4
  runs, found coverage of 0.87–0.95 and null false positives of at most 0.10 in every core cell.
  The round-1 model, with no trend, had shrunk large changes (coverage down to 0.69).
- **Run-in.** Each probe's first 3 runs (`RUNIN` in `core/catalog.js`) are due one a day. They
  use up the steep early practice gain, pin down the practice offset, and give a first read on
  your noise. After that, retests are monthly.

### Training games (`core/trends.js`)

- **Trend.** The model includes a linear trend with an effectively flat prior: one whole tune
  scale per 30 days. Round 2 of the simulation study (`docs/SIMULATION.md`) showed that without
  it, smooth learning curves were shrunk to 43–85% of the gain. With it, estimates are nearly
  unbiased, with coverage of 0.85–0.89.

- **Grids.** Noise SD from 0.01 to 0.4, and drift SD from 0.005 to 0.5 per 30 days, both on the
  0–1 tune scale.
- **Pooled prior.** The prior over the grid is estimated from all modules together: a
  Kiefer–Wolfowitz nonparametric maximum likelihood fitted by EM, mixed with 5% flat so no cell is
  ruled out. Each module's posterior then borrows what the others show about how noisy and how
  changeable scores are, which matters most for modules with few sessions.
  - Pooling starts once 3 modules have at least 5 sessions each. Before that, the prior is flat
    (log-uniform): pooling one or two series would just reuse their own data.
- **Context effects** (sleep, mood and so on) keep their bootstrap, now at 89%.

### Not used: per-run trial error

Every trial is saved, so each run's own standard error could be computed. It isn't used:
- the run-to-run noise above already includes trial noise;
- spans, SART and the item tests have no meaningful within-run standard error.

## Published noise priors

| Probe | Measure | Source | Published values | Ours | Prior noise SD (SEM) |
|---|---|---|---|---|---|
| Choice reaction time | median correct RT | Woods, Wyma, Yund & Herron (2015a), Exp 1 | CRT SD 61.9 / 55.4 / 62.4 ms over 3 weekly sessions (mean 59.9), ICC .89; 140 trials, mean RT | 40 trials | 59.9 × √.11 × √(140/40) = 37.2 ms |
| Corsi blocks | forward span | Woods, Wyma, Herron & Yund (2016), Exp 1 | maximal span before two successive misses: SD 1.32, ICC .68 (weekly, N = 49) | same scoring | 1.32 × √.32 = 0.75 |
| Corsi blocks | backward span | none found | — | — | forward span's 0.75, worth 1 run |
| Digit span | forward span | Woods et al. (2011), Exp 1 | two-error maximum length: SD 0.88, r .39 (5–11 days, N = 30) | same scoring | 0.88 × √.61 = 0.69 |
| Digit span | backward span | Woods et al. (2011), Exp 1 | SD 1.42, r .67 | same scoring | 1.42 × √.33 = 0.82 |
| Stroop | interference (incongruent − congruent) | Hedge, Powell & Sumner (2018), Table 1 | RT cost SEM 21 ms (Study 1, ICC .60) and 24 ms (Study 2, ICC .66); 240 trials per condition; 3 weeks | 40 per condition | √((21² + 24²)/2) × √6 = 55.2 ms |
| Trail alternation | B − A | Woods, Wyma, Herron & Yund (2015b), Exp 2 | within-subject SD over 3 weekly sessions: A 2.67 s, B 5.34 s; 25 circles | 20 circles | √(2.67² + 5.34²) × √(20/25) = 5.34 s |
| SART | commission errors | Robertson et al. (1997), p. 749 | errors SD 4.88, 1-week r .76 (N = 25); 25 no-go trials | 15 no-go | 4.88 × √.24 / 25 per no-go trial × √(25 × 15) = 1.85 |
| Paper folding | correct − wrong/4 | Lord (1957) | — | 16 items | 1.25 × binomial SEM of the number correct (known, per run) |
| Held-out matrices | correct | Lord (1957) | — | 10 items | binomial SEM (known, per run) |

Conversion: published SEM = SD × √(1 − r) (or a reported SEM or within-person SD), multiplied by
√(published trials ÷ our trials). This treats all of the published error as trial noise, so the
prior errs large; your own runs correct it.

## What this means in practice

- **Probe length.** Stroop (doubled to 40 trials per condition) and paper folding (doubled to 16
  items) were lengthened on 2026-11-24, before any real data, cutting their error by about 30%.
  Matrices stay at 10 items (already about 6 minutes), so their intervals stay the widest.
  Repeated runs help all of them, because the model uses every run.
- **Mismatches worth knowing about.** Each source is the closest computerized retest study found:
  - Woods (2015a) is a two-button choice task, not four keys.
  - Woods (2011) presented the digits aloud; ours are visual.
  - Woods (2016) used a 10-square spatial span on a random grid, not a fixed 9-block board.
  With weight on your own runs, these matter less over time.
- **Not built: norms.** Where you sit against a population was left out by choice: norms are easy
  to misread for a self-experimenter, and none match these probes.

## References

- Kiefer, J., & Wolfowitz, J. (1956). Consistency of the maximum likelihood estimator in the presence
  of infinitely many incidental parameters. *Annals of Mathematical Statistics, 27*, 887–906.
- McElreath, R. (2020). *Statistical Rethinking* (2nd ed.). CRC Press.

- Hedge, C., Powell, G., & Sumner, P. (2018). The reliability paradox: Why robust cognitive tasks do
  not produce reliable individual differences. *Behavior Research Methods, 50*, 1166–1186.
  https://doi.org/10.3758/s13428-017-0935-1
- Jacobson, N. S., & Truax, P. (1991). Clinical significance: A statistical approach to defining
  meaningful change in psychotherapy research. *Journal of Consulting and Clinical Psychology, 59*,
  12–19.
- Lord, F. M. (1957). Do tests of the same length have the same standard error of measurement?
  *Educational and Psychological Measurement, 17*, 510–521.
- Robertson, I. H., Manly, T., Andrade, J., Baddeley, B. T., & Yiend, J. (1997). 'Oops!': Performance
  correlates of everyday attentional failures in traumatic brain injured and normal subjects.
  *Neuropsychologia, 35*, 747–758.
- Woods, D. L., Kishiyama, M. M., Yund, E. W., Herron, T. J., Edwards, B., Poliva, O., Hink, R. F., &
  Reed, B. (2011). Improving digit span assessment of short-term verbal memory. *Journal of Clinical
  and Experimental Neuropsychology, 33*, 101–111. https://doi.org/10.1080/13803395.2010.493149
- Woods, D. L., Wyma, J. M., Yund, E. W., & Herron, T. J. (2015a). The effects of repeated testing,
  simulated malingering, and traumatic brain injury on visual choice reaction time. *Frontiers in
  Human Neuroscience, 9*, 595. https://doi.org/10.3389/fnhum.2015.00595
- Woods, D. L., Wyma, J. M., Herron, T. J., & Yund, E. W. (2015b). The effects of aging, malingering,
  and traumatic brain injury on computerized trail-making test performance. *PLoS ONE, 10*,
  e0124345. https://doi.org/10.1371/journal.pone.0124345
- Woods, D. L., Wyma, J. M., Herron, T. J., & Yund, E. W. (2016). The effects of repeat testing,
  malingering, and traumatic brain injury on computerized measures of visuospatial memory span.
  *Frontiers in Human Neuroscience, 9*, 690. https://doi.org/10.3389/fnhum.2015.00690
