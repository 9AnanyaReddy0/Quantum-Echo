// Quantum Echo — logic tests. Run from the project folder with:  node tests/run-tests.js
// Loads the real game scripts (quantum.js, levels.js, engine.js, progress.js) the same
// way the browser does and checks physics, puzzles, daily rotation, XP and streaks.

"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const context = vm.createContext({ console: console });
["js/quantum.js", "js/levels.js", "js/engine.js", "js/progress.js"].forEach(function (file) {
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
});
const G = vm.runInContext(
  "({ Quantum, MissionEngine, Progress, MISSIONS, DIFFICULTIES, DIFFICULTY_ORDER, DAILY_BONUS_XP })",
  context
);
const { Quantum, MissionEngine, Progress, MISSIONS, DAILY_BONUS_XP } = G;

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log("  ✓ " + name);
  } catch (err) {
    failed++;
    console.log("  ✗ " + name + "\n      " + err.message);
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message || "assertion failed");
}

function near(a, b, msg) {
  assert(Math.abs(a - b) < 1e-9, (msg || "") + " expected " + b + ", got " + a);
}

function nearC(c, re, im, msg) {
  near(c.re, re, (msg || "") + " (re)");
  near(c.im, im, (msg || "") + " (im)");
}

const S = Quantum.stateFromLabel;
const R = Math.SQRT1_2;

// ------------------------------------------------------------------ physics
console.log("\nQuantum physics");

test("H|0⟩ = (|0⟩ + |1⟩)/√2", function () {
  const s = Quantum.applyGate(S("|0⟩"), "H");
  nearC(s.a, R, 0); nearC(s.b, R, 0);
});

test("H|1⟩ = (|0⟩ − |1⟩)/√2", function () {
  const s = Quantum.applyGate(S("|1⟩"), "H");
  nearC(s.a, R, 0); nearC(s.b, -R, 0);
});

test("X|0⟩ = |1⟩ and X|1⟩ = |0⟩", function () {
  const a = Quantum.applyGate(S("|0⟩"), "X");
  nearC(a.a, 0, 0); nearC(a.b, 1, 0);
  const b = Quantum.applyGate(S("|1⟩"), "X");
  nearC(b.a, 1, 0); nearC(b.b, 0, 0);
});

test("Z|1⟩ = −|1⟩ (global phase only)", function () {
  const s = Quantum.applyGate(S("|1⟩"), "Z");
  nearC(s.a, 0, 0); nearC(s.b, -1, 0);
  assert(Quantum.statesEquivalent(s, S("|1⟩")), "−|1⟩ should be equivalent to |1⟩");
  assert(!Quantum.statesIdentical(s, S("|1⟩")), "amplitudes should differ by sign");
  assert(Quantum.getStateLabel(s) === "−|1⟩", "label was " + Quantum.getStateLabel(s));
});

test("Z|0⟩ = |0⟩", function () {
  assert(Quantum.statesIdentical(Quantum.applyGate(S("|0⟩"), "Z"), S("|0⟩")));
});

test("Relative phase: Z|+⟩ = |−⟩ — same probabilities, different state", function () {
  const s = Quantum.applyGate(S("|+⟩"), "Z");
  assert(Quantum.statesEquivalent(s, S("|−⟩")));
  assert(!Quantum.statesEquivalent(s, S("|+⟩")), "|−⟩ must NOT be equivalent to |+⟩");
  const p = Quantum.getProbabilities(s);
  near(p.p0, 0.5); near(p.p1, 0.5);
  near(Quantum.fidelity(S("|+⟩"), S("|−⟩")), 0, "orthogonal fidelity");
  near(Quantum.relativePhaseDegrees(s), 180, "relative phase");
});

test("Interference: H|+⟩ = |0⟩ but H|−⟩ = |1⟩", function () {
  assert(Quantum.statesEquivalent(Quantum.applyGate(S("|+⟩"), "H"), S("|0⟩")));
  assert(Quantum.statesEquivalent(Quantum.applyGate(S("|−⟩"), "H"), S("|1⟩")));
});

