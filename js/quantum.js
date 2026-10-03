"use strict";

// ==========================================================================
// quantum.js — single-qubit simulator for Quantum Echo
//
// A qubit state is  α|0⟩ + β|1⟩  where α and β are COMPLEX amplitudes.
// In code a state is { a: {re, im}, b: {re, im} }.
//
// Evolved from the original prototype (createInitialState, applyGate,
// getProbabilities, getStateLabel, statesEquivalent, applyGateSequence,
// approximatelyEqual, isNormalized). Those functions are kept, now with
// complex numbers and global-phase-aware comparison.
// ==========================================================================

var Quantum = (function () {
  const SQRT2 = Math.SQRT2;
  const INV_SQRT2 = 1 / SQRT2;
  const EPSILON = 1e-9;

  // ---------- Complex number helpers ----------
  function complex(re, im) {
    return { re: re, im: im || 0 };
  }

  function cAdd(p, q) { return complex(p.re + q.re, p.im + q.im); }
  function cMul(p, q) { return complex(p.re * q.re - p.im * q.im, p.re * q.im + p.im * q.re); }
  function cConj(p) { return complex(p.re, -p.im); }
  function cAbs2(p) { return p.re * p.re + p.im * p.im; }
  function cArg(p) { return Math.atan2(p.im, p.re); }

  // Floating-point comparison
  function approximatelyEqual(x, y, tolerance) {
    return Math.abs(x - y) < (tolerance === undefined ? EPSILON : tolerance);
  }

  function complexApproxEqual(p, q, tolerance) {
    return approximatelyEqual(p.re, q.re, tolerance) && approximatelyEqual(p.im, q.im, tolerance);
  }

  // ---------- States ----------
  function makeState(a, b) {
    return { a: complex(a.re, a.im), b: complex(b.re, b.im) };
  }

  function copyState(s) {
    return makeState(s.a, s.b);
  }

  // Create initial state |0⟩
  function createInitialState() {
    return makeState(complex(1), complex(0));
  }

  // The four states reachable with X, H and Z, plus the Y-axis states for completeness.
  const NAMED_STATES = [
    { key: "0", label: "|0⟩", a: complex(1), b: complex(0) },
    { key: "1", label: "|1⟩", a: complex(0), b: complex(1) },
    { key: "+", label: "|+⟩", a: complex(INV_SQRT2), b: complex(INV_SQRT2) },
    { key: "-", label: "|−⟩", a: complex(INV_SQRT2), b: complex(-INV_SQRT2) },
    { key: "+i", label: "|+i⟩", a: complex(INV_SQRT2), b: complex(0, INV_SQRT2) },
    { key: "-i", label: "|−i⟩", a: complex(INV_SQRT2), b: complex(0, -INV_SQRT2) }
  ];

  // Accepts "|0⟩", "|1⟩", "|+⟩", "|−⟩" (or "|-⟩"), "0", "+", "-", ...
  function normalizeLabel(label) {
    return String(label)
      .replace(/[|⟩>\s]/g, "")
      .replace(/−/g, "-");
  }

  function stateFromLabel(label) {
    const key = normalizeLabel(label);
    const named = NAMED_STATES.find(function (n) { return n.key === key; });
    if (!named) {
      throw new Error("Unknown state label: " + label);
    }
    return makeState(named.a, named.b);
  }

  // ---------- Gates (2x2 unitary matrices) ----------
  const GATES = {
    X: {
      name: "Pauli-X",
      nickname: "Bit flip",
      matrix: [[complex(0), complex(1)], [complex(1), complex(0)]],
      matrixText: ["0  1", "1  0"]
    },
    H: {
      name: "Hadamard",
      nickname: "Superposition",
      matrix: [[complex(INV_SQRT2), complex(INV_SQRT2)], [complex(INV_SQRT2), complex(-INV_SQRT2)]],
      matrixText: ["1  1", "1 −1"],
      matrixPrefix: "1/√2"
    },
    Z: {
      name: "Pauli-Z",
      nickname: "Phase flip",
      matrix: [[complex(1), complex(0)], [complex(0), complex(-1)]],
      matrixText: ["1  0", "0 −1"]
    }
  };

  // Apply X, H, or Z gate: new = M · [α, β]
  function applyGate(state, gate) {
    const g = GATES[gate];
    if (!g) {
      throw new Error("Unknown quantum gate: " + gate);
    }
    const m = g.matrix;
    return makeState(
      cAdd(cMul(m[0][0], state.a), cMul(m[0][1], state.b)),
      cAdd(cMul(m[1][0], state.a), cMul(m[1][1], state.b))
    );
  }

  // Apply multiple gates in sequence
  function applyGateSequence(state, gates) {
    let current = copyState(state);
    for (const gate of gates) {
      current = applyGate(current, gate);
    }
    return current;
  }

  // ---------- Measurement probabilities (Born rule) ----------
  function getProbabilities(state) {
    return {
      p0: cAbs2(state.a),
      p1: cAbs2(state.b)
    };
  }

  // Check normalization: |α|² + |β|² = 1
  function isNormalized(state, tolerance) {
    const p = getProbabilities(state);
    return approximatelyEqual(p.p0 + p.p1, 1, tolerance === undefined ? 1e-9 : tolerance);
  }

  // ---------- Comparing states ----------
  // Inner product ⟨s|t⟩ = conj(αs)·αt + conj(βs)·βt
  function innerProduct(s, t) {
    return cAdd(cMul(cConj(s.a), t.a), cMul(cConj(s.b), t.b));
  }

  // Fidelity |⟨s|t⟩|²: 1 for physically identical pure states, 0 for orthogonal ones.
  function fidelity(s, t) {
    return cAbs2(innerProduct(s, t));
  }

  // Physically equivalent: equal up to a global phase factor e^{iφ}.
  function statesEquivalent(s, t) {
    return approximatelyEqual(fidelity(s, t), 1, 1e-9);
  }

  // Identical amplitudes (no global-phase allowance).
  function statesIdentical(s, t) {
    return complexApproxEqual(s.a, t.a) && complexApproxEqual(s.b, t.b);
  }

  // If s = e^{iφ}·named, return that factor e^{iφ} = ⟨named|s⟩
  function globalPhaseFactor(named, s) {
    return innerProduct(named, s);
  }

  function phaseFactorPrefix(f) {
    if (complexApproxEqual(f, complex(1), 1e-6)) return "";
    if (complexApproxEqual(f, complex(-1), 1e-6)) return "−";
    if (complexApproxEqual(f, complex(0, 1), 1e-6)) return "i";
    if (complexApproxEqual(f, complex(0, -1), 1e-6)) return "−i";
    return "e^{i" + Math.round(cArg(f) * 180 / Math.PI) + "°}";
  }

  // Identify which named state this is (up to global phase).
  // Returns { named, label, globalPhase, prefix } or null for other states.
  function identifyState(state) {
    for (const named of NAMED_STATES) {
      const ns = makeState(named.a, named.b);
      if (statesEquivalent(state, ns)) {
        const factor = globalPhaseFactor(ns, state);
        const prefix = phaseFactorPrefix(factor);
        return {
          key: named.key,
          label: named.label,
          prefix: prefix,
          hasGlobalPhase: prefix !== "",
          fullLabel: prefix + named.label
        };
      }
    }
    return null;
  }

  // Get a readable state label, e.g. "|+⟩" or "−|1⟩"
  function getStateLabel(state) {
    const id = identifyState(state);
    return id ? id.fullLabel : "α|0⟩ + β|1⟩";
  }

  // Relative phase φ in  α|0⟩ + e^{iφ}·(|β|/|α|)·... — only defined when both amplitudes are non-zero.
  function relativePhaseDegrees(state) {
    if (cAbs2(state.a) < 1e-12 || cAbs2(state.b) < 1e-12) return null;
    let deg = (cArg(state.b) - cArg(state.a)) * 180 / Math.PI;
    deg = ((deg % 360) + 360) % 360;
    if (approximatelyEqual(deg, 360, 1e-6)) deg = 0;
    return deg;
  }

  // Bloch vector (x, y, z). |0⟩ → z=+1, |1⟩ → z=−1, |+⟩ → x=+1, |−⟩ → x=−1.
  function blochVector(state) {
    const ab = cMul(cConj(state.a), state.b);
    const p = getProbabilities(state);
    return { x: 2 * ab.re, y: 2 * ab.im, z: p.p0 - p.p1 };
  }

  // ---------- Formatting ----------
  function formatReal(x, digits) {
    const d = digits === undefined ? 3 : digits;
    if (Math.abs(x) < 0.5 * Math.pow(10, -d)) x = 0;
    const text = Math.abs(x).toFixed(d);
    return (x < 0 ? "−" : "+") + text;
  }

  function formatComplex(c, digits) {
    const d = digits === undefined ? 3 : digits;
    const tiny = 0.5 * Math.pow(10, -d);
    const hasRe = Math.abs(c.re) >= tiny;
    const hasIm = Math.abs(c.im) >= tiny;
    if (!hasIm) return formatReal(c.re, d);
    if (!hasRe) return formatReal(c.im, d) + "i";
    return formatReal(c.re, d) + " " + (c.im < 0 ? "−" : "+") + " " + Math.abs(c.im).toFixed(d) + "i";
  }

  return {
    SQRT2: SQRT2,
    EPSILON: EPSILON,
    GATE_NAMES: Object.keys(GATES),
    GATES: GATES,
    NAMED_STATES: NAMED_STATES,
    complex: complex,
    createInitialState: createInitialState,
    copyState: copyState,
    stateFromLabel: stateFromLabel,
    applyGate: applyGate,
    applyGateSequence: applyGateSequence,
    getProbabilities: getProbabilities,
    isNormalized: isNormalized,
    innerProduct: innerProduct,
    fidelity: fidelity,
    statesEquivalent: statesEquivalent,
    statesIdentical: statesIdentical,
    identifyState: identifyState,
    getStateLabel: getStateLabel,
    relativePhaseDegrees: relativePhaseDegrees,
    blochVector: blochVector,
    approximatelyEqual: approximatelyEqual,
    formatReal: formatReal,
    formatComplex: formatComplex
  };
})();
