# The ABCABC study

Code: `core/study.js`, with the model in `core/bayes.js` (`phaseSlopes`). The study is optional:
set it up on the Ops tab, and see its results under Rig → Results. Built 2026-11-24.

## Question

Does training transfer to the untrained diagnostic probes, and only to the domains you trained?
There's no control group, so the comparison is within you: each probe is measured while its own
domain is being trained and while other domains are.

## Design

**Arms.** The domains the probes measure split into three arms:

| Arm | Domains | Probes | Training modules |
|---|---|---|---|
| A · Speed & control | CLOCK, OPTICS, FIREWALL | Choice RT, Stroop, SART | Firewall, Flashpoint, Fence, Ghost Trace, Night Watch |
| B · Memory & spatial | RAM, GYRO | Corsi, digit span, paper folding | Packet Echo, Hardpoint, Heist Ledger, Buffer Overflow, Black Market, Lockpick, Trace |
| C · Switching & reasoning | SCHEDULER, INFERENCE | Trails, matrices | Context Switch, Cipher Matrix, Rule Forge, Checksum, Informant, Double Cross |

- **No module trains two arms.** Four modules train two probed domains at once (Firewall,
  Flashpoint, Heist Ledger, Rule Forge), so each of those pairs stays in one arm. A test checks it.
- **Some modules belong to no arm.** Safehouse, Bookie, Relay, Lexicon Breach, ID Spoof, Burn-In,
  Pulse and Dead Man's Switch train domains no probe measures. They stay available in every
  period, so Safehouse's dead drops keep running.

**Order.** There are six periods: two cycles of A, B and C. The order is drawn at random when the
study starts, with each cycle a random permutation and no arm twice in a row. That gives 24
possible orders.

**Schedule.** This is a setting, chosen at the start:

| Option | Periods | Probes | Total | Probe points per period |
|---|---|---|---|---|
| Default | 3 weeks | weekly | 18 weeks | 3 |
| | 4 weeks | every 2 weeks | 24 weeks | 2 |
| | 6 weeks | every 3 weeks | 36 weeks | 2 |

- The longer options say in the hub that their estimates are less precise.
- A probe point opens 2 days before its date. Any run from then on counts.
- At the start, a probe needs a run only if its last one is more than a week old.
- The run-in (3 runs of every probe) must be finished before a study can start.
- After the study, probes go back to monthly.

**Contract.** By default, the daily contract follows the study: 2 modules from the current arm,
plus 1 from no arm. Priorities such as due dead drops come first. You can switch this off.

**Off-plan play.** Starting another arm's module during a period asks first. Such sessions are
counted per period on the study panel and in the results.

**Ending.** A study can be ended early; the results keep the periods completed so far. Setting up
a new study moves the old one to `studyHistory` state. Both are kept in exports.

## Analysis

**Model.** Per probe measure, this is the local-level model of the diagnostics
(`docs/RELIABLE_CHANGE.md`) plus two slopes: an interrupted time series.

```
level(t_k) = level(t_k−1) + b_own·Δe_own + b_other·Δe_other + random walk
```

- `e_own(t)` and `e_other(t)` are the periods of own-arm and other-arm training completed by time
  t.
- `b_own − b_other` is the arm-specific gain per period of training.
- Retest practice and slow drift (sleep, season, motivation) affect own and other periods alike,
  so they drop out of the difference. The random walk keeps absorbing what's left.
- The noise, drift and practice priors are those of the diagnostics.
- The slopes have flat priors. A sceptical prior (SD 1 SEM per period) shrank estimates to about
  45% and left almost no power; the simulation study showed this (`docs/SIMULATION.md`).
- Results are shown in the better direction (positive means improvement): the difference with an
  89% interval, P(specific) = P(b_own > b_other), and both slopes.

**Why slopes and not just the random walk.** A random walk has one drift rate for the whole study.
It smears a change across neighbouring periods, which dilutes the own-against-other contrast: in
the simulation study it recovered only 10–40% of the truth. Round 1 of that study
(`docs/SIMULATION.md`, 1,000 simulated studies per cell) chose the flat slope priors.

With flat slope priors and the default schedule:
- **estimates** are roughly unbiased;
- **coverage** of the 89% intervals is 0.88–0.94 in every core cell, and it holds up under
  practice, drift, carryover, missed or late probes and off-arm play;
- **power for a single measure** is about 10% at 0.5 SEM per period, 20–28% at 1 SEM and about 50%
  at 2 SEM;
- **the combined randomization test** reaches about 30% at 0.5 SEM and 70% at 1 SEM.

A test checks the Kalman filter against brute-force Gaussian conditioning.

**What it can detect.** One SEM per period is about 0.6 between-person SD for choice RT, so the
study detects arm-specific effects much larger than the 0.1–0.2 d typical of transfer. A null
rules out large arm-specific effects, not small ones.

**When results appear.** A measure gets a row once its arm has had one completed period of its own
and one of another arm, so from the end of period 2.

**Randomization test: the main result.** This runs once all six periods are done (Edgington & Onghena, 2007). The
statistic is the sum over measures of the posterior-mean difference, in SEM units. It is refitted
under each of the 24 orders the draw could have produced. p is the share of orders whose
statistic is at least the observed one, so the smallest possible p is 1/24 ≈ 0.042. This needs no
model assumptions beyond the random draw. It takes about half a second, once, and the result is
cached.

## Research basis

**Single-case design standards** (Kratochwill et al., 2010):
- an effect should be shown at least 3 times, at different points in time; ABCABC has 5 switches;
- each phase should have 3 to 5 data points; the default gives 3 per period.

**Irreversible outcomes.** Learning doesn't reverse when training stops, so a classic withdrawal
(ABAB) logic doesn't apply (Barlow, Nock & Hersen, 2009). The prediction is a staircase: gains
during own periods, flat during others. That is a multiple-baseline-across-domains logic, repeated
twice.

**Order effects.** In a fixed sequence, each arm always follows the same arm. Drawing the order at
random removes that confound, and it is what makes the randomization test valid.

**Expectation.** Meta-analyses find little transfer to untrained tasks (Melby-Lervåg, Redick &
Hulme, 2016). With these probes, only a sizeable domain-specific effect would show. A clear null
is still an answer.

## References

- Barlow, D. H., Nock, M. K., & Hersen, M. (2009). *Single case experimental designs: Strategies
  for studying behavior change* (3rd ed.). Pearson.
- Edgington, E. S., & Onghena, P. (2007). *Randomization tests* (4th ed.). Chapman & Hall/CRC.
- Kratochwill, T. R., Hitchcock, J., Horner, R. H., Levin, J. R., Odom, S. L., Rindskopf, D. M., &
  Shadish, W. R. (2010). *Single-case designs technical documentation*. What Works Clearinghouse.
- Melby-Lervåg, M., Redick, T. S., & Hulme, C. (2016). Working memory training does not improve
  performance on measures of intelligence or other measures of "far transfer". *Perspectives on
  Psychological Science, 11*, 512–534.
