# Wetware — design plan

*Working title. A suite of research-based cognitive games for the browser, with a cyberpunk theme.*

Status: planning draft, 2026-11-22; open questions resolved 2026-11-23 (§9). **Phases 0–4 built 2026-11-23** (all 18 training modules; Weekly Gauntlet; intercepts). Phase 5: Lexicon Breach, Night Watch and ID Spoof built 2026-11-23 (core + hub; Diagnostics, Packet Echo, Firewall, Context Switch, Flashpoint, confidence layer; Safehouse, Cipher Matrix, Fence, Hardpoint, daily contract; Buffer Overflow, Ghost Trace, Bookie, Rule Forge, Heist Ledger, Checksum); see README.md. Phase 6 (rig customisation, §6.1) planned 2026-11-23.

---

## 1. Goals and principles

**Primary goal:** build and maintain higher-level cognitive functioning through games that are actually fun. Every game rests on a published paradigm, and we are honest about how strong the evidence is.
**Secondary goal:** a cohesive cyberpunk theme, matching the look of the sibling projects (Netling, Chrome & Bone), in a setting of its own.

**Audience:** primarily the author, and more broadly healthy, possibly high-functioning, adults. Two design consequences:

- **No difficulty ceilings.** Every adaptive parameter can keep climbing: n-back past 9, flash durations down to the display's frame limit, more tracked objects, deeper puzzles. Many commercial programs top out where high-functioning adults are just warming up.
- **Data over cheerleading.** No "brain age." We show raw performance, trends and uncertainty, and the data can be exported.

**Design principles drawn from the learning and training literature:**

| Principle | Implementation | Basis |
|---|---|---|
| Adaptive difficulty | Per-game staircases that target ~75–85% success | Levitt 1971; adaptivity is the usual active ingredient in WM-training studies (Klingberg-style designs; Au et al. 2015) |
| Spacing | A daily protocol rather than marathon sessions; Safehouse uses days-long spaced recall | Cepeda et al. 2006 |
| Interleaving and variety | The daily protocol rotates domains; the weekly Gauntlet mixes modules | Kornell & Bjork 2008; Bjork 1994 ("desirable difficulties") |
| Retrieval practice | Memory games test recall, not re-exposure | Roediger & Karpicke 2006 |
| Measure transfer separately from training | A **Diagnostics** battery of *untrained* tasks (§6) | Simons et al. 2016; Melby-Lervåg et al. 2016 |
| Metacognition everywhere | Optional confidence wagers after trials across games, scored by a proper scoring rule | Carpenter et al. 2019; Fleming & Lau 2014 |
| Engagement without breaking the task | The theme wraps the paradigm; it doesn't alter stimulus timing or response mapping | Lumsden et al. 2016 (gamification raises motivation but can compromise validity) |

### An honest stance on the evidence

The brain-training literature reliably shows **near transfer**: you get better at the trained task and close variants of it. It does *not* reliably show **far transfer** to general intelligence or everyday function (Owen et al. 2010; Simons et al. 2016; Melby-Lervåg, Redick & Hulme 2016; Sala et al. 2019). There are notable exceptions and partial exceptions:

- **Spatial training** is malleable, durable, and transfers within the spatial domain (Uttal et al. 2013).
- **Speed-of-processing / useful-field-of-view training** has the strongest long-term real-world outcomes, in older adults (ACTIVE: Ball et al. 2002; Rebok et al. 2014; Edwards et al. 2017, whose dementia-risk finding is debated).
- **Mnemonic strategy training**, such as the method of loci, teaches a genuinely usable skill (Verhaeghen et al. 1992; Dresler et al. 2017).
- **Metacognitive calibration training** has shown cross-task transfer (Carpenter et al. 2019) and real-world forecasting gains (Mellers et al. 2014).
- **Inductive reasoning training** has meta-analytic support (Klauer & Phye 2008).

The suite is therefore framed as **"maintain and stretch a broad set of skills, and measure yourself honestly,"** not "raise your IQ." In-game copy never claims far transfer.

### Evidence grades used below

- **A**: strong. Meta-analytic support for the trained skill *and* some transfer beyond it.
- **B**: moderate. Solid near transfer; far transfer mixed or limited.
- **C**: weak or limited. The paradigm is a well-validated *measure*, but training benefits are mostly task-specific or the evidence is mostly correlational.
- **X**: exploratory. Theoretically motivated; little or no direct training research. Included for coverage or fun.

---

## 2. Platform and architecture

**Constraints:** plays in a browser, no external dependencies, no build step.

- **Plain JavaScript in classic `<script>` tags with one global namespace** (the pattern CyberTrAIn uses with `WR.*`), not ES modules. Browsers block module scripts on `file://`, and this lets every page open by double-click. If we later make it an installable offline app (PWA), which needs it served over http, it is the same files served by `python3 -m http.server`.
- **Structure**

  ```
  index.html            hub ("the Rig")
  core/                 shared: rng, staircase, timing, storage, audio synth, ui kit, theme tokens
  games/<id>/index.html each game also runs standalone
  games/<id>/game.js
  fonts/                bundled OFL woff2 (e.g. VT323, as Netling already ships)
  docs/
  tests/                node-runnable logic tests (generators, scorers, staircases)
  ```
- **Each game is a module behind one interface:** `init(container, profile)`, `start(config)`, `onTrial(cb)`, `end() → SessionResult`. The hub only knows this interface, so games stay independently buildable and testable.
- **Storage:** IndexedDB for trial-level logs, localStorage for settings. Everything is wrapped in try/catch so the games still run when storage is blocked.
- **Export:** JSON (complete) and CSV (one row per trial: `game, session_id, ts, trial, condition, stimulus, response, correct, rt_ms, level, confidence`). Import supports moving between devices.
- **Timing:** `performance.now()` for reaction times, and `requestAnimationFrame` frame counting for stimulus durations. Browser reaction times are precise to a few milliseconds of variability but carry a constant per-device lag (Bridges et al. 2020). That's fine for tracking yourself over time on one device, but not for comparing across devices. Brief stimuli are bounded by the refresh rate (16.7 ms at 60 Hz), so we record the measured refresh rate with every session.
- **Determinism:** a seeded PRNG for all generators, so any puzzle or trial sequence can be replayed and unit-tested.
- **Input: desktop first (decided).** The keyboard is the reference input, and staircases and Diagnostics norms assume it. Touch is supported and logged separately because its latency differs, but timed games aren't tuned for it. Untimed puzzles (Checksum, Relay, Lockpick, Trace, Cipher Matrix) should work well on phones.

---

## 3. Theming bible

### Setting (working)

**Lowlight**, a vertical city where the street-level districts never see the sun. You are a freelance runner whose edge is not chrome but **wetware**: your own brain, interfaced to a battered cyberdeck called **the Rig**. Runners who don't keep their wetware tuned get sloppy, and sloppy runners get flatlined. Your fixer, **Rook**, sends you daily contracts. These are the daily protocol.

The tone is noir-dry and terse, with a little humor, matching Chrome & Bone's ledger voice and Netling's warmth. The story is a **light frame**: short text fragments ("intercepts") unlock through **consistency** (sessions on separate days) rather than high scores. That rewards spacing and discourages grinding.

### The Rig: subsystems as cognitive domains

The hub is a schematic of the Rig. Each subsystem's "tune level" is the player's rolling performance in that domain, so the hub doubles as a cognitive profile.

| Subsystem | Domain | Games |
|---|---|---|
| **RAM** | Working memory (updating, capacity) | Packet Echo, Buffer Overflow, Heist Ledger |
| **CLOCK** | Processing speed | Flashpoint, Fence (speed tier) |
| **FIREWALL** | Inhibitory control | Firewall |
| **SCHEDULER** | Task switching and cognitive flexibility | Context Switch, Rule Forge |
| **COLD STORAGE** | Episodic and associative long-term memory | Safehouse, Wiretap |
| **OPTICS** | Selective, divided and sustained attention | Ghost Trace, Flashpoint, Night Watch |
| **GYRO** | Spatial cognition and mental rotation | Hardpoint |
| **INFERENCE** | Fluid and inductive reasoning | Cipher Matrix, Rule Forge |
| **COMPILER** | Algorithmic thinking and planning | Relay, Lockpick, Trace, Checksum |
| **ALU** | Arithmetic and number sense | Fence, Checksum, Heist Ledger |
| **KERNEL** | Metacognition and calibration | Bookie, plus confidence wagers everywhere |
| **SOCKET** | Strategic and social reasoning (opponent modeling) | Black Market, Double Cross |
| **CRON** | Prospective memory and interval timing | Dead Man’s Switch, Pulse |
| **FIRMWARE** | Implicit and procedural learning | Burn-In |