test("HZH = X on |0⟩ and |1⟩; HXH = Z on |+⟩", function () {
  assert(Quantum.statesEquivalent(Quantum.applyGateSequence(S("|0⟩"), ["H", "Z", "H"]), S("|1⟩")));
  assert(Quantum.statesEquivalent(Quantum.applyGateSequence(S("|1⟩"), ["H", "Z", "H"]), S("|0⟩")));
  assert(Quantum.statesEquivalent(Quantum.applyGateSequence(S("|+⟩"), ["H", "X", "H"]), S("|−⟩")));
});

test("Self-inverse gates: XX = HH = ZZ = I on a general state", function () {
  const psi = { a: Quantum.complex(0.6, 0), b: Quantum.complex(0, 0.8) };
  ["X", "H", "Z"].forEach(function (g) {
    assert(Quantum.statesIdentical(Quantum.applyGateSequence(psi, [g, g]), psi), g + g + " ≠ I");
  });
});

test("Complex amplitudes: Z(0.6|0⟩ + 0.8i|1⟩) = 0.6|0⟩ − 0.8i|1⟩", function () {
  const psi = { a: Quantum.complex(0.6, 0), b: Quantum.complex(0, 0.8) };
  const s = Quantum.applyGate(psi, "Z");
  nearC(s.a, 0.6, 0); nearC(s.b, 0, -0.8);
  const p = Quantum.getProbabilities(s);
  near(p.p0, 0.36); near(p.p1, 0.64);
});

test("Global phase e^{iφ} is ignored by equivalence", function () {
  const phi = 1.234;
  const f = Quantum.complex(Math.cos(phi), Math.sin(phi));
  const base = S("|−⟩");
  const rotated = {
    a: { re: base.a.re * f.re - base.a.im * f.im, im: base.a.re * f.im + base.a.im * f.re },
    b: { re: base.b.re * f.re - base.b.im * f.im, im: base.b.re * f.im + base.b.im * f.re }
  };
  assert(Quantum.statesEquivalent(rotated, base));
  assert(Quantum.identifyState(rotated).label === "|−⟩");
});

test("Normalisation preserved over 2000 random gates", function () {
  let s = { a: Quantum.complex(0.6, 0), b: Quantum.complex(0, 0.8) };
  let seed = 7;
  for (let i = 0; i < 2000; i++) {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    s = Quantum.applyGate(s, ["X", "H", "Z"][seed % 3]);
    const p = Quantum.getProbabilities(s);
    assert(Math.abs(p.p0 + p.p1 - 1) < 1e-9, "sum drifted at step " + i);
  }
});

test("Bloch vectors: |0⟩ top, |1⟩ bottom, |+⟩ right, |−⟩ left", function () {
  const v0 = Quantum.blochVector(S("|0⟩")), v1 = Quantum.blochVector(S("|1⟩"));
  const vp = Quantum.blochVector(S("|+⟩")), vm = Quantum.blochVector(S("|−⟩"));
  near(v0.z, 1); near(v1.z, -1); near(vp.x, 1); near(vm.x, -1);
});

test("Unknown gate throws", function () {
  let threw = false;
  try { Quantum.applyGate(S("|0⟩"), "Q"); } catch (e) { threw = true; }
  assert(threw);
});

// ------------------------------------------------------------------ missions
console.log("\nMissions");

test("Every mission has the required fields", function () {
  const required = ["id", "difficulty", "title", "sector", "intro", "objective", "concept", "start",
    "target", "allowedGates", "hints", "solution", "completion", "xp"];
  const ids = {};
  MISSIONS.forEach(function (m) {
    required.forEach(function (f) { assert(m[f] !== undefined && m[f] !== "", m.id + " missing " + f); });
    assert(!ids[m.id], "duplicate id " + m.id);
    ids[m.id] = true;
    assert(m.hints.length === 3, m.id + " should have 3 hints");
    assert(G.DIFFICULTIES[m.difficulty], m.id + " bad difficulty");
    assert(m.xp === G.DIFFICULTIES[m.difficulty].xp, m.id + " XP doesn't match its tier");
    Quantum.stateFromLabel(m.start);
    if (m.target.state) Quantum.stateFromLabel(m.target.state);
  });
});

test("Each difficulty pool has at least 3 missions", function () {
  G.DIFFICULTY_ORDER.forEach(function (d) {
    assert(MISSIONS.filter(function (m) { return m.difficulty === d; }).length >= 3, d);
  });
});

