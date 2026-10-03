"use strict";

// ==========================================================================
// engine.js — mission rules (no DOM access, so it can be tested in Node)
//
// Carries forward the original game.js rules:
//   • reach the target state (up to global phase)
//   • "exact move" missions are judged only when the move limit is reached
//   • Rewind missions: after the forward phase, undo every gate in reverse order
// and adds: undo, max-move limits, Echo Lock (no repeated gate), waypoints,
// probability targets, and a solver used to verify every puzzle.
// ==========================================================================

var MissionEngine = (function () {
  const PROB_TOLERANCE = 1e-9;

  function rulesOf(mission) {
    const r = mission.rules || {};
    return {
      exactMoves: r.exactMoves || null,
      maxMoves: r.maxMoves || null,
      noRepeat: !!r.noRepeat,
      waypoints: Array.isArray(r.waypoints) ? r.waypoints : [],
      rewind: !!r.rewind
    };
  }

  // ---------- Target conditions ----------
  function targetMet(mission, state) {
    const t = mission.target;
    if (t.state) {
      return Quantum.statesEquivalent(state, Quantum.stateFromLabel(t.state));
    }
    if (typeof t.probability1 === "number") {
      // Judged on the prepared state's probabilities — no random measurement involved.
      return Math.abs(Quantum.getProbabilities(state).p1 - t.probability1) < PROB_TOLERANCE;
    }
    throw new Error("Mission " + mission.id + " has no valid target");
  }

  function targetLabel(mission) {
    const t = mission.target;
    if (t.state) return t.state;
    return "P(1) = " + Math.round(t.probability1 * 100) + "%";
  }

  function targetDescription(mission) {
    const t = mission.target;
    if (t.state) {
      return "Prepare " + t.state + " (a global phase such as a leading − is ignored).";
    }
    return "Prepare any state that would measure |1⟩ with probability " +
      Math.round(t.probability1 * 100) + "%. We check the state's probabilities — no dice are rolled.";
  }

  // ---------- Runs ----------
  function createRun(mission) {
    const start = Quantum.stateFromLabel(mission.start);
    return {
      mission: mission,
      state: start,
      moves: 0,
      forwardHistory: [],
      rewindHistory: [],
      trail: [Quantum.copyState(start)],
      phase: "FORWARD",
      forwardEndState: null,
      waypointIndex: 0,
      status: "active",      // active | locked | won
      undoStack: [],
      hintsUsed: 0,
      gatesFired: 0,
      undosUsed: 0
    };
  }

  function snapshot(run) {
    return {
      state: Quantum.copyState(run.state),
      moves: run.moves,
      forwardHistory: run.forwardHistory.slice(),
      rewindHistory: run.rewindHistory.slice(),
      trail: run.trail.map(Quantum.copyState),
      phase: run.phase,
      forwardEndState: run.forwardEndState ? Quantum.copyState(run.forwardEndState) : null,
      waypointIndex: run.waypointIndex,
      status: run.status
    };
  }

  function restore(run, snap) {
    run.state = snap.state;
    run.moves = snap.moves;
    run.forwardHistory = snap.forwardHistory;
    run.rewindHistory = snap.rewindHistory;
    run.trail = snap.trail;
    run.phase = snap.phase;
    run.forwardEndState = snap.forwardEndState;
    run.waypointIndex = snap.waypointIndex;
    run.status = snap.status;
  }

  function lastGate(run) {
    const h = run.phase === "REWIND" ? run.rewindHistory : run.forwardHistory;
    return h.length ? h[h.length - 1] : null;
  }

  // The gate the Rewind phase expects next (the latest un-reversed forward gate).
  function expectedRewindGate(run) {
    if (run.phase !== "REWIND") return null;
    return run.forwardHistory[run.forwardHistory.length - 1 - run.rewindHistory.length] || null;
  }

  // Can this gate be fired right now? Rejections never consume a move.
  function canApply(run, gate) {
    const rules = rulesOf(run.mission);
    if (run.status === "won") return { ok: false, reason: "Timeline already stabilised." };
    if (run.status === "locked") return { ok: false, reason: "Move budget spent. Undo or reset to try again." };
    if (run.mission.allowedGates.indexOf(gate) === -1) {
      return { ok: false, reason: "Gate " + gate + " is offline in this sector." };
    }
    if (rules.noRepeat && run.phase === "FORWARD" && lastGate(run) === gate) {
      return { ok: false, reason: "Echo Lock: " + gate + " cannot fire twice in a row (" + gate + gate + " would cancel itself)." };
    }
    return { ok: true };
  }

  function forwardLimit(rules) {
    return rules.exactMoves || rules.maxMoves || null;
  }

  // Apply a gate and return an event describing what happened.
  function applyMove(run, gate) {
    const check = canApply(run, gate);
    if (!check.ok) return { type: "rejected", message: check.reason };

    run.undoStack.push(snapshot(run));
    run.gatesFired++;
    return run.phase === "REWIND" ? playRewind(run, gate) : playForward(run, gate);
  }

  function playForward(run, gate) {
    const mission = run.mission;
    const rules = rulesOf(mission);

    run.state = Quantum.applyGate(run.state, gate);
    run.forwardHistory.push(gate);
    run.moves++;
    run.trail.push(Quantum.copyState(run.state));

    // Waypoints must be visited in order.
    const wp = rules.waypoints[run.waypointIndex];
    let waypointReached = null;
    if (wp && Quantum.statesEquivalent(run.state, Quantum.stateFromLabel(wp))) {
      run.waypointIndex++;
      waypointReached = wp;
    }

    const allWaypoints = run.waypointIndex >= rules.waypoints.length;
    const atTarget = allWaypoints && targetMet(mission, run.state);
    const used = run.forwardHistory.length;

    if (rules.exactMoves) {
      if (used < rules.exactMoves) {
        return { type: "applied", gate: gate, waypoint: waypointReached };
      }
      if (!atTarget) {
        run.status = "locked";
        return {
          type: "locked", gate: gate,
          message: "Target not reached in exactly " + rules.exactMoves + " moves. Undo to rewind, or reset."
        };
      }
    } else if (!atTarget) {
      if (rules.maxMoves && used >= rules.maxMoves) {
        run.status = "locked";
        return {
          type: "locked", gate: gate,
          message: "Move budget of " + rules.maxMoves + " spent. Undo to rewind, or reset."
        };
      }
      return { type: "applied", gate: gate, waypoint: waypointReached };
    }

    // Target reached.
    if (rules.rewind) {
      run.phase = "REWIND";
      run.forwardEndState = Quantum.copyState(run.state);
      run.rewindHistory = [];
      return {
        type: "rewind-start", gate: gate,
        message: "Forward phase complete! Now undo your gates in reverse order: start with " +
          expectedRewindGate(run) + "."
      };
    }

    run.status = "won";
    return { type: "won", gate: gate };
  }

  function playRewind(run, gate) {
    const expected = expectedRewindGate(run);

    run.state = Quantum.applyGate(run.state, gate);
    run.moves++;

    if (gate !== expected) {
      // Wrong order: the echo collapses back to the end of the forward phase.
      run.state = Quantum.copyState(run.forwardEndState);
      run.rewindHistory = [];
      run.trail.push(Quantum.copyState(run.state));
      return {
        type: "rewind-wrong", gate: gate,
        message: "Wrong gate! Rewind restarted. Undo " +
          run.forwardHistory[run.forwardHistory.length - 1] + " first."
      };
    }

    run.rewindHistory.push(gate);
    run.trail.push(Quantum.copyState(run.state));

    if (run.rewindHistory.length === run.forwardHistory.length) {
      const startState = Quantum.stateFromLabel(run.mission.start);
      if (Quantum.statesEquivalent(run.state, startState)) {
        run.status = "won";
        return { type: "won", gate: gate };
      }
      // Cannot happen for X/H/Z (each is its own inverse) but recover safely.
      run.state = Quantum.copyState(run.forwardEndState);
      run.rewindHistory = [];
      return { type: "rewind-wrong", gate: gate, message: "The start state was not restored. Rewind restarted." };
    }

    return { type: "applied", gate: gate, rewindNext: expectedRewindGate(run) };
  }

  function canUndo(run) {
    return run.undoStack.length > 0 && run.status !== "won";
  }

  function undo(run) {
    if (!canUndo(run)) return false;
    restore(run, run.undoStack.pop());
    run.undosUsed++;
    return true;
  }

  // Reset the puzzle to its starting state. Revealed hints stay revealed.
  function reset(run) {
    const fresh = createRun(run.mission);
    fresh.hintsUsed = run.hintsUsed;
    return fresh;
  }

  function revealHint(run) {
    const hints = run.mission.hints || [];
    if (run.hintsUsed >= hints.length) return null;
    run.hintsUsed++;
    return hints[run.hintsUsed - 1];
  }

  function hintsRemaining(run) {
    return (run.mission.hints || []).length - run.hintsUsed;
  }

  // Par = shortest winning sequence length (forward + full rewind).
  function parMoves(mission) {
    const n = mission.solution.length;
    return rulesOf(mission).rewind ? n * 2 : n;
  }

  function fullSolution(mission) {
    const forward = mission.solution.slice();
    return rulesOf(mission).rewind ? forward.concat(forward.slice().reverse()) : forward;
  }

  // Replay a sequence through the real rules. Returns the final run.
  function simulate(mission, gates) {
    const run = createRun(mission);
    for (const g of gates) {
      const ev = applyMove(run, g);
      if (ev.type === "rejected") return { run: run, ok: false, rejectedAt: g };
    }
    return { run: run, ok: run.status === "won" };
  }

  // Breadth-first search for the shortest forward sequence that wins the forward phase.
  function solve(mission, maxDepth) {
    const depth = maxDepth || 10;
    let frontier = [[]];
    for (let d = 1; d <= depth; d++) {
      const next = [];
      for (const seq of frontier) {
        for (const g of mission.allowedGates) {
          const candidate = seq.concat(g);
          const run = createRun(mission);
          let rejected = false;
          let last = null;
          for (const step of candidate) {
            last = applyMove(run, step);
            if (last.type === "rejected") { rejected = true; break; }
          }
          if (rejected || run.status === "locked") continue;
          if (last && (last.type === "won" || last.type === "rewind-start")) return candidate;
          next.push(candidate);
        }
      }
      frontier = next;
    }
    return null;
  }

  return {
    rulesOf: rulesOf,
    targetMet: targetMet,
    targetLabel: targetLabel,
    targetDescription: targetDescription,
    createRun: createRun,
    canApply: canApply,
    applyMove: applyMove,
    canUndo: canUndo,
    undo: undo,
    reset: reset,
    revealHint: revealHint,
    hintsRemaining: hintsRemaining,
    expectedRewindGate: expectedRewindGate,
    lastGate: lastGate,
    forwardLimit: forwardLimit,
    parMoves: parMoves,
    fullSolution: fullSolution,
    simulate: simulate,
    solve: solve
  };
})();