\* backlog

### Visual language

- Matches the sibling projects: near-black ink backgrounds, neon accents (magenta `#ff2a6d`, cyan `#05d9e8`, amber `#ffb347`), and "bone" off-white text. Colors are defined as tokens on `:root` in `core/theme.css`, with a light-mode override for accessibility.
- Fonts are bundled locally (OFL licensed): **VT323** (already in `netling/fonts`) for display and readouts, plus one legible monospace or sans for body text. Chrome & Bone loads IBM Plex and Chakra Petch from Google Fonts. For zero dependencies we would bundle OFL copies instead.
- **All visuals are procedural:** canvas or SVG glyphs, scanlines, CRT glow, and glitch transitions *between* trials. The theme never adds visual noise *during* timed stimuli, to protect task validity.
- **Accessibility:** color is never the only cue (shape or pattern redundancy), the target contrast ratio is 4.5:1 or better, there is a reduced-motion mode, and every game can be played without sound unless audio is the task.

### Audio

All audio is synthesized with WebAudio at runtime: UI blips, correct and error tones, a stop-signal klaxon, and an optional generative ambient drone or synthwave pad that is ducked during trials. The only audio that might need recorded assets is n-back letters (see Packet Echo).

---

## 4. Domain coverage matrix

● = primary target, ○ = secondary load.

| Game | WM | Speed | Inhib | Switch | LTM | Attn | Spatial | Reason | Algo/Plan | Number | Meta | Strategic |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Packet Echo | ● | | ○ | | | ○ | ○ | | | | ○ | |
| Buffer Overflow | ● | | ○ | | | ○ | ○ | | | ○ | | |
| Flashpoint | | ● | | | | ● | | | | | | |
| Ghost Trace | ○ | | | | | ● | ○ | | | | | |
| Firewall | | ○ | ● | | | ● | | | | | | |
| Context Switch | ○ | ○ | ○ | ● | | | | | | ○ | | |
| Safehouse | | | | | ● | | ○ | | | | ○ | |
| Wiretap | | | | | ● | | ○ | | | | | |
| Hardpoint | ○ | | | | | | ● | | | | | |
| Cipher Matrix | ○ | | | | | | ○ | ● | | | | |
| Fence | | ● | | | | | | | | ● | ○ | |
| Bookie | | | | | | | | ○ | | ○ | ● | |
| Checksum | ○ | | | | | | | ● | ● | ● | | |
| Relay | ○ | | ○ | | | | ○ | | ● | | | |
| Lockpick | ○ | | | | ○ | | ● | | ● | | | |
| Trace | ● | | | | | | | ○ | ● | ○ | | |
| Heist Ledger | ● | ○ | | | | | ● | | | ● | | ○ |
| Black Market | ● | | | | | | | ○ | | ○ | ○ | ● |
| Rule Forge | ○ | | | ● | | | | ● | | | ○ | |

Every domain has at least one primary game, and most have two or more.

---

## 5. Game specifications

Each game lists: **pitch** · **core loop** · **adapts** (staircase parameter) · **measures** · **research** with grade · **theme** · **assets** · **priority** (P1 = build first … P4 = backlog). Effort is estimated as S/M/L.

Priority weighs evidence grade, fun, effort and asset needs. As you asked, **games that need more assets rank lower.**

---

### Tier I — Core lab-task games