MISSIONS.forEach(function (m) {
  test(m.id + ": listed solution wins and is the shortest (" + m.solution.join("") + ")", function () {
    const sim = MissionEngine.simulate(m, MissionEngine.fullSolution(m));
    assert(sim.ok, "solution does not win (rejected at " + sim.rejectedAt + ", status " + sim.run.status + ")");
    const best = MissionEngine.solve(m, 12);
    assert(best, "solver found no solution");
    assert(best.length === m.solution.length, "solver found shorter: " + best.join(""));
    assert(!MissionEngine.targetMet(m, Quantum.stateFromLabel(m.start)) ||
      MissionEngine.rulesOf(m).waypoints.length > 0, "already solved at start");
  });
});

test("Exact-move mission does not win early (Invisible Phase)", function () {
  const m = MISSIONS.find(function (x) { return x.id === "i-invisible-phase"; });
  const run = MissionEngine.createRun(m);
  MissionEngine.applyMove(run, "H");
  MissionEngine.applyMove(run, "H"); // back to |0⟩ — not the target
  const ev = MissionEngine.applyMove(run, "H"); // |+⟩ at move 3 — wrong
  assert(ev.type === "locked" && run.status === "locked", "should lock at the limit, got " + ev.type);
  assert(MissionEngine.applyMove(run, "Z").type === "rejected", "locked run must reject gates");
});

test("Max-move budget locks, undo unlocks", function () {
  const m = MISSIONS.find(function (x) { return x.id === "i-phase-relay"; });
  const run = MissionEngine.createRun(m);
  MissionEngine.applyMove(run, "H");
  const ev = MissionEngine.applyMove(run, "Z");
  assert(ev.type === "locked");
  assert(MissionEngine.undo(run) && run.status === "active" && run.moves === 1);
});

test("Echo Lock rejects a repeated gate without consuming a move", function () {
  const m = MISSIONS.find(function (x) { return x.id === "i-echo-lock"; });
  const run = MissionEngine.createRun(m);
  MissionEngine.applyMove(run, "X");
  const ev = MissionEngine.applyMove(run, "X");
  assert(ev.type === "rejected" && run.moves === 1 && run.forwardHistory.length === 1);
});

test("Disallowed gate is rejected", function () {
  const m = MISSIONS.find(function (x) { return x.id === "e-first-light"; });
  const run = MissionEngine.createRun(m);
  assert(MissionEngine.applyMove(run, "Z").type === "rejected" && run.moves === 0);
});

test("Waypoints must be visited in order before the target counts", function () {
  const m = MISSIONS.find(function (x) { return x.id === "i-minus-relay"; });
  const run = MissionEngine.createRun(m);
  MissionEngine.applyMove(run, "H"); // |+⟩
  MissionEngine.applyMove(run, "Z"); // |−⟩ waypoint
  assert(run.waypointIndex === 1, "waypoint not recorded");
  MissionEngine.applyMove(run, "H"); // |1⟩
  const ev = MissionEngine.applyMove(run, "X"); // |0⟩
  assert(ev.type === "won");
});

test("Returning to the target without the waypoint does not win", function () {
  const m = MISSIONS.find(function (x) { return x.id === "h-triple-echo"; });
  const run = MissionEngine.createRun(m);
  MissionEngine.applyMove(run, "H"); // +
  const ev = MissionEngine.applyMove(run, "Z"); // −
  assert(ev.type === "applied" && run.status === "active" && run.waypointIndex === 0);
});

test("Probability target accepts |−⟩ and |+⟩ and rejects |1⟩", function () {
  const m = MISSIONS.find(function (x) { return x.target.probability1 !== undefined; });
  assert(MissionEngine.targetMet(m, S("|−⟩")));
  assert(MissionEngine.targetMet(m, S("|+⟩")));
  assert(!MissionEngine.targetMet(m, S("|1⟩")));
});

