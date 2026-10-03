"use strict";

// ==========================================================================
// levels.js — missions for Quantum Echo: The Rewind Protocol
//
// The three original levels (Power Restoration, The Invisible Phase,
// The Rewind Protocol) are kept and now anchor the Easy, Intermediate and
// Hard pools. Each daily board draws one mission from each pool.
//
// Mission fields:
//   id, difficulty, title, sector, intro, objective, concept,
//   start (state label), target ({ state } or { probability1 }),
//   allowedGates, rules { exactMoves, maxMoves, noRepeat, waypoints, rewind },
//   hints (3, progressive), solution (shortest forward sequence; verified by tests),
//   completion (victory narrative), xp
// ==========================================================================

const DIFFICULTIES = {
  easy: { key: "easy", label: "Easy", tier: "Tier I", name: "Calibration", xp: 50 },
  intermediate: { key: "intermediate", label: "Intermediate", tier: "Tier II", name: "Interference", xp: 100 },
  hard: { key: "hard", label: "Hard", tier: "Tier III", name: "Rewind", xp: 200 }
};

const DIFFICULTY_ORDER = ["easy", "intermediate", "hard"];

const DAILY_BONUS_XP = 100;

const MISSIONS = [
  // ------------------------------------------------------------------ EASY
  {
    id: "e-power-restoration",
    difficulty: "easy",
    title: "Power Restoration",
    sector: "Sector 01 · Reactor Ring",
    concept: "Bit flip — the X gate",
    intro: "The core has lost power. Its control qubit has fallen to |0⟩, the dark setting. The original timeline says it read |1⟩ when the lights were on.",
    objective: "Activate the recovery signal: turn |0⟩ into |1⟩.",
    start: "|0⟩",
    target: { state: "|1⟩" },
    allowedGates: ["X", "H", "Z"],
    rules: {},
    hints: [
      "You need to exchange the amplitudes of 0 and 1.",
      "Try the gate that flips the computational-basis state.",
      "Apply X to transform |0⟩ into |1⟩."
    ],
    solution: ["X"],
    completion: "Power restored! The X gate flips |0⟩ to |1⟩ by swapping the two amplitudes, α ↔ β.",
    xp: 50
  },
  {
    id: "e-first-light",
    difficulty: "easy",
    title: "First Light",
    sector: "Sector 02 · Signal Spire",
    concept: "Superposition — the H gate",
    intro: "The Signal Spire broadcast in a balanced superposition before the Cascade. Right now it sits frozen in |0⟩, silent.",
    objective: "Prepare the balanced superposition |+⟩ from |0⟩.",
    start: "|0⟩",
    target: { state: "|+⟩" },
    allowedGates: ["X", "H"],
    rules: {},
    hints: [
      "|+⟩ has equal amplitudes on |0⟩ and |1⟩: both are 1/√2 ≈ 0.707.",
      "X only swaps the amplitudes — it can't split one amplitude into two.",
      "Apply H once: H|0⟩ = (|0⟩ + |1⟩)/√2 = |+⟩."
    ],
    solution: ["H"],
    completion: "The Spire hums again. H turned a definite |0⟩ into |+⟩: one state with amplitude for both outcomes, each measured with 50% probability.",
    xp: 50
  },
  {
    id: "e-phase-mirror",
    difficulty: "easy",
    title: "Phase Mirror",
    sector: "Sector 03 · Phase Gardens",
    concept: "Relative phase — the Z gate",
    intro: "Two mirror-twin signals, |+⟩ and |−⟩, grow in the Phase Gardens. A probe can't tell them apart (both measure 50/50), but the timeline needs the twin with the minus sign.",
    objective: "Turn |+⟩ into |−⟩. The probabilities won't move. Watch the amplitude signs.",
    start: "|+⟩",
    target: { state: "|−⟩" },
    allowedGates: ["X", "Z"],
    rules: {},
    hints: [
      "|+⟩ and |−⟩ share the same probabilities. Only the sign of β differs.",
      "X swaps α and β, but for |+⟩ they are equal, so X changes nothing.",
      "Z flips the sign of β: Z|+⟩ = |−⟩."
    ],
    solution: ["Z"],
    completion: "Mirror aligned. Z changed the relative phase between |0⟩ and |1⟩. The probabilities stayed 50/50, but |−⟩ is a genuinely different state.",
    xp: 50
  },
  {
    id: "e-return-signal",
    difficulty: "easy",
    title: "Return Signal",
    sector: "Sector 02 · Signal Spire",
    concept: "H undoes itself",
    intro: "A return echo arrived as |−⟩. Decoders downstream only understand the pole states, and this one must be read as |1⟩.",
    objective: "Decode |−⟩ into |1⟩.",
    start: "|−⟩",
    target: { state: "|1⟩" },
    allowedGates: ["X", "H"],
    rules: {},
    hints: [
      "H is its own inverse: applying it twice brings you back to where you started.",
      "H|1⟩ = |−⟩. So what is H|−⟩?",
      "Apply H: the two amplitudes interfere and all the weight lands on |1⟩."
    ],
    solution: ["H"],
    completion: "Signal decoded. H turned the phase difference of |−⟩ into a definite |1⟩. That is interference at work.",
    xp: 50
  },
  {
    id: "e-coin-beacon",
    difficulty: "easy",
    title: "Coin-Flip Beacon",
    sector: "Sector 01 · Reactor Ring",
    concept: "Measurement probabilities",
    intro: "The reactor's random-number beacon must click |0⟩ and |1⟩ equally often. At the moment it is stuck on |1⟩ every time.",
    objective: "Prepare any state that measures |1⟩ with exactly 50% probability.",
    start: "|1⟩",
    target: { probability1: 0.5 },
    allowedGates: ["H", "Z"],
    rules: {},
    hints: [
      "You need |α|² = |β|² = 0.5.",
      "Z only flips a sign, so the probabilities stay at 0% / 100%.",
      "Apply H: H|1⟩ = |−⟩, which measures 50/50."
    ],
    solution: ["H"],
    completion: "The beacon clicks at random again. Each single measurement is unpredictable, but the prepared state guarantees a 50/50 distribution.",
    xp: 50
  },

  // ---------------------------------------------------------- INTERMEDIATE
  {
    id: "i-invisible-phase",
    difficulty: "intermediate",
    title: "The Invisible Phase",
    sector: "Sector 03 · Phase Gardens",
    concept: "Phase becomes probability",
    intro: "The recovery signal is hidden in the relative phase. The X gate has burned out, so the flip has to be built from interference.",
    objective: "Reach |1⟩ from |0⟩ in exactly three moves, using only H and Z.",
    start: "|0⟩",
    target: { state: "|1⟩" },
    allowedGates: ["H", "Z"],
    rules: { exactMoves: 3 },
    hints: [
      "First create a superposition.",
      "A phase change can be invisible in ordinary measurement probabilities.",
      "Apply H, then Z, then H."
    ],
    solution: ["H", "Z", "H"],
    completion: "Signal recovered! Z changes the relative phase, and the final H reveals it through interference.",
    xp: 100
  },
  {
    id: "i-flip-without-x",
    difficulty: "intermediate",
    title: "Bit Flip Without X",
    sector: "Sector 04 · Interference Vaults",
    concept: "Gate identity HZH = X",
    intro: "The Vault door's qubit is stuck at |1⟩ and the X relay is offline. Somewhere in the old timeline an engineer built an X out of spare parts.",
    objective: "Return |1⟩ to |0⟩ within 3 moves using only H and Z.",
    start: "|1⟩",
    target: { state: "|0⟩" },
    allowedGates: ["H", "Z"],
    rules: { maxMoves: 3 },
    hints: [
      "Without X you have to build a flip out of H and Z.",
      "H turns |1⟩ into |−⟩, Z turns |−⟩ into |+⟩, and H|+⟩ = …",
      "H, Z, H. The sequence HZH acts exactly like X."
    ],
    solution: ["H", "Z", "H"],
    completion: "The Vault opens. You've proven HZH = X: changing basis with H turns a phase flip into a bit flip.",
    xp: 100
  },
  {
    id: "i-phase-relay",
    difficulty: "intermediate",
    title: "Phase Relay",
    sector: "Sector 02 · Signal Spire",
    concept: "Phase steers interference",
    intro: "The relay holds |+⟩ and must deliver |1⟩. If you apply H right away, the signal interferes toward the wrong pole.",
    objective: "Turn |+⟩ into |1⟩ within 2 moves using H and Z.",
    start: "|+⟩",
    target: { state: "|1⟩" },
    allowedGates: ["H", "Z"],
    rules: { maxMoves: 2 },
    hints: [
      "From |+⟩, H takes you back to |0⟩, which is the wrong pole.",
      "Flip the relative phase first, so H interferes toward |1⟩ instead.",
      "Z, then H."
    ],
    solution: ["Z", "H"],
    completion: "Relay delivered. The same H gate sent |+⟩ to |0⟩ but sends |−⟩ to |1⟩. The relative phase decides where the interference goes.",
    xp: 100
  },
  {
    id: "i-minus-relay",
    difficulty: "intermediate",
    title: "Minus Relay",
    sector: "Sector 04 · Interference Vaults",
    concept: "Waypoints and Echo Lock",
    intro: "A courier signal must touch the |−⟩ beacon and come home to |0⟩. The Echo Lock is engaged, so no gate may fire twice in a row.",
    objective: "Pass through |−⟩, then end at |0⟩ within 4 moves.",
    start: "|0⟩",
    target: { state: "|0⟩" },
    allowedGates: ["X", "H", "Z"],
    rules: { maxMoves: 4, noRepeat: true, waypoints: ["|−⟩"] },
    hints: [
      "Reach |−⟩ first. It is two gates away from |0⟩.",
      "Echo Lock blocks HH, so you can't just reverse the last gate on the spot.",
      "One route: H, Z (now at |−⟩), H, X."
    ],
    solution: ["H", "Z", "H", "X"],
    completion: "Courier home. Its path |0⟩ → |+⟩ → |−⟩ → |1⟩ → |0⟩ visited every point on the state circle.",
    xp: 100
  },
  {
    id: "i-echo-lock",
    difficulty: "intermediate",
    title: "Echo Lock",
    sector: "Sector 05 · Echo Archive",
    concept: "Global phase is invisible",
    intro: "The Archive only accepts a timeline written in exactly three strokes, and Echo Lock forbids repeating a gate. The shortest path is two strokes, so you need a stroke that changes nothing physical.",
    objective: "Reach |−⟩ from |0⟩ in exactly 3 moves (Echo Lock on).",
    start: "|0⟩",
    target: { state: "|−⟩" },
    allowedGates: ["X", "H", "Z"],
    rules: { exactMoves: 3, noRepeat: true },
    hints: [
      "The shortest route takes two gates, but the Archive demands exactly three.",
      "Some gates only change the global phase of a state. For example X|−⟩ = −|−⟩, which is physically the same as |−⟩.",
      "Try X, H, X (or Z, H, Z)."
    ],
    solution: ["X", "H", "X"],
    completion: "Archived. That last stroke changed only the global phase: the amplitudes flipped sign together, and the physics stayed the same.",
    xp: 100
  },

  // ------------------------------------------------------------------ HARD
  {
    id: "h-rewind-protocol",
    difficulty: "hard",
    title: "The Rewind Protocol",
    sector: "Sector 06 · The Rewind Core",
    concept: "Reversibility",
    intro: "The core is active, but the original state must be restored. Reach |+⟩ in three moves, then rewind every gate.",
    objective: "Reach |+⟩ in exactly 3 moves, then undo every gate in reverse order.",
    start: "|0⟩",
    target: { state: "|+⟩" },
    allowedGates: ["X", "H", "Z"],
    rules: { exactMoves: 3, rewind: true },
    hints: [
      "Reach the target before you can rewind.",
      "Record each gate. To undo a sequence, reverse its order.",
      "Forward: X, H, Z. Rewind: Z, H, X."
    ],
    solution: ["X", "H", "Z"],
    completion: "Protocol restored! You reversed the gate operations in the correct order and recovered the original state.",
    xp: 200
  },
  {
    id: "h-phase-ghost",
    difficulty: "hard",
    title: "Phase Ghost",
    sector: "Sector 03 · Phase Gardens",
    concept: "Phase without a phase gate",
    intro: "A ghost signal, |−⟩, must be woven without the Z gate, and it must first pass through its twin |+⟩. Echo Lock is engaged.",
    objective: "Using only X and H: visit |+⟩, then finish at |−⟩ within 5 moves.",
    start: "|0⟩",
    target: { state: "|−⟩" },
    allowedGates: ["X", "H"],
    rules: { maxMoves: 5, noRepeat: true, waypoints: ["|+⟩"] },
    hints: [
      "Without Z you have to reach |−⟩ through the poles: |−⟩ = H|1⟩.",
      "From |+⟩, H leads back to |0⟩. X does nothing visible to |+⟩, but it lets you use H again.",
      "H, X, H, X, H."
    ],
    solution: ["H", "X", "H", "X", "H"],
    completion: "Ghost woven. The minus sign of |−⟩ came from interference, not from a phase gate: H|1⟩ = |−⟩.",
    xp: 200
  },
  {
    id: "h-mirror-rewind",
    difficulty: "hard",
    title: "Mirror Rewind",
    sector: "Sector 06 · The Rewind Core",
    concept: "Palindromic circuits",
    intro: "The Rewind Core holds |1⟩ and has lost X. Build the flip, then play the tape backwards to prove the timeline is reversible.",
    objective: "Reach |0⟩ in exactly 3 moves using H and Z, then rewind every gate.",
    start: "|1⟩",
    target: { state: "|0⟩" },
    allowedGates: ["H", "Z"],
    rules: { exactMoves: 3, rewind: true },
    hints: [
      "Forward phase: build an X gate out of H and Z.",
      "HZH = X. To rewind, reverse the order, which here gives the same sequence.",
      "Forward H, Z, H. Rewind H, Z, H."
    ],
    solution: ["H", "Z", "H"],
    completion: "Tape rewound. HZH reads the same in both directions, so its rewind is itself. Every quantum gate can be undone.",
    xp: 200
  },
  {
    id: "h-triple-echo",
    difficulty: "hard",
    title: "Triple Echo",
    sector: "Sector 05 · Echo Archive",
    concept: "Planning a full orbit",
    intro: "Three echoes are scattered around the state circle. Collect them in order (|1⟩, then |−⟩, then |+⟩) and bring the qubit home, using only H and Z under Echo Lock.",
    objective: "Visit |1⟩ → |−⟩ → |+⟩ in order, then finish at |0⟩ within 7 moves.",
    start: "|0⟩",
    target: { state: "|0⟩" },
    allowedGates: ["H", "Z"],
    rules: { maxMoves: 7, noRepeat: true, waypoints: ["|1⟩", "|−⟩", "|+⟩"] },
    hints: [
      "With only H and Z under Echo Lock, the gates must alternate.",
      "Z on |1⟩ only adds a global phase (−|1⟩). It's a free move that keeps you at the pole.",
      "H, Z, H, Z, H, Z, H."
    ],
    solution: ["H", "Z", "H", "Z", "H", "Z", "H"],
    completion: "All three echoes recovered. You used Z twice: once as a real phase flip (|+⟩ ↔ |−⟩) and once as a harmless global phase (on |1⟩).",
    xp: 200
  },
  {
    id: "h-dual-anchor",
    difficulty: "hard",
    title: "Dual Anchor",
    sector: "Sector 04 · Interference Vaults",
    concept: "Long-range planning",
    intro: "Two anchors hold the Vault timeline in place. Starting from |+⟩, touch the |1⟩ anchor, then the |0⟩ anchor, and finish on |−⟩. Only H and Z respond, and Echo Lock is on.",
    objective: "From |+⟩: visit |1⟩, then |0⟩, then finish at |−⟩ within 9 moves.",
    start: "|+⟩",
    target: { state: "|−⟩" },
    allowedGates: ["H", "Z"],
    rules: { maxMoves: 9, noRepeat: true, waypoints: ["|1⟩", "|0⟩"] },
    hints: [
      "The first anchor: |+⟩ needs a phase flip before H can reach |1⟩.",
      "From a pole, Z only adds a global phase. Use it to keep the gates alternating without leaving the pole.",
      "Z, H, Z, H, Z, H, Z, H, Z."
    ],
    solution: ["Z", "H", "Z", "H", "Z", "H", "Z", "H", "Z"],
    completion: "Both anchors hold. Nine alternating gates took the qubit all the way round the circle, and every one of them was needed.",
    xp: 200
  }
];

function getMissionById(id) {
  return MISSIONS.find(function (m) { return m.id === id; }) || null;
}

function getMissionsByDifficulty(difficulty) {
  return MISSIONS.filter(function (m) { return m.difficulty === difficulty; });
}