#### 1. Packet Echo (RAM) — adaptive dual n-back
- **Pitch:** a data stream scrolls past. Flag packets that match the one *n* steps back, by position and by audio tag, independently.
- **Core loop:** blocks of 20+n trials. Each trial shows a glyph in one cell of a 3×3 grid and plays one of 8 sounds. Two response keys: position match and sound match. Single-stream mode is available too.
- **Adapts:** *n* goes up when accuracy is ≥ 90% and down when it is < 70% (Jaeggi's rule); a finer staircase on the inter-stimulus interval is optional. There is no cap on *n*.
- **Measures:** d′ per stream, reaction time, maximum and mean *n*.
- **Research:** Kirchner 1958; Jaeggi et al. 2008 claimed gains in fluid intelligence. Meta-analyses find small far effects that are debated (Au et al. 2015) or none once you correct for passive controls (Melby-Lervåg et al. 2016). Redick et al. 2013 failed to replicate. Near transfer to other n-back tasks is reliable (Soveri et al. 2017). **Grade B (near) / C (far).**
- **Theme:** "Packet inspection." Matches are replay attacks, and missed ones let an intrusion meter climb. A cosmetic "trace" bar fills between blocks, never during them.
- **Assets:** the 8 auditory stimuli. **Decided: synthesized.** 8 timbrally distinct, nameable WebAudio tones (e.g. "chirp," "buzz," "chime"), so no files are needed. We rejected recorded letter clips (they would need recording or licensing) and the Web Speech API (it varies by OS and its onset timing is unreliable for timed trials).
- **Priority:** **P1**, effort S.

#### 2. Buffer Overflow (RAM) — complex span
- **Pitch:** hold a sequence of memory addresses while also checking that incoming packets are valid.
- **Core loop:** alternate a processing judgment (is this equation true? is this pattern symmetric?) with a to-be-remembered item (a grid location or glyph). At the end of a set, recall the items in order. Operation-span and symmetry-span variants.
- **Adapts:** set size, and the processing-time deadline, which is calibrated to the player's own speed (as in Unsworth et al. 2005).
- **Measures:** partial-credit span score, processing accuracy (must stay ≥ 85% for the span to count), reaction time.
- **Research:** Daneman & Carpenter 1980; Turner & Engle 1989; automated version by Unsworth et al. 2005. Working-memory capacity as executive attention (Engle 2002). Training raised WM capacity but not fluid intelligence (Harrison et al. 2013). **Grade B/C.**
- **Theme:** "Smuggling addresses through a checkpoint." The processing items are customs checks, the recall is the payload, and an overflow (forgetting) corrupts the haul.
- **Assets:** none.
- **Priority:** **P2**, effort S.

#### 3. Flashpoint (CLOCK/OPTICS) — useful-field-of-view speed training
- **Pitch:** your optics flash a scene for a few frames. What was at the center, and where was the peripheral target?
- **Core loop:** a central identification (which of 2 glyphs) plus peripheral localization (one of 8 radial positions), followed by a mask. Later levels add distractors (selective attention), as in UFOV's three subtests.
- **Adapts:** display duration in frames (an adaptive staircase), then eccentricity and distractor density.
- **Measures:** duration threshold (ms) at 75% accuracy, per subtest.
- **Research:** UFOV (Ball, Owsley and colleagues). In the ACTIVE trial, speed training gave the most durable effects: improvements at 10 years (Rebok et al. 2014) and lower dementia incidence (Edwards et al. 2017, a contested secondary analysis). Action-video-game meta-analysis showing perception and attention gains: Bediou et al. 2018. Evidence is strongest in **older** adults; healthy younger adults may hit the frame-rate floor, which is why we support high-refresh displays. **Grade A (older adults) / B (general).**
- **Theme:** "Combat optics calibration." The center is a target ID, the periphery a flanking drone.
- **Assets:** none (procedural glyphs and masks).
- **Priority:** **P1**, effort S–M (needs careful frame timing).

#### 4. Ghost Trace (OPTICS) — multiple-object tracking
- **Pitch:** a few daemons are tagged, then they disguise themselves in a swarm of identical decoys. Keep your eyes on them.
- **Core loop:** N targets are highlighted, then all M objects move for 6–10 seconds with bounces and occlusions, then you click the targets. Advanced mode adds a peripheral flash to detect *while* tracking (divided attention).
- **Adapts:** speed, number of targets, number of decoys.
- **Measures:** tracking capacity (targets tracked at threshold speed), speed threshold.
- **Research:** Pylyshyn & Storm 1988. MOT is a core component of action-game attention benefits (Bediou et al. 2018). Multitasking training in a game environment improved older adults' attention and WM (Anguera et al. 2013). Training effects are mostly near. **Grade B.**
- **Theme:** "Ghosts in the subnet." Objects are drifting process icons with procedural glitch trails, but trails are off in the strict mode used for scoring.
- **Assets:** none.
- **Priority:** **P2**, effort M.

#### 5. Firewall (FIREWALL) — flanker, go/no-go and stop-signal
- **Pitch:** packets stream in. Accept or block each by its core signature, ignore the noise around it, and abort when the kill tone sounds.
- **Core loop:** each packet is a central arrow-like glyph flanked by congruent or incongruent glyphs (flanker). Respond left or right. On ~25% of trials a stop signal (a sound plus a border flash) follows after a delay, and you must withhold the response. A go/no-go variant uses rare "honeypot" packets.
- **Adapts:** stop-signal delay via a staircase (±50 ms) targeting 50% successful stops, which is standard (Verbruggen et al. 2019). Flanker deadline and stream rate.
- **Measures:** stop-signal reaction time (integration method), the flanker congruency effect, commission errors.
- **Research:** Eriksen & Eriksen 1974; Logan & Cowan 1984; consensus guide by Verbruggen et al. 2019. Inhibition is one of three executive-function components (Miyake et al. 2000; Diamond 2013). Inhibitory-control training shows near transfer only (Kassai et al. 2019); no true transfer in young adults (Enge et al. 2014). **Grade C.** Still valuable as a *measure* and as a fast-paced arcade game.
- **Theme:** an ICE console with a scrolling packet lane. The stop signal is a "trace detected" klaxon.
- **Assets:** none (synthesized klaxon).
- **Priority:** **P1**, effort S.

#### 6. Context Switch (SCHEDULER) — cued task switching
- **Pitch:** two shells, one keyboard. The cue tells you which process owns the next input.
- **Core loop:** a digit or glyph appears with a cue (border color *and* shape). Rule A: is it odd or even? Rule B: is it above or below 5? Trials mix repeats and switches; advanced mode adds a third rule and unpredictable switches.
- **Adapts:** response deadline, cue–stimulus interval (shorter makes it harder), and switch probability.
- **Measures:** switch cost (reaction time and errors), mixing cost.
- **Research:** Rogers & Monsell 1995; Monsell 2003. Task-switching training transfers to untrained switching tasks and somewhat further (Karbach & Kray 2009). Meta-analysis of executive and WM training in older adults: Karbach & Verhaeghen 2014. **Grade B.**
- **Theme:** "Dual-booting under fire." A split-screen terminal where the active pane glows.
- **Assets:** none.
- **Priority:** **P1**, effort S.

#### 7. Safehouse (COLD STORAGE) — method of loci, paired associates, spaced retrieval
- **Pitch:** build a memory palace in your safehouse, stash datashards in it, and retrieve them hours or days later.
- **Core loop:**
  1. **Build:** walk a fixed route of 10–20 loci in a procedurally laid-out safehouse floorplan (door, terminal, fridge, bunk…). The route never changes, which is what makes the technique work.
  2. **Stash:** a list of concrete nouns appears one at a time. The game prompts you to make a vivid interaction between each item and its locus, and you can type a 2–3 word image note (self-generated encoding).
  3. **Retrieve:** free recall in order, then cued recall by locus.
  4. **Dead drops:** some lists come back for recall at expanding intervals (1 day, 3 days, 7 days).
  - Variant: paired-associate "contacts," linking a handle to a skill.
- **Adapts:** list length, study time per item, retention interval.
- **Measures:** serial and free recall, retention curve over intervals, strategy use (from the image notes).
- **Research:** method of loci (Bower 1970; Roediger 1980). Memory-athlete-style training reshapes brain networks and doubles recall in novices (Dresler et al. 2017). Meta-analysis of mnemonic training in older adults: Verhaeghen et al. 1992. Retrieval practice (Roediger & Karpicke 2006) and spacing (Cepeda et al. 2006). The ACTIVE memory arm showed durable memory gains. **Grade A** for the trained skill, which is a genuinely useful strategy; **B** for transfer beyond list memory.
- **Theme:** the safehouse *is* the hub's back room. A route that grows over time becomes a persistent personal space.
- **Assets:** **word list**: about 500 concrete, highly imageable nouns, some with a cyberpunk flavor. We author it, optionally checked against public concreteness norms (Brysbaert et al. 2014; check the licence before redistributing). The floorplan is procedural SVG with simple icon glyphs for loci, about 20 hand-made SVG icons, which is small.
- **Priority:** **P1**, effort M. Spaced dead drops need a cross-day scheduler in the hub.

- **As built (2026-11-24):** 48 stash points over two floors (the upper floor walks the same footprint in reverse from the stairs), or your own route of 10–60 named places through somewhere you know (one per line, saved with your data). Each floor, or your own route, is toured once before first use. Lists keep the place names they were stashed at, so editing your route doesn't break dead drops. Sessions log the palace used.

#### 7b. Wiretap (COLD STORAGE) — method of loci for spoken material (built 2026-11-24)
- **Pitch:** Rook has tapped a lecture feed. Hear each point once and stash it along your memory palace.
- **Core loop:** a short briefing on a real topic (60 briefings of six facts each, written in-house) is spoken one point at a time by the device's voice. Each point goes to the next stash point of the Safehouse route (or your own). After a 30 s scrub, walk the route and answer one question per place (cued recall, typed, leniently matched). The session comes back as a dead drop at 1, 3 and 7 days.
- **Adapts:** points per session, 4–24, by Safehouse's rule.
- **Why spoken:** loci help memory for passages heard but not for text read, where reading competes with imagery (Cornoldi & De Beni 1991; De Beni, Moè & Cornoldi 1997). On-screen text is a fallback, logged as its own mode.
- **Research:** loci training (Dresler et al. 2017); multi-strategy memory training (Gross et al. 2012). **Grade B**: the strategy is well supported; its use on prose rests on a smaller literature.
- **Not built, by decision:** number mnemonics (they would inflate the digit-span check-up); a keyword-method vocabulary game (only if a language is chosen).

#### 8. Hardpoint (GYRO) — mental rotation
- **Pitch:** fit salvaged cyberware housings. Is this part the same as the schematic, or its mirror-image counterfeit?
- **Core loop:** two 3D block assemblies (Shepard–Metzler-style), rotated. Answer "same" or "mirror." Later modes: 2D jigsaw "port fitting," and paper-folding/hole-punch items.
- **Adapts:** rotation angle, axis (picture plane, then depth), shape complexity, deadline.
- **Measures:** reaction-time slope per degree (the rotation rate), accuracy.
- **Research:** Shepard & Metzler 1971. Spatial skills are malleable (g ≈ 0.47), training effects are durable, and they transfer within the spatial domain (Uttal et al. 2013). **Grade A.**
- **Theme:** a ripperdoc parts bench, which nods to Chrome & Bone. Parts render as wireframe voxels.
- **Assets:** none, but it needs a **small in-house 3D wireframe renderer** (orthographic projection of cubes on canvas, about 200 lines) and a shape generator that guarantees mirror-distinct shapes.
- **Priority:** **P2**, effort M.

---

### Tier II — Reasoning, number and metacognition

#### 9. Cipher Matrix (INFERENCE) — procedural matrix reasoning
- **Pitch:** crack the cipher lattice. Each row obeys hidden rules; find the missing tile.
- **Core loop:** a 3×3 matrix with the bottom-right cell missing and 8 answer options. Rules are composed from a fixed taxonomy: constant, progression, distribution-of-three, figure addition/subtraction, XOR (from Carpenter, Just & Shell 1990). The generator follows the approach of Matzen et al. 2010.
- **Adapts:** number of simultaneous rules (1–5), rule types, distractor similarity (answer options built to defeat "pick the odd one out" shortcuts).
- **Measures:** accuracy by rule count and type, solve time.
- **Research:** Raven matrices. Carpenter et al. 1990 explains what drives difficulty (rule count and goal management, both WM-loaded). Inductive-reasoning training meta-analysis: Klauer & Phye 2008. Caveat: practising matrices inflates matrix test scores, so the **Diagnostics battery uses a held-out item family** (§6). **Grade B.**
- **Theme:** decrypting corporate ICE. Solving reveals a fragment of an intercepted message.
- **Assets:** none (procedural glyph primitives: shapes, fills, counts, positions).
- **Priority:** **P2**, effort M (generator validity is the hard part, and it has unit tests).

#### 10. Fence (ALU/CLOCK) — number sense and mental arithmetic
- **Pitch:** move stolen goods through a fence who talks fast and lowballs. Estimate fast, compute exactly, don't get cheated.
- **Core loop, in three tiers inside one game:**
  1. **Eyeball:** which crate holds more chips? (dot-array comparison, the approximate number system).
  2. **Ballpark:** approximate sums and differences of two dot clouds against a third (Park & Brannon's training task).
  3. **Haggle:** exact mental arithmetic under a deadline. Multi-step offers ("40% cut, minus 3k fee, split three ways") — catch the fence's errors.
- **Adapts:** numerosity ratio (closer is harder), deadline, number of steps and operand size.
- **Measures:** Weber fraction (w), arithmetic accuracy and speed.
- **Research:** approximate-number acuity correlates with math achievement (Halberda et al. 2008). ANS training improved adults' symbolic arithmetic (Park & Brannon 2013). Arithmetic fluency is classic, highly trainable near transfer. **Grade B.**
- **Theme:** a back-room deal with a fence NPC who has portrait text and tells. Rep goes up when you catch a lowball.
- **Assets:** none (procedural dot arrays with controlled area and density confounds).
- **Priority:** **P2**, effort S.

#### 11. Bookie (KERNEL) — confidence calibration
- **Pitch:** an underground bookie takes your bets, not on games but on *yourself*. Know what you know.
- **Core loop:** procedurally generated judgments (which line is longer, how many dots, how long a tone lasted, "will you solve this puzzle in under 30 s?"). After each answer you set confidence (50–100%) or wager credits. Scoring uses a log or Brier rule, so honesty pays.
- **Cross-game layer:** every game can optionally ask for a confidence rating after selected trials, giving a calibration curve *per domain* in the hub. This is the decision-science core of the suite.
- **Adapts:** stimulus difficulty is held near 70% accuracy, so calibration is measured where it is informative.
- **Measures:** calibration curve, Brier score with its resolution and reliability components, meta-d′/d′ (metacognitive efficiency; Fleming & Lau 2014).
- **Research:** calibration-feedback training improved metacognition and transferred to an untrained memory task (Carpenter et al. 2019). Probability training improved forecasting accuracy (Mellers et al. 2014). Classic calibration work: Lichtenstein, Fischhoff & Phillips 1982. **Grade B.**
- **Theme:** neon-lit bookie booth. Your "kernel integrity" is a live calibration curve.
- **Assets:** none. We deliberately avoid trivia questions, which would need a large, curated, dated question bank.
- **Priority:** **P1** for the confidence layer, **P2** for the standalone game; effort S–M.

---

### Tier III — Algorithmic and puzzle games

You asked about algorithmic puzzles like Sudoku, magic squares and Rubik's cubes. Their training literature is thin, but they exercise **skill acquisition**: discovering, chunking and automating procedures (Fitts & Posner 1967; Anderson's ACT, 1982; Chase & Simon 1973 on chunking; power law of practice, Newell & Rosenbloom 1981), along with planning and deduction. Grades reflect that honestly.

#### 12. Checksum (COMPILER/ALU) — cage-sum logic grids
- **Pitch:** repair corrupted checksum blocks. Fill the grid so every row, column and cage sums correctly.
- **Core loop:** a generic Latin-square or cage-sum constraint puzzle (in the Kakuro and Sudoku family) with an arithmetic flavor. A magic-square mode asks you to complete a partially filled magic square. Generated puzzles are guaranteed a **unique solution**, solvable by logic alone, with difficulty graded by which deduction techniques are required.
- **Adapts:** grid size, cage count and operations, required technique depth.
- **Measures:** solve time, error count, techniques used (inferred from fill order).
- **Research:** regular number-puzzle use correlates with better cognition in adults over 50 (Brooker et al. 2019; correlational, so causality is unknown). Deductive reasoning plus arithmetic fluency. **Grade C (correlational) / X (algorithmic transfer).**
- **Theme:** hex-dump aesthetic; a cell turns "verified" green as its cage checks out.
- **Assets:** none. A solver and generator is needed (backtracking plus technique-based grading).
- **Priority:** **P2**, effort M.

#### 13. Relay (COMPILER) — planning, Tower of London style
- **Pitch:** reroute data blocks across server stacks into the target config in the minimum number of moves. Plan first; execution is timed separately.
- **Core loop:** colored blocks on 3+ pegs of limited height. Reach the target in the minimum number of moves. A "plan phase" freezes input until your first move, so **planning time** and **execution time** are logged separately. Advanced mode: you must enter the whole move sequence *before* any move happens (pure mental planning).
- **Adapts:** minimum move count, number of pegs and blocks, goal hierarchy ambiguity (Ward & Allport 1997).
- **Measures:** excess moves, planning time, success rate in the pure-planning mode.
- **Research:** Shallice 1982; Ward & Allport 1997. A planning *measure*; training transfer is not established. **Grade C.**
- **Theme:** a rooftop relay station with blinking stacks.
- **Assets:** none.
- **Priority:** **P3**, effort S.

#### 14. Lockpick (COMPILER/GYRO) — permutation puzzle, algorithm discovery
- **Pitch:** a mag-lock made of interlocking rotating rings. Discover the move sequences ("exploits") that permute just a few pins without wrecking the rest.
- **Core loop:** an **original** twisty puzzle in 2D, not a cube clone. For example, two or three overlapping rings of pins, each of which rotates (a Hungarian-rings-like group). Early locks need a few moves. Later locks *require* discovering commutators and conjugates (A B A⁻¹ B⁻¹), which are the real algorithmic insight behind Rubik-style solving. An "exploit library" lets you save macros you discover and reuse them, which is chunking made visible.
- **Adapts:** ring count and size, scramble depth, constraints such as a maximum move count.
- **Measures:** solve moves vs. optimal, macro reuse, time to first discovery of each macro type.
- **Research:** skill acquisition and chunking (as above). Spatial transformation load (Uttal et al. 2013 covers spatial training generally). No direct transfer research on twisty puzzles. **Grade X.** It is here because it is the purest "algorithmic" game and highly replayable.
- **Theme:** safecracking a corporate vault. A successful exploit plays a glitchy unlock animation.
- **Assets:** none. Needs group-theory-aware scramble generation (BFS for optimal move counts on small locks).
- **Priority:** **P3**, effort M.

#### 15. Trace (COMPILER/RAM) — mental code execution
- **Pitch:** a captured daemon is a short program. Execute it in your head and predict what it outputs before it runs.
- **Core loop:** a tiny register-machine language (4 registers, `MOV ADD SUB JNZ SWP`). Read a 4–15 line program and answer "what is in R2 at halt?" Variants: find the bug, or write the shortest program that does X (an open-ended challenge).
- **Adapts:** program length, loop nesting, number of live registers (the WM load).
- **Measures:** accuracy and time by complexity.
- **Research:** program tracing relies heavily on working memory and on *algorithmic* thinking (computational thinking, Wing 2006). The WM-updating demands resemble running span. No training-transfer evidence. **Grade X.**
- **Theme:** about as cyberpunk as it gets: green-on-black disassembly of a hostile daemon.
- **Assets:** none.
- **Priority:** **P3**, effort S–M.

---

### Tier IV — Hybrid games inspired by *The Devil's Plan*

The show's strength is **fusing a lab-like cognitive demand with competition, hidden information and resource pressure.** We borrow those *structural patterns*, not specific episodes, names or branding:

| Show pattern | Cognitive demand | Our hybrid |
|---|---|---|
| Memorize a board, then it is hidden, then compute against it under time pressure | Visuospatial WM + arithmetic + speed | Heist Ledger |
| A fixed hand of resources spent over rounds; track what opponents have left | WM updating (card counting) + strategic inference | Black Market |
| Hidden or changing rules that must be deduced by probing | Inductive reasoning + set-shifting + hypothesis testing | Rule Forge |
| Daily elimination match under escalating pressure | Mixed-domain performance under stress | **Weekly Gauntlet** (hub event, §6) |

The show is multiplayer. Here, opponents are **AI bots with tunable reasoning depth** (level-k / cognitive-hierarchy models: Camerer, Ho & Chong 2004). **Decided:** AI rivals only. No pass-and-play or online play is planned.

#### 16. Heist Ledger (RAM/GYRO/ALU) — memorize, conceal, compute
- **Pitch:** you get a 10-second look at the vault's node grid (numbers on a circuit lattice) before the cameras cut. Then the contracts come in: "find a 3-node connected path that sums to 17."
- **Core loop:** memorize a 5×5 grid of numbered nodes (connections shown), then the numbers are hidden. Target sums are called out one at a time; trace a connected path you believe matches. A wrong claim costs; a correct one locks those nodes. A rival bot races you, and its search speed is the difficulty.
- **Adapts:** study time, grid size, path length, rival speed.
- **Measures:** spatial-recall accuracy (from claims), arithmetic speed, claim accuracy vs. confidence (feeds KERNEL).
- **Research:** visuospatial WM (Corsi-style; Milner 1971) plus arithmetic fluency; the combined demands mirror complex span. No direct training literature on the hybrid. **Grade C/X.**
- **Theme:** an actual heist, with a countdown, a camera-cut glitch effect, and a rival crew's tag appearing on the nodes they claim.
- **Assets:** none.
- **Priority:** **P2**, effort M. The flagship "fun" hybrid.

#### 17. Black Market (SOCKET/RAM) — sealed-bid card duel
- **Pitch:** lots come up for auction one by one. Everyone holds the same chips, numbered 1–13. Bid one face down each round; each chip spends once. Track what your rivals have spent, infer what they have left, and outbid them when it matters.
- **Core loop:** based on the **public-domain bidding game Goofspiel**, extended with hidden lot values, 2–3 rival bots of different styles, and a "no notes" rule. Spent chips are shown only briefly, so tracking them is a WM task. An optional assist shows the history in exchange for a score penalty.
- **Adapts:** number of rivals, bot depth (level-0 random, level-1 greedy, level-2 modeling), chip-display duration.
- **Measures:** win rate vs. bot level, chip-tracking accuracy (probed occasionally: "what does Rival B have left?"), bid efficiency vs. game-theoretic baselines.
- **Research:** strategic reasoning depth (Camerer et al. 2004); WM-based card tracking. No cognitive-training evidence. **Grade X.** Included for the strategic and social domain and because it fits decision science.
- **Theme:** an underground auction. Rivals are named fixers with personalities: one bluffs, one is greedy, one copies you.
- **Assets:** none. Rival portraits are optional procedural SVG busts (low priority).
- **Priority:** **P3**, effort M (the bot AI is most of the work).

#### 18. Rule Forge (INFERENCE/SCHEDULER) — hidden-rule discovery
- **Pitch:** a firewall accepts some packet sequences and rejects others. Probe it, form a hypothesis, prove it, and then the sysadmin changes the rule without warning.
- **Core loop, in two modes:**
  1. **Probe:** submit sequences of glyphs or numbers and get accept or reject, then declare the rule from a structured rule-builder. Scoring rewards *disconfirming* probes, which targets the positive-test bias of the classic number-triple task (Wason 1960; Klayman & Ha 1987).
  2. **Sort:** card-sorting by an unstated dimension (color, shape or count) with feedback only, where the rule shifts after a run of correct answers (Wisconsin-style set shifting; Grant & Berg 1948).
- **Adapts:** rule complexity (conjunctions, sequence rules), shift frequency, probe budget.
- **Measures:** probes to discovery, proportion of disconfirming tests, perseverative errors after a shift.
- **Research:** hypothesis testing (Wason 1960; Klayman & Ha 1987); set-shifting (Grant & Berg 1948; Miyake et al. 2000); inductive-reasoning training (Klauer & Phye 2008). **Grade B/C.**
- **Theme:** a duel with a rival sysadmin AI. An "audit log" shows your probes; a good hypothesis earns a sarcastic acknowledgment.
- **Assets:** none.
- **Priority:** **P2**, effort M.

---

### Backlog — higher asset cost or weaker fit

| Game | Concept | Domain | Grade | Why it's in the backlog |
|---|---|---|---|---|
| **Night Watch** ✔ built | Searchlight steps around a camera ring; flag only the rare skip (short Mackworth clock, Mackworth 1948), with feedback on every outcome (knowledge of results, Mackworth 1950) and three thought probes (after Stawarczyk et al. 2011) | Sustained attention | C | Built as a rare-target detection task rather than SART, so it does not train toward the SART diagnostic (opposite response rule, no digits). Level sets tick rate (1000→640 ms) and skip size (+100%→+37% of a notch). About 6 minutes |
| **Lexicon Breach** ✔ built | Crack passphrases with 60 s word runs: letter (FAS-style), category (scored for clustering and switching, Troyer et al. 1997), letter switching (after D-KEFS) and letter masks | Verbal fluency, retrieval, switching | C | Built: ENABLE dictionary (`data/enable.js`, loaded only when the game starts) plus 14 authored category lists with subcategories. Off-list category words go to an honest player check after the round. The game never shows a dictionary word the player didn't type, so no blocklist is needed |
| **ID Spoof** ✔ built | Social-engineering party: learn marks (face, first name, job), 30 s scrub, then a checkpoint where marks return in a different pose among look-alike lures and strangers; recognise, then recall name and job. Marks return as dead drops at 1, 3 and 7 days | Associative memory | B (strategy) | Built with procedural SVG portraits (`games/id-spoof/faces.js`): identity lives in face geometry; look-alike lures keep hair and extras; pose (tilt, turn, expression) varies per photo. Teaches the face-name mnemonic (McCarty 1980; Yesavage 1983) and scores names against jobs (baker/Baker, McWeeny et al. 1987). `preview.html` shows a sample sheet |

---

## 6. Hub systems

- **Daily contract (protocol):** about 12–15 minutes. Rook picks 3–4 modules, rotating domains so all are covered across a week (interleaving and spacing). Any Safehouse dead drops that are due come first. Weak domains are slightly oversampled.
- **Free play:** any module, any time. It logs the same data.
- **Diagnostics (transfer probes):** a monthly battery of **untrained** tasks, so you can see whether training shows up anywhere besides the trained games. Suggested items:
  - Corsi block span forward and backward, plus a digit span (WM, never trained in this form)
  - Choice reaction time (speed)
  - Stroop (inhibition, untrained)
  - Trail-making-style alternation (switching)
  - Paper folding (spatial, held out from Hardpoint)
  - A *held-out* matrix item family (reasoning)
  - A brief SART block (attention)

  As built: the battery takes about 32 minutes in total (Stroop and paper folding were doubled to 40 trials per condition and 16 items on 2026-11-24, for reliability), can be split across sittings, and uses generated parallel forms for the item-based probes (trails, paper folding, matrices). Trails uses 20 targets per part and SART a 135-trial block, both shortened from the paper versions.

  Because it's a self-experiment, the hub notes caveats: retest effects, no control group. It offers an optional **ABCABC study** (built 2026-11-24; `docs/STUDY.md`): three arms of probed domains, six periods in a random order, with the probes retested throughout, so you can compare trained and untrained domains within yourself.
- **Weekly Gauntlet:** a Devil's-Plan-style elimination event. Short rounds from several modules with escalating difficulty, and a "strike" on any round below your personal threshold ends the run. It is a fun capstone; its scores don't feed the staircases, to keep the adaptive data clean.
- **Profile view:** the Rig schematic, with tune levels per subsystem; trend charts per measure with confidence bands; calibration curves (KERNEL); export and import.
- **Intercepts:** story fragments unlock by days of practice (consistency), not by scores.
- **Rig customisation:** opt-in skins, a tabbed hub, creds and Vex's stall. Full spec in §6.1; mockup in `docs/mockups/skins.html`.

### 6.1 Rig customisation (Phase 6)

Decided 2026-11-23 from the skins mockup. Everything here is cosmetic and opt-in, and none of it may touch what a game measures.

**The rule that protects the data.** Skins are chrome. Each game splits into two layers:

- **Chrome (always skinned):** the hub, the stage's title bar, intro screens and debriefs.
- **Game body (stock unless flavour is on):** stimuli, response keys, timing, feedback tones and the klaxon. In every skin, the game body uses the stock tokens and follows the existing Theme setting (auto/dark/light).
- **Flavour (System setting, off by default):** lets a skin restyle the body of an *untimed* game, one game at a time, each opting in with `def.flavour = true` after a check. The first two are Black Market (chips and lot) and Safehouse (floor plan). Lockpick qualifies only if its three colours stay distinct. Timed games never take flavour. Fence's haggle round has a 45 s timeout, so it counts as timed.
- **While a game is running:** the hub decor is removed (`display: none`), not just dimmed, so animations and `backdrop-filter` can't cost frames during timed trials.

**Tabs (in every skin, stock included).** The hub's single long page becomes five tabs:

| Tab | Holds |
|---|---|
| Ops | Comms, the daily contract, diagnostics |
| Rig | The subsystem cards |
| Off the books | Weekly Gauntlet, intercepts |
| Stash | Skins, Vex's stall, creds, Rook's items |
| System | Display and sound, Handshake, Data, Log |

- The tabs follow the ARIA tabs pattern: arrow keys move between tabs, Home and End jump to the ends.
- The open tab is kept in the URL hash, and the last tab is remembered.
- In Phosphor, F1–F5 also switch tabs.
- With Rig customisation turned off, the Stash tab is hidden.

**Skins.**

| Skin | Look | Mods (from Vex) | Crew gift, by default |
|---|---|---|---|
| Stock | Today's look | (none) | Day 1 |
| Phosphor | Green CRT, VT323 everywhere, inverse headers, F-key tabs, block meters | Amber tube | Day 3 |
| Chop Shop | Diamond plate, riveted mismatched panels, tape labels, neon masthead | Sticker sheets fill two fixed slots, beside the logo and at the end of the tab strip; stickers never float over text | Day 7 |
| Street Glass | Generated night city behind frosted glass panels; compass, place tags, telemetry | Rain built in (weather toggle) | Day 14 |
| Spire | Light corporate terminal, serif KPI numerals, navy and gold, sidebar tabs | (none in v1) | Day 21 |
| Neural Lace | Generated neuron field with firing sparks, membrane panels, axon tab bar, heartbeat | (none in v1) | Day 30 |

- Descriptions say what a skin looks like, not where it comes from. The origin stories stay in Rook's comms line on the day the skin arrives.
- Debriefs are skinned per the mockup: a terminal printout for Phosphor, a torn receipt for Chop Shop, HUD tiles for Street Glass, a "quarterly performance review" for Spire, a glowing headline for Neural Lace.
- **Fonts:** system font stacks only (no new font files). Every stack must fall back to something readable on Windows, Linux and Android.

**Days, gifts and buying.**

- **Days on the job:** the existing `trainingDays()`, which counts distinct days with any training-module session. Intercepts use the same count.
- **Gift days:** 3, 7, 14, 21 and 30. On each one the crew hands over the next skin, in table order, that you don't own.
- **Buying:** every skin is on Vex's stall: Phosphor 300¢, Chop Shop 500¢, Street Glass 700¢, Spire 900¢, Neural Lace 1,200¢. Buying one early moves the later gifts each one skin down the list.
- **Rook's items:** a gift day when you already own every skin gives the next Rook-only item instead, in this order:
  1. Rook's old callsign plate
  2. A desk lighter (flickers on the masthead)
  3. A photo of the old crew (in the Stash)
  4. A tape of Rook's ambient hum (a quiet generative drone, ducked during games)
  5. A palette Vex can't get (an accent-token override that works with any skin)

  None of these are ever sold.

**Creds.** You earn creds for showing up, never for scores. A daily player earns about 110¢ a day, roughly 3,500¢ by day 30.

| Source | Creds |
|---|---|
| A logged training session (aborted or discarded sessions pay nothing) | 15¢ |
| A Weekly Gauntlet run, however far you get (paid instead of the 15¢) | 60¢ |
| A dead drop recalled on its due day, however much you remember | +10¢ each |
| Finishing today's contract (every pick logged today) | +50¢ |
| **Daily cap** | **150¢** |

- Past the cap, sessions still count everywhere else; they just stop paying.
- Diagnostics probes never pay, so there's no incentive to retest early.

**Vex's stall.** The stock is fixed: items appear on story days and nothing ever leaves.

| Item | Price | In stock from |
|---|---|---|
| Callsign plate (your callsign on the masthead) | 100¢ | day 1 |
| Mechanical keys (replaces the hub's menu click; every sound inside a game, including `tick`, stays stock) | 300¢ | day 1 |
| Desk cat (sleeps on the masthead; wakes when a session is logged) | 400¢ | day 1 |
| Amber tube (Phosphor mod) | 150¢ | day 3 |
| Sticker sheets #1–#4 | 60¢ each | days 7, 7, 14, 21 |
| Rain for any skin | 250¢ | day 14 |
| Neon callsign (a sign in the Street Glass skyline) | 350¢ | day 14 |

- Vex never sells difficulty, timing, hints, skips, story, streak protection, random packs, limited-time stock, or anything for real money.
- A plain-text **Callsign** field goes in System and feeds the plate and the neon sign.
- The other mods shown in the mockup notes are later ideas, not v1: fog and snow, time of day, department colours, the desk plant and plaque, cell colours, and stock accent swaps.

**Storage.**

- Creds are *derived* from session history every time; there's no stored balance. One stored state key, `rig`, in the existing `state` store (so it's in JSON export and import), holds:
  - `purchases`: `[{ id, day, price }]`
  - `contractDays`: the dates on which a contract was finished
  - `callsign`
- `contractDays` is stored because past contracts can't be rebuilt.
- Gifts are recomputed from `trainingDays()` and the purchase days, so an import gives the same result.
- If a deleted session or an import leaves the balance below zero, show 0¢ and block buying. Owned items are never taken back.
- The equipped skin and its mods live in prefs (`ww.skin`, `ww.skinMod:<id>`), not in `rig`, so it can be applied before IndexedDB opens, with no flash of stock.

**System settings.**

- **Rig customisation:** on by default. Off hides creds, the Stash and the stall, and shows the stock skin.
- **Unlock everything:** off by default. On gives you every skin and item and hides creds.
- **Flavour in games:** off by default.
- The existing Reduce motion setting stops all decor animation.

**Code layout (no build step; works from `file://`).**

- `core/rig.js`: pure logic, testable in Node.
  - `earnings(sessions, contractDays)`: per-day ledger with the cap.
  - `gifts(days, purchases)`
  - `balance()`
  - `catalog`: skins, stall items and Rook items with prices and days.
- `core/skins.js`:
  - `applySkin()`, called from `applyDisplayPrefs`, sets `html[data-skin]`, `data-mod` and `data-flavour`.
  - It injects `<link>` tags for `core/skins/<id>.css`, with the path resolved from the `theme.css` link so game pages work too.
  - It builds the decor: `buildCity()` and `buildLace()` move over from the mockup.
- `core/skins/<id>.css`: one file per skin, scoped to `html[data-skin=<id>]`. The game body under `.ww-stage .game` re-declares the stock tokens.
- `hub.js`: the tabs, the Stash tab and the System settings. Earnings are recomputed after each logged session, and a gift arrives as a comms message plus a toast.

**Build steps (one commit each).**

1. **6a: Tabs and skin plumbing.**
   - Stock hub in five tabs.
   - `html[data-skin]` and lazy-loaded skin CSS.
   - Stock tokens locked on the game body.
   - Decor removed while the stage is open.
2. **6b: Creds and the Stash.**
   - `core/rig.js` with tests: cap, gifts with purchases, Rook fallback, balance clamped at zero, import round-trip.
   - The Stash tab, buying, the three System settings, the Callsign field.
3. **6c: Skins.**
   - Phosphor plus amber, Chop Shop plus sticker slots, Street Glass plus city and rain, Spire, Neural Lace.
   - Each with its debrief, plus flavour for Black Market and Safehouse.
4. **6d: Trinkets.** Callsign plate, desk cat, mechanical keys, neon callsign, rain for any skin, Rook's five items.
5. **6e: Verification.**
   - In every skin:
     - Frame timing and jitter during a Firewall run match stock.
     - Text contrast meets WCAG AA.
     - Reduced motion stops decor.
     - 375 px width has no horizontal scroll.
     - Works from `file://` and from a game's standalone page.
   - Lockpick flavour decided here.

**Status (2026-11-23):** 6a–6e built. Results of the 6e pass:

- **Nothing behind a game keeps working.** While a game runs, the decor is removed and every hub animation is paused. In all six skins, no animation runs outside the stage and nothing inside the stage has a `filter` or `backdrop-filter`. Frame-interval measurements weren't meaningful in the hidden preview pane (the browser throttles it), so this structural check stood in for them.
- **Measured on 2026-11-24** (visible pane, 120 Hz display, `?demo`): rAF intervals for 4 s of a Firewall run and 2 s of the hub, in stock, every skin, and with rain (Depth and Awning) on. Every configuration: median 8.3 ms, p95 9.1–9.9 ms, max ≤ 10.4 ms, no dropped frames (one 16.6 ms frame once in Street Glass without rain, which didn't repeat on a rerun). The rain canvas idles and the decor is hidden for the whole run. Skins and rain cost nothing measurable, in the hub or in a game.
- **Contrast:** every text element in the Ops, Stash and System tabs meets WCAG AA in all six skins. The only exceptions are decorative and hidden from screen readers (the desk cat's "z"). One real failure was found and fixed: the Spire callsign plates on its dark masthead.
- **Reduced motion** stops all decor animation (Street Glass goes from 105 running animations to 0).
- **375 px:** no horizontal scroll in any skin, on any tab.
- **Game pages:** a standalone game page loads the equipped skin and gets flavour when it opts in. `file://` uses the same relative paths (resolved from the `theme.css` link) but wasn't scripted in the preview pane.
- **Lockpick: no flavour.** Its three colours carry the puzzle, so it stays stock in every skin. Flavour remains Black Market and Safehouse only.

---

## 7. Asset register

| Asset | Used by | Approach | Size | Status |
|---|---|---|---|---|
| Display + body fonts (OFL) | All | Bundle woff2 locally (VT323 already in `netling/fonts`; add one OFL mono/sans) | ~50–150 KB | Acquire (licence is fine) |
| UI sound effects | All | WebAudio synthesis | 0 | Procedural |
| Ambient music | Hub, optional in games | Generative WebAudio drone or synthwave (ducked during trials) | 0 | Procedural, low priority |
| 8 auditory n-back stimuli | Packet Echo | Synthesized distinct timbres | 0 | Procedural (decided) |
| Concrete-noun list (~500) | Safehouse | Hand-authored, optionally checked against concreteness norms | ~5 KB | Author |
| Locus icons (~20) | Safehouse | Hand-made minimal SVG | ~10 KB | Author |
| Story intercepts, NPC lines | Hub, Fence, Black Market, Rule Forge | Written | ~20 KB | Author |
| 3D wireframe renderer | Hardpoint | In-house code | — | Procedural |
| Rival portraits | Black Market, Fence | Procedural SVG busts | — | Procedural, optional |
| English dictionary + categories | Lexicon Breach | ENABLE (public domain) as `data/enable.js`; 14 category lists in `games/lexicon-breach/categories.js` | ~1.7 MB | Done |
| Faces | ID Spoof | Procedural SVG portrait generator (`games/id-spoof/faces.js`) | — | Done |

Every P1–P3 game is playable with **zero external binary assets.**

---

## 8. Roadmap

| Phase | Contents | Why first |
|---|---|---|
| **0 — Core** | `core/`: PRNG, staircase engine, timing (frame-rate detection), storage + export, WebAudio synth, theme tokens, game interface, hub shell with a stub Rig view; node tests | Everything depends on it |
| **1 — Baseline + lab core** | **Diagnostics battery first** (take the baseline before regular play), then Packet Echo, Firewall, Context Switch, Flashpoint, the confidence-wager layer | A baseline can't be collected after the fact. The lab games are small, well-specified paradigms covering WM / inhibition / switching / speed / metacognition |
| **2 — Memory and reasoning** | Safehouse (+ dead-drop scheduler), Cipher Matrix, Fence, Hardpoint, Daily contract | Highest-evidence skills (A grades), plus the protocol |
| **3 — Hybrids and puzzles** | Heist Ledger, Rule Forge, Checksum, Buffer Overflow, Ghost Trace, Bookie standalone | The fun layer; generators and solvers |
| **4 — Deep cuts** | Weekly Gauntlet, Black Market, Lockpick, Trace, Relay, intercept story | Long-tail depth |
| **5 — Backlog** | ~~Night Watch~~, ~~Lexicon Breach~~, ~~ID Spoof~~, ~~PWA install~~ (all built) | Asset-heavy or low priority |
| **7 — Gaps** (built 2026-11-24) | Daily check-in and context effects; trends with bootstrap CIs; careless-session flags; Dead Man’s Switch (prospective memory), Informant (Bayesian updating), Double Cross (reversal learning), Burn-In (implicit sequence learning), Pulse (timing); colour-blind aid; calendar reminders; intercepts to day 365; browser smoke test. Open questions in docs/TODO.md | Make results interpretable, cover missing domains, keep people coming back |
| **6 — Rig customisation** | Tabbed hub; skins (Phosphor, Chop Shop, Street Glass, Spire, Neural Lace); creds, Vex's stall and Rook's items (§6.1, steps 6a–6e) | Engagement after the training content is complete, kept off the measured layer |

Diagnostics items must stay out of every training game: no Corsi, digit span, Stroop, paper folding or the held-out matrix family in regular play.

---

## 9. Decisions (resolved 2026-11-23)

1. **Names:** the project and hub are called **Wetware**, the city is **Lowlight**, and the fixer is **Rook**. In the fiction, the cyberdeck is still "the Rig."
2. **Diagnostics:** built first, in Phase 1, and the baseline is taken before regular play.
3. **N-back audio:** synthesized WebAudio timbres; no audio files.
4. **Opponents:** AI rivals only.
5. **Tier IV:** all three hybrids stay in scope. Heist Ledger and Rule Forge are in Phase 3, Black Market in Phase 4.
6. **Mobile:** desktop first. Touch is supported and logged separately; untimed puzzles should play well on phones.

---

## 10. References

- Anderson, J. R. (1982). Acquisition of cognitive skill. *Psychological Review, 89*(4), 369–406.
- Anguera, J. A., et al. (2013). Video game training enhances cognitive control in older adults. *Nature, 501*, 97–101.
- Au, J., Sheehan, E., Tsai, N., Duncan, G. J., Buschkuehl, M., & Jaeggi, S. M. (2015). Improving fluid intelligence with training on working memory: A meta-analysis. *Psychonomic Bulletin & Review, 22*(2), 366–377.
- Ball, K., et al. (2002). Effects of cognitive training interventions with older adults: A randomized controlled trial. *JAMA, 288*(18), 2271–2281.
- Bediou, B., et al. (2018). Meta-analysis of action video game impact on perceptual, attentional, and cognitive skills. *Psychological Bulletin, 144*(1), 77–110.
- Bjork, R. A. (1994). Memory and metamemory considerations in the training of human beings. In J. Metcalfe & A. Shimamura (Eds.), *Metacognition: Knowing about knowing* (pp. 185–205). MIT Press.
- Bower, G. H. (1970). Analysis of a mnemonic device. *American Scientist, 58*(5), 496–510.
- Bridges, D., Pitiot, A., MacAskill, M. R., & Peirce, J. W. (2020). The timing mega-study: Comparing a range of experiment generators, both lab-based and online. *PeerJ, 8*, e9414.
- Brooker, H., et al. (2019). The relationship between the frequency of number-puzzle use and baseline cognitive function in a large online sample of adults aged 50 and over. *International Journal of Geriatric Psychiatry, 34*(7).
- Brysbaert, M., Warriner, A. B., & Kuperman, V. (2014). Concreteness ratings for 40 thousand generally known English word lemmas. *Behavior Research Methods, 46*(3), 904–911.
- Camerer, C. F., Ho, T.-H., & Chong, J.-K. (2004). A cognitive hierarchy model of games. *Quarterly Journal of Economics, 119*(3), 861–898.
- Carpenter, J., Sherman, M. T., Kievit, R. A., Seth, A. K., Lau, H., & Fleming, S. M. (2019). Domain-general enhancements of metacognitive ability through adaptive training. *Journal of Experimental Psychology: General, 148*(1), 51–64.
- Carpenter, P. A., Just, M. A., & Shell, P. (1990). What one intelligence test measures: A theoretical account of the processing in the Raven Progressive Matrices Test. *Psychological Review, 97*(3), 404–431.
- Cepeda, N. J., Pashler, H., Vul, E., Wixted, J. T., & Rohrer, D. (2006). Distributed practice in verbal recall tasks: A review and quantitative synthesis. *Psychological Bulletin, 132*(3), 354–380.
- Chase, W. G., & Simon, H. A. (1973). Perception in chess. *Cognitive Psychology, 4*(1), 55–81.
- Cornoldi, C., & De Beni, R. (1991). Memory for discourse: Loci mnemonics and the oral presentation effect. *Applied Cognitive Psychology, 5*(6), 511–518.
- Daneman, M., & Carpenter, P. A. (1980). Individual differences in working memory and reading. *Journal of Verbal Learning and Verbal Behavior, 19*(4), 450–466.
- De Beni, R., Moè, A., & Cornoldi, C. (1997). Learning from texts or lectures: Loci mnemonics can interfere with reading but not with listening. *European Journal of Cognitive Psychology, 9*(4), 401–415.
- Diamond, A. (2013). Executive functions. *Annual Review of Psychology, 64*, 135–168.
- Dresler, M., et al. (2017). Mnemonic training reshapes brain networks to support superior memory. *Neuron, 93*(5), 1227–1235.
- Edwards, J. D., et al. (2017). Speed of processing training results in lower risk of dementia. *Alzheimer's & Dementia: Translational Research & Clinical Interventions, 3*(4), 603–611.
- Enge, S., et al. (2014). No evidence for true training and transfer effects after inhibitory control training in young healthy adults. *Journal of Experimental Psychology: Learning, Memory, and Cognition, 40*(4), 987–1001.
- Engle, R. W. (2002). Working memory capacity as executive attention. *Current Directions in Psychological Science, 11*(1), 19–23.
- Eriksen, B. A., & Eriksen, C. W. (1974). Effects of noise letters upon the identification of a target letter in a nonsearch task. *Perception & Psychophysics, 16*(1), 143–149.
- Fitts, P. M., & Posner, M. I. (1967). *Human performance*. Brooks/Cole.
- Fleming, S. M., & Lau, H. C. (2014). How to measure metacognition. *Frontiers in Human Neuroscience, 8*, 443.
- Grant, D. A., & Berg, E. A. (1948). A behavioral analysis of degree of reinforcement and ease of shifting to new responses in a Weigl-type card-sorting problem. *Journal of Experimental Psychology, 38*(4), 404–411.
- Gross, A. L., Parisi, J. M., Spira, A. P., Kueider, A. M., Ko, J. Y., Saczynski, J. S., Samus, Q. M., & Rebok, G. W. (2012). Memory training interventions for older adults: A meta-analysis. *Aging & Mental Health, 16*(6), 722–734.
- Halberda, J., Mazzocco, M. M. M., & Feigenson, L. (2008). Individual differences in non-verbal number acuity correlate with maths achievement. *Nature, 455*, 665–668.
- Harrison, T. L., Shipstead, Z., Hicks, K. L., Hambrick, D. Z., Redick, T. S., & Engle, R. W. (2013). Working memory training may increase working memory capacity but not fluid intelligence. *Psychological Science, 24*(12), 2409–2419.
- Jaeggi, S. M., Buschkuehl, M., Jonides, J., & Perrig, W. J. (2008). Improving fluid intelligence with training on working memory. *PNAS, 105*(19), 6829–6833.
- Karbach, J., & Kray, J. (2009). How useful is executive control training? Age differences in near and far transfer of task-switching training. *Developmental Science, 12*(6), 978–990.
- Karbach, J., & Verhaeghen, P. (2014). Making working memory work: A meta-analysis of executive-control and working memory training in older adults. *Psychological Science, 25*(11), 2027–2037.
- Kassai, R., Futo, J., Demetrovics, Z., & Takacs, Z. K. (2019). A meta-analysis of the experimental evidence on the near- and far-transfer effects among children's executive function skills. *Psychological Bulletin, 145*(2), 165–188.
- Kirchner, W. K. (1958). Age differences in short-term retention of rapidly changing information. *Journal of Experimental Psychology, 55*(4), 352–358.
- Klauer, K. J., & Phye, G. D. (2008). Inductive reasoning: A training approach. *Review of Educational Research, 78*(1), 85–123.
- Klayman, J., & Ha, Y.-W. (1987). Confirmation, disconfirmation, and information in hypothesis testing. *Psychological Review, 94*(2), 211–228.
- Kornell, N., & Bjork, R. A. (2008). Learning concepts and categories: Is spacing the "enemy of induction"? *Psychological Science, 19*(6), 585–592.
- Levitt, H. (1971). Transformed up-down methods in psychoacoustics. *Journal of the Acoustical Society of America, 49*(2B), 467–477.
- Lichtenstein, S., Fischhoff, B., & Phillips, L. D. (1982). Calibration of probabilities: The state of the art to 1980. In D. Kahneman, P. Slovic, & A. Tversky (Eds.), *Judgment under uncertainty: Heuristics and biases*. Cambridge University Press.
- Logan, G. D., & Cowan, W. B. (1984). On the ability to inhibit thought and action: A theory of an act of control. *Psychological Review, 91*(3), 295–327.
- Lu, C.-H., & Proctor, R. W. (1995). The influence of irrelevant location information on performance: A review of the Simon and spatial Stroop effects. *Psychonomic Bulletin & Review, 2*(2), 174–207.
- Lumsden, J., Edwards, E. A., Lawrence, N. S., Coyle, D., & Munafò, M. R. (2016). Gamification of cognitive assessment and cognitive training: A systematic review of applications and efficacy. *JMIR Serious Games, 4*(2), e11.
- Matzen, L. E., et al. (2010). Recreating Raven's: Software for systematically generating large numbers of Raven-like matrix problems with normed properties. *Behavior Research Methods, 42*(2), 525–541.
- Melby-Lervåg, M., Redick, T. S., & Hulme, C. (2016). Working memory training does not improve performance on measures of intelligence or other measures of "far transfer": Evidence from a meta-analytic review. *Perspectives on Psychological Science, 11*(4), 512–534.
- Mellers, B., et al. (2014). Psychological strategies for winning a geopolitical forecasting tournament. *Psychological Science, 25*(5), 1106–1115.
- Milner, B. (1971). Interhemispheric differences in the localization of psychological processes in man. *British Medical Bulletin, 27*(3), 272–277.
- Miyake, A., Friedman, N. P., Emerson, M. J., Witzki, A. H., Howerter, A., & Wager, T. D. (2000). The unity and diversity of executive functions and their contributions to complex "frontal lobe" tasks. *Cognitive Psychology, 41*(1), 49–100.
- Monsell, S. (2003). Task switching. *Trends in Cognitive Sciences, 7*(3), 134–140.
- Newell, A., & Rosenbloom, P. S. (1981). Mechanisms of skill acquisition and the law of practice. In J. R. Anderson (Ed.), *Cognitive skills and their acquisition*. Erlbaum.
- Owen, A. M., et al. (2010). Putting brain training to the test. *Nature, 465*, 775–778.
- Park, J., & Brannon, E. M. (2013). Training the approximate number system improves math proficiency. *Psychological Science, 24*(10), 2013–2019.
- Pylyshyn, Z. W., & Storm, R. W. (1988). Tracking multiple independent targets: Evidence for a parallel tracking mechanism. *Spatial Vision, 3*(3), 179–197.
- Rebok, G. W., et al. (2014). Ten-year effects of the ACTIVE cognitive training trial on cognition and everyday functioning in older adults. *Journal of the American Geriatrics Society, 62*(1), 16–24.
- Redick, T. S., et al. (2013). No evidence of intelligence improvement after working memory training: A randomized, placebo-controlled study. *Journal of Experimental Psychology: General, 142*(2), 359–379.
- Robertson, I. H., Manly, T., Andrade, J., Baddeley, B. T., & Yiend, J. (1997). 'Oops!': Performance correlates of everyday attentional failures in traumatic brain injured and normal subjects. *Neuropsychologia, 35*(6), 747–758.
- Roediger, H. L. (1980). The effectiveness of four mnemonics in ordering recall. *Journal of Experimental Psychology: Human Learning and Memory, 6*(5), 558–567.
- Roediger, H. L., & Karpicke, J. D. (2006). Test-enhanced learning: Taking memory tests improves long-term retention. *Psychological Science, 17*(3), 249–255.
- Rogers, R. D., & Monsell, S. (1995). Costs of a predictable switch between simple cognitive tasks. *Journal of Experimental Psychology: General, 124*(2), 207–231.
- Sala, G., Aksayli, N. D., Tatlidil, K. S., Tatsumi, T., Gondo, Y., & Gobet, F. (2019). Near and far transfer in cognitive training: A second-order meta-analysis. *Collabra: Psychology, 5*(1), 18.
- Shallice, T. (1982). Specific impairments of planning. *Philosophical Transactions of the Royal Society of London B, 298*, 199–209.
- Shepard, R. N., & Metzler, J. (1971). Mental rotation of three-dimensional objects. *Science, 171*, 701–703.
- Simons, D. J., Boot, W. R., Charness, N., Gathercole, S. E., Chabris, C. F., Hambrick, D. Z., & Stine-Morrow, E. A. L. (2016). Do "brain-training" programs work? *Psychological Science in the Public Interest, 17*(3), 103–186.
- Soveri, A., Antfolk, J., Karlsson, L., Salo, B., & Laine, M. (2017). Working memory training revisited: A multi-level meta-analysis of n-back training studies. *Psychonomic Bulletin & Review, 24*(4), 1077–1096.
- Turner, M. L., & Engle, R. W. (1989). Is working memory capacity task dependent? *Journal of Memory and Language, 28*(2), 127–154.
- Unsworth, N., Heitz, R. P., Schrock, J. C., & Engle, R. W. (2005). An automated version of the operation span task. *Behavior Research Methods, 37*(3), 498–505.
- Uttal, D. H., et al. (2013). The malleability of spatial skills: A meta-analysis of training studies. *Psychological Bulletin, 139*(2), 352–402.
- Verbruggen, F., et al. (2019). A consensus guide to capturing the ability to inhibit actions and impulsive behaviors in the stop-signal task. *eLife, 8*, e46323.
- Verhaeghen, P., Marcoen, A., & Goossens, L. (1992). Improving memory performance in the aged through mnemonic training: A meta-analytic study. *Psychology and Aging, 7*(2), 242–251.
- Ward, G., & Allport, A. (1997). Planning and problem-solving using the five-disc Tower of London task. *Quarterly Journal of Experimental Psychology, 50A*(1), 49–78.
- Wason, P. C. (1960). On the failure to eliminate hypotheses in a conceptual task. *Quarterly Journal of Experimental Psychology, 12*(3), 129–140.
- Wing, J. M. (2006). Computational thinking. *Communications of the ACM, 49*(3), 33–35.

*References were compiled from memory (by Claude), with Carpenter et al. 2019, Lumsden et al. 2016 and Park & Brannon 2013 checked against their published records. Check volume and page details before citing externally.*