test("Rewind: forward phase then reversed gates wins; wrong gate restarts rewind", function () {
  const m = MISSIONS.find(function (x) { return x.id === "h-rewind-protocol"; });
  const run = MissionEngine.createRun(m);
  ["X", "H"].forEach(function (g) { MissionEngine.applyMove(run, g); });
  const start = MissionEngine.applyMove(run, "Z");
  assert(start.type === "rewind-start" && run.phase === "REWIND");
  assert(MissionEngine.expectedRewindGate(run) === "Z");
  const wrong = MissionEngine.applyMove(run, "X");
  assert(wrong.type === "rewind-wrong" && run.rewindHistory.length === 0);
  assert(Quantum.statesEquivalent(run.state, S("|+⟩")), "state should return to forward end");
  ["Z", "H"].forEach(function (g) { assert(MissionEngine.applyMove(run, g).type === "applied"); });
  const win = MissionEngine.applyMove(run, "X");
  assert(win.type === "won" && Quantum.statesEquivalent(run.state, S("|0⟩")));
  assert(run.moves === 7, "moves should count all presses incl. wrong one, got " + run.moves);
});

test("Undo restores state, moves, history, waypoints and phase", function () {
  const m = MISSIONS.find(function (x) { return x.id === "h-rewind-protocol"; });
  const run = MissionEngine.createRun(m);
  MissionEngine.applyMove(run, "X");
  MissionEngine.applyMove(run, "H");
  MissionEngine.applyMove(run, "Z"); // enters rewind
  assert(run.phase === "REWIND");
  MissionEngine.undo(run);
  assert(run.phase === "FORWARD" && run.moves === 2 && run.forwardHistory.join("") === "XH");
  assert(Quantum.statesEquivalent(run.state, S("|−⟩")));
  MissionEngine.undo(run);
  MissionEngine.undo(run);
  assert(run.moves === 0 && Quantum.statesIdentical(run.state, S("|0⟩")) && !MissionEngine.canUndo(run));
});

test("Reset restores the start state and keeps revealed hints", function () {
  const m = MISSIONS[0];
  let run = MissionEngine.createRun(m);
  MissionEngine.revealHint(run);
  MissionEngine.applyMove(run, "H");
  run = MissionEngine.reset(run);
  assert(run.moves === 0 && run.forwardHistory.length === 0 && run.hintsUsed === 1);
  assert(Quantum.statesIdentical(run.state, S(m.start)));
});

test("Hints are revealed progressively and run out after 3", function () {
  const m = MISSIONS[0];
  const run = MissionEngine.createRun(m);
  assert(MissionEngine.revealHint(run) === m.hints[0]);
  assert(MissionEngine.revealHint(run) === m.hints[1]);
  assert(MissionEngine.revealHint(run) === m.hints[2]);
  assert(MissionEngine.revealHint(run) === null && MissionEngine.hintsRemaining(run) === 0);
});

// ------------------------------------------------------------------ daily rotation
console.log("\nDaily rotation");

test("Same date → same three missions", function () {
  const a = Progress.selectDailyMissions("2026-10-04", MISSIONS);
  const b = Progress.selectDailyMissions("2026-10-04", MISSIONS);
  G.DIFFICULTY_ORDER.forEach(function (d) { assert(a[d].id === b[d].id); });
});

test("Each pool rotates on consecutive days for 60 days", function () {
  let prev = Progress.selectDailyMissions("2026-09-01", MISSIONS);
  for (let i = 1; i < 60; i++) {
    const key = Progress.addDays("2026-09-01", i);
    const cur = Progress.selectDailyMissions(key, MISSIONS);
    G.DIFFICULTY_ORDER.forEach(function (d) {
      assert(cur[d].difficulty === d, "wrong tier");
      assert(cur[d].id !== prev[d].id, d + " repeated on " + key);
    });
    prev = cur;
  }
});

test("Every mission appears in rotation", function () {
  const seen = {};
  for (let i = 0; i < 10; i++) {
    const sel = Progress.selectDailyMissions(Progress.addDays("2026-01-01", i), MISSIONS);
    G.DIFFICULTY_ORDER.forEach(function (d) { seen[sel[d].id] = true; });
  }
  assert(Object.keys(seen).length === MISSIONS.length, "only " + Object.keys(seen).length + " seen");
});

test("Date helpers handle month/year boundaries and DST", function () {
  assert(Progress.addDays("2026-12-31", 1) === "2027-01-01");
  assert(Progress.addDays("2028-02-28", 1) === "2028-02-29");
  assert(Progress.dayNumber("2026-03-30") - Progress.dayNumber("2026-03-29") === 1);
  assert(Progress.dayNumber("2026-11-02") - Progress.dayNumber("2026-11-01") === 1);
  assert(!Progress.isValidDateKey("2026-02-30") && !Progress.isValidDateKey("garbage"));
  assert(Progress.dateKey(new Date(2026, 9, 4, 23, 59)) === "2026-10-04");
});

