/* Wetware catalog: the Rig's subsystems and every planned module.
 * Source of truth for the hub. Mirrors docs/PLAN.md §3–§5; keep the two in sync.
 * A module is "online" when a game with the same id has registered itself.
 */
(function (root) {
  'use strict';
  const WW = (root.WW = root.WW || {});

  const SUBSYSTEMS = [
    { id: 'ram', name: 'RAM', domain: 'Working memory' },
    { id: 'clock', name: 'CLOCK', domain: 'Processing speed' },
    { id: 'firewall', name: 'FIREWALL', domain: 'Inhibitory control' },
    { id: 'scheduler', name: 'SCHEDULER', domain: 'Task switching & flexibility' },
    { id: 'cold', name: 'COLD STORAGE', domain: 'Episodic & associative memory' },
    { id: 'optics', name: 'OPTICS', domain: 'Attention' },
    { id: 'gyro', name: 'GYRO', domain: 'Spatial cognition' },
    { id: 'inference', name: 'INFERENCE', domain: 'Fluid & inductive reasoning' },
    { id: 'compiler', name: 'COMPILER', domain: 'Algorithmic thinking & planning' },
    { id: 'alu', name: 'ALU', domain: 'Arithmetic & number sense' },
    { id: 'kernel', name: 'KERNEL', domain: 'Metacognition & calibration' },
    { id: 'socket', name: 'SOCKET', domain: 'Strategic reasoning' },
    { id: 'cron', name: 'CRON', domain: 'Prospective memory & timing' },
    { id: 'firmware', name: 'FIRMWARE', domain: 'Implicit & procedural learning' },
  ];

  // primary: subsystems the module targets (● in the plan's matrix); secondary: ○.
  const g = (id, name, phase, grade, primary, secondary, tagline) => ({ id, name, phase, grade, primary, secondary, tagline });

  const MODULES = [
    g('packet-echo', 'Packet Echo', 1, 'B/C', ['ram'], ['firewall', 'optics', 'gyro', 'kernel'], 'Dual n-back: flag packets that replay n steps back.'),
    g('firewall', 'Firewall', 1, 'C', ['firewall', 'optics'], ['clock'], 'Flanker + stop-signal: block by core signature, abort on the klaxon.'),
    g('context-switch', 'Context Switch', 1, 'B', ['scheduler'], ['ram', 'clock', 'firewall', 'alu'], 'Cued task switching across two shells.'),
    g('flashpoint', 'Flashpoint', 1, 'A/B', ['clock', 'optics'], [], 'Useful-field-of-view speed: what flashed, and where.'),
    g('safehouse', 'Safehouse', 2, 'A', ['cold'], ['gyro', 'kernel'], 'Method of loci with spaced dead-drop recall.'),
    g('cipher-matrix', 'Cipher Matrix', 2, 'B', ['inference'], ['ram', 'gyro'], 'Procedural matrix reasoning.'),
    g('fence', 'Fence', 2, 'B', ['clock', 'alu'], ['kernel'], 'Number sense and mental arithmetic against a lowballing fence.'),
    g('hardpoint', 'Hardpoint', 2, 'A', ['gyro'], ['ram'], 'Mental rotation: genuine part or mirror counterfeit?'),
    g('heist-ledger', 'Heist Ledger', 3, 'C/X', ['ram', 'gyro', 'alu'], ['clock', 'socket'], 'Memorize the vault grid, then call target-sum paths blind.'),
    g('rule-forge', 'Rule Forge', 3, 'B/C', ['scheduler', 'inference'], ['ram', 'kernel'], 'Probe a hidden firewall rule, then survive the rule change.'),
    g('checksum', 'Checksum', 3, 'C/X', ['inference', 'compiler', 'alu'], ['ram'], 'Cage-sum logic grids and magic squares.'),
    g('buffer-overflow', 'Buffer Overflow', 3, 'B/C', ['ram'], ['firewall', 'optics', 'gyro', 'alu'], 'Complex span: smuggle addresses through a checkpoint.'),
    g('ghost-trace', 'Ghost Trace', 3, 'B', ['optics'], ['ram', 'gyro'], 'Multiple-object tracking of daemons in a swarm.'),
    g('bookie', 'Bookie', 3, 'B', ['kernel'], ['inference', 'alu'], 'Bet on yourself: confidence calibration with proper scoring.'),
    g('black-market', 'Black Market', 4, 'X', ['ram', 'socket'], ['inference', 'alu', 'kernel'], 'Sealed-bid chip duel against rival fixers.'),
    g('lockpick', 'Lockpick', 4, 'X', ['gyro', 'compiler'], ['ram', 'cold'], 'Permutation locks: discover and save your own exploits.'),
    g('trace', 'Trace', 4, 'X', ['ram', 'compiler'], ['inference', 'alu'], 'Execute a captured daemon in your head.'),
    g('relay', 'Relay', 4, 'C', ['compiler'], ['ram', 'firewall', 'gyro'], 'Tower-of-London planning: plan first, then move.'),
    g('night-watch', 'Night Watch', 5, 'C', ['optics'], ['kernel'], 'Rare-target vigilance: flag the searchlight when it skips.'),
    g('lexicon-breach', 'Lexicon Breach', 5, 'C', ['cold'], ['scheduler', 'firewall'], 'Verbal fluency: crack passphrases with letter, category and switching word runs.'),
    g('id-spoof', 'ID Spoof', 5, 'B', ['cold'], ['optics'], 'Face–name memory: work the party, then pick your marks out at the checkpoint.'),
    g('informant', 'Informant', 7, 'C', ['inference', 'kernel'], ['alu'], 'Bayesian updating: how likely is the shipment rigged, given Vex’s rate and the chips?'),
    g('double-cross', 'Double Cross', 7, 'X', ['scheduler'], ['socket', 'kernel'], 'Probabilistic reversal learning: tell bad luck from a double-cross.'),
    g('burn-in', 'Burn-In', 7, 'X', ['firmware'], ['clock'], 'Implicit sequence learning: your hands learn the pattern before you do.'),
    g('pulse', 'Pulse', 7, 'X', ['cron'], ['clock'], 'Interval timing: hold for as long as the bar lit, then keep a beat going on your own.'),
    g('dead-switch', 'Dead Man’s Switch', 7, 'C', ['cron'], ['firewall', 'kernel'], 'Prospective memory: hold port-7x packets and ping the switch on time, no reminders.'),
    g('wiretap', 'Wiretap', 7, 'B', ['cold'], ['gyro'], 'Memory palace for what you hear: stash each point of a spoken briefing along your route.'),
  ];

  // Typical session length (minutes) for modules that are built.
  const MINUTES = { 'packet-echo': 6, firewall: 5, 'context-switch': 4, flashpoint: 3, safehouse: 6, 'cipher-matrix': 5, fence: 5, hardpoint: 4, 'buffer-overflow': 5, 'ghost-trace': 4, bookie: 5, 'rule-forge': 6, 'heist-ledger': 4, checksum: 6, relay: 4, trace: 5, lockpick: 6, 'black-market': 4, 'lexicon-breach': 6, 'night-watch': 7, 'id-spoof': 7, 'dead-switch': 5, wiretap: 7, informant: 5, 'double-cross': 4, 'burn-in': 5, pulse: 3 };
  for (const m of MODULES) m.minutes = MINUTES[m.id] || null;

  // Untrained transfer probes (PLAN §6), in battery order. Never reuse these
  // tasks, or the matrices' lattice-segment vocabulary, in training modules.
  const DIAGNOSTICS = [
    { id: 'dx-choice-rt', name: 'Choice reaction time', subsystem: 'clock', minutes: 2 },
    { id: 'dx-corsi', name: 'Corsi blocks', subsystem: 'ram', minutes: 4 },
    { id: 'dx-digit-span', name: 'Digit span', subsystem: 'ram', minutes: 4 },
    { id: 'dx-stroop', name: 'Stroop', subsystem: 'firewall', minutes: 4 },
    { id: 'dx-trails', name: 'Trail alternation', subsystem: 'scheduler', minutes: 2 },
    { id: 'dx-paper-folding', name: 'Paper folding', subsystem: 'gyro', minutes: 7 },
    { id: 'dx-matrix', name: 'Held-out matrices', subsystem: 'inference', minutes: 6 },
    { id: 'dx-sart', name: 'SART block', subsystem: 'optics', minutes: 3 },
  ];
  // Opt-in stand-ins for a battery probe (Display settings). Each is its own probe with its own
  // series and run-in; it is never pooled with the probe it replaces.
  const VARIANTS = [{ id: 'dx-stroop-spatial', name: 'Spatial Stroop', subsystem: 'firewall', minutes: 4, replaces: 'dx-stroop', pref: 'spatialStroop' }];
  // Every probe that can have data: the battery, plus any variant.
  const PROBES = [...DIAGNOSTICS, ...VARIANTS];
  /** The battery as set up now: each probe, or its variant when that setting is on. */
  const battery = () => DIAGNOSTICS.map((d) => VARIANTS.find((v) => v.replaces === d.id && WW.prefs && WW.prefs.get(v.pref, false)) || d);
  const RETEST_DAYS = 30;
  // First runs of each probe, one a day: uses up the steep early practice gain and gives a
  // first read on run-to-run noise before the monthly retests (core/reliable.js).
  const RUNIN = 3;

  // Non-training utilities that still log sessions.
  const SYSTEM = [
    { id: 'handshake', name: 'Handshake', tagline: 'Timing and logging self-test. Not a training module.' },
    { id: 'gauntlet', name: 'Weekly Gauntlet', tagline: 'Elimination run across modules. Never changes training levels.' },
  ];

  WW.catalog = {
    SUBSYSTEMS,
    MODULES,
    DIAGNOSTICS,
    VARIANTS,
    PROBES,
    battery,
    RETEST_DAYS,
    RUNIN,
    SYSTEM,
    subsystem: (id) => SUBSYSTEMS.find((s) => s.id === id),
    module: (id) => MODULES.find((m) => m.id === id) || PROBES.find((m) => m.id === id) || SYSTEM.find((m) => m.id === id),
    modulesFor: (subId) => MODULES.filter((m) => m.primary.includes(subId)),
    isOnline: (id) => !!(WW.games && WW.games.has(id)),
  };
})(globalThis);