// ------------------------------------------------------------------ XP and streaks
console.log("\nXP, bonus and streaks");

function missionFor(day, diff) { return Progress.selectDailyMissions(day, MISSIONS)[diff]; }

test("Daily XP is awarded once per tier per day", function () {
  const p = Progress.defaultProgress();
  const m = missionFor("2026-10-04", "easy");
  const r1 = Progress.recordDailyCompletion(p, "2026-10-04", "easy", m, 1, DAILY_BONUS_XP);
  const r2 = Progress.recordDailyCompletion(p, "2026-10-04", "easy", m, 1, DAILY_BONUS_XP);
  assert(r1.missionXp === m.xp && !r1.alreadyClaimed);
  assert(r2.missionXp === 0 && r2.alreadyClaimed);
  assert(p.xp === m.xp, "xp " + p.xp);
});

test("All three tiers → +100 bonus exactly once", function () {
  const p = Progress.defaultProgress();
  const day = "2026-10-04";
  let total = 0;
  let bonusCount = 0;
  ["easy", "intermediate", "hard", "hard", "easy"].forEach(function (d) {
    const m = missionFor(day, d);
    const r = Progress.recordDailyCompletion(p, day, d, m, 3, DAILY_BONUS_XP);
    total += r.missionXp + r.bonusXp;
    if (r.bonusXp) bonusCount++;
  });
  assert(bonusCount === 1, "bonus awarded " + bonusCount + " times");
  assert(p.xp === 50 + 100 + 200 + 100 && total === p.xp, "xp " + p.xp);
});

test("Streak: consecutive days increase, same day doesn't double count", function () {
  const p = Progress.defaultProgress();
  Progress.recordDailyCompletion(p, "2026-10-01", "easy", missionFor("2026-10-01", "easy"), 1, 100);
  Progress.recordDailyCompletion(p, "2026-10-01", "hard", missionFor("2026-10-01", "hard"), 1, 100);
  assert(p.streak === 1);
  Progress.recordDailyCompletion(p, "2026-10-02", "easy", missionFor("2026-10-02", "easy"), 1, 100);
  Progress.recordDailyCompletion(p, "2026-10-03", "intermediate", missionFor("2026-10-03", "intermediate"), 1, 100);
  assert(p.streak === 3 && p.bestStreak === 3);
  assert(Progress.currentStreak(p, "2026-10-03") === 3);
  assert(Progress.currentStreak(p, "2026-10-04") === 3, "still alive the next day");
});

test("Streak: a missed day resets it", function () {
  const p = Progress.defaultProgress();
  Progress.recordDailyCompletion(p, "2026-10-01", "easy", missionFor("2026-10-01", "easy"), 1, 100);
  Progress.recordDailyCompletion(p, "2026-10-02", "easy", missionFor("2026-10-02", "easy"), 1, 100);
  assert(Progress.currentStreak(p, "2026-10-04") === 0, "should show 0 after a missed day");
  const r = Progress.recordDailyCompletion(p, "2026-10-04", "easy", missionFor("2026-10-04", "easy"), 1, 100);
  assert(p.streak === 1 && r.streakAfter === 1 && p.bestStreak === 2);
});

test("Streak: an older date never rewinds lastActiveDate", function () {
  const p = Progress.defaultProgress();
  Progress.recordDailyCompletion(p, "2026-10-05", "easy", missionFor("2026-10-05", "easy"), 1, 100);
  Progress.recordDailyCompletion(p, "2026-10-04", "easy", missionFor("2026-10-04", "easy"), 1, 100);
  assert(p.lastActiveDate === "2026-10-05" && p.streak === 1);
});

// ------------------------------------------------------------------ persistence
console.log("\nPersistence");

function memoryStorage(initial) {
  const data = Object.assign({}, initial || {});
  return {
    data: data,
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    setItem: function (k, v) { data[k] = String(v); },
    removeItem: function (k) { delete data[k]; }
  };
}

test("Save → load round trip", function () {
  const st = memoryStorage();
  const p = Progress.defaultProgress();
  Progress.recordDailyCompletion(p, "2026-10-04", "hard", missionFor("2026-10-04", "hard"), 6, 100);
  Progress.save(st, p);
  const loaded = Progress.load(st).progress;
  assert(loaded.xp === p.xp && loaded.streak === 1 && loaded.days["2026-10-04"].completed.hard.moves === 6);
});

test("Missing data → defaults", function () {
  const r = Progress.load(memoryStorage());
  assert(r.progress.xp === 0 && r.warning === null);
});

test("Corrupt JSON → defaults, raw copy kept, warning shown", function () {
  const st = memoryStorage({ [Progress.STORAGE_KEY]: "{not json" });
  const r = Progress.load(st);
  assert(r.progress.xp === 0 && r.warning && st.data["quantumEcho.progress.corrupt"] === "{not json");
});

test("Malformed fields are sanitised", function () {
  const p = Progress.sanitize({
    xp: -50, streak: "7", bestStreak: NaN, lastActiveDate: "yesterday",
    days: { "bad-key": {}, "2026-10-04": { completed: { easy: { missionId: 3 }, hard: { missionId: "h-rewind-protocol", moves: "x" } }, bonus: "yes" } },
    missions: [1, 2, 3]
  });
  assert(p.xp === 0 && p.streak === 0 && p.lastActiveDate === null);
  assert(!p.days["bad-key"] && !p.days["2026-10-04"].completed.easy && p.days["2026-10-04"].completed.hard.moves === 0);
  assert(p.days["2026-10-04"].bonus === false && Object.keys(p.missions).length === 0);
  assert(Progress.sanitize(null).xp === 0 && Progress.sanitize([1]).xp === 0 && Progress.sanitize("str").xp === 0);
});

test("Throwing storage does not crash load or save", function () {
  const bad = { getItem: function () { throw new Error("blocked"); }, setItem: function () { throw new Error("blocked"); } };
  const r = Progress.load(bad);
  assert(r.progress.xp === 0 && r.warning);
  assert(Progress.save(bad, r.progress) === false);
});

test("Ranks progress with XP", function () {
  assert(Progress.rankFor(0).name === "Cadet");
  assert(Progress.rankFor(150).name === "Calibrator");
  assert(Progress.rankFor(99999).next === null);
});

// ------------------------------------------------------------------ HTML ↔ JS IDs
console.log("\nHTML and script wiring");

test("Every ID used by game.js exists in index.html exactly once", function () {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const game = fs.readFileSync(path.join(root, "js/game.js"), "utf8");
  const block = game.slice(game.indexOf("const REQUIRED_IDS"), game.indexOf("];", game.indexOf("const REQUIRED_IDS")));
  const ids = (block.match(/"([a-zA-Z0-9-]+)"/g) || []).map(function (s) { return s.slice(1, -1); });
  assert(ids.length > 50, "could not parse REQUIRED_IDS");
  ids.forEach(function (id) {
    const count = (html.match(new RegExp('id="' + id + '"', "g")) || []).length;
    assert(count === 1, "#" + id + " appears " + count + " times in index.html");
  });
  const getById = game.match(/el\["([a-zA-Z0-9-]+)"\]/g) || [];
  getById.forEach(function (ref) {
    const id = ref.slice(4, -2);
    assert(ids.indexOf(id) !== -1, "el[\"" + id + "\"] is used but not in REQUIRED_IDS");
  });
});

test("No duplicate IDs in index.html", function () {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const all = (html.match(/\sid="([^"]+)"/g) || []).map(function (s) { return s.trim(); });
  const seen = {};
  all.forEach(function (id) {
    assert(!seen[id], "duplicate " + id);
    seen[id] = true;
  });
});

test("Script and stylesheet references point to real files", function () {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const refs = (html.match(/(?:src|href)="([^"#:]+)"/g) || []).map(function (s) { return s.replace(/^(src|href)="/, "").slice(0, -1); });
  assert(refs.length >= 6, "expected script + css refs");
  refs.forEach(function (r) { assert(fs.existsSync(path.join(root, r)), "missing file " + r); });
});

console.log("\n" + passed + " passed, " + failed + " failed\n");
process.exit(failed ? 1 : 0);
