"use strict";

// ==========================================================================
// game.js — screens, rendering, controls and saving for Quantum Echo.
// Depends on (loaded before this file): quantum.js, levels.js, engine.js, progress.js
// ==========================================================================

(function () {
  // Every element the game drives. Checked once at start-up so a typo in an ID
  // is reported clearly instead of crashing with "Cannot read properties of null".
  const REQUIRED_IDS = [
    // top bar
    "btn-brand-home", "hud-date", "hud-xp", "hud-rank", "hud-streak", "btn-open-notes", "storage-warning",
    // screens
    "screen-start", "screen-tutorial", "screen-missions", "screen-game", "screen-result",
    // start
    "btn-start", "btn-start-tutorial",
    // tutorial
    "tutorial-body", "tutorial-dots", "tutorial-step-count",
    "btn-tutorial-prev", "btn-tutorial-next", "btn-skip-tutorial", "btn-tutorial-return",
    // mission control
    "core-seg-easy", "core-seg-intermediate", "core-seg-hard",
    "daily-progress-count", "daily-meter", "daily-meter-fill", "daily-bonus-text",
    "control-streak", "control-best-streak", "control-next-rank", "streak-note",
    "board-date", "daily-board", "archive-tabs", "archive-list",
    "btn-mission-tutorial", "btn-reset-progress",
    // puzzle chamber
    "btn-game-back", "btn-game-tutorial", "btn-game-notes",
    "game-mode", "game-difficulty", "game-sector", "level-title", "mission-text", "mission-objective",
    "target-label", "target-condition", "rules-list", "start-label", "phase-label",
    "bloch-svg", "bloch-arrow", "bloch-target", "bloch-prob-band", "bloch-trail", "bloch-waypoints",
    "state-label", "state-note", "amp-a", "amp-b", "amp-phase",
    "prob-0", "prob-1", "bar-0", "bar-1", "prob-sum",
    "move-count", "move-limit", "gate-history", "hints-left",
    "btn-gate-X", "btn-gate-H", "btn-gate-Z", "btn-undo", "btn-reset", "btn-hint",
    "message", "hint-text",
    // results
    "result-kicker", "result-title", "result-narrative", "result-moves", "result-par", "result-xp",
    "result-streak", "result-total-xp", "result-breakdown", "win-sequence",
    "btn-result-next", "btn-result-replay", "btn-result-home",
    // overlays
    "notes-panel", "btn-close-notes",
    "confirm-dialog", "btn-confirm-yes", "btn-confirm-no"
  ];

  const SCREENS = ["screen-start", "screen-tutorial", "screen-missions", "screen-game", "screen-result"];
  const GATES = ["X", "H", "Z"];
  const WIN_DELAY_MS = 1100;
  const CIRCLE = { cx: 180, cy: 180, r: 130 };

  const el = {};

  const app = {
    storage: null,
    progress: null,
    today: null,
    daily: null,
    run: null,
    context: null,          // { mode: "daily" | "training", difficulty, dateKey }
    currentScreen: "screen-start",
    tutorialStep: 0,
    tutorialReturn: "missions",
    archiveFilter: "all",
    blochAngle: 0,
    targetAngle: 0,
    winTimer: null,
    lastResult: null,
    overlayReturnFocus: null
  };

  // ---------------------------------------------------------------- helpers
  function collectElements() {
    const missing = [];
    REQUIRED_IDS.forEach(function (id) {
      el[id] = document.getElementById(id);
      if (!el[id]) missing.push(id);
    });
    return missing;
  }

  function on(id, event, handler) {
    if (!el[id]) {
      console.error("Quantum Echo: cannot bind '" + event + "' — element #" + id + " is missing.");
      return;
    }
    el[id].addEventListener(event, handler);
  }

  function setText(id, text) {
    if (el[id]) el[id].textContent = text;
  }

  function show(node, visible) {
    if (node) node.classList.toggle("hidden", !visible);
  }

  // Tiny DOM builder: h("div", { class: "x" }, ["text", childNode])
  function h(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        const value = attrs[key];
        if (value === null || value === undefined || value === false) return;
        if (key === "class") node.className = value;
        else if (key === "text") node.textContent = value;
        else node.setAttribute(key, value === true ? "" : value);
      });
    }
    (children || []).forEach(function (child) {
      if (child === null || child === undefined || child === false) return;
      node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
    });
    return node;
  }

  function svg(tag, attrs) {
    const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
    Object.keys(attrs || {}).forEach(function (key) {
      if (key === "text") node.textContent = attrs[key];
      else node.setAttribute(key, attrs[key]);
    });
    return node;
  }

  function showFatal(message) {
    const banner = h("div", { class: "fatal-banner", role: "alert" }, [message]);
    document.body.insertBefore(banner, document.body.firstChild);
  }

  // localStorage can throw in private modes / sandboxed frames; fall back to memory.
  function getStorage() {
    try {
      const s = window.localStorage;
      const probe = "__qe_probe__";
      s.setItem(probe, "1");
      s.removeItem(probe);
      return { storage: s, persistent: true };
    } catch (e) {
      const mem = {};
      return {
        persistent: false,
        storage: {
          getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
          setItem: function (k, v) { mem[k] = String(v); },
          removeItem: function (k) { delete mem[k]; }
        }
      };
    }
  }

  // "?date=2026-10-05" lets you preview another day's board (useful for testing rotation).
  function computeToday() {
    try {
      const param = new URLSearchParams(window.location.search).get("date");
      if (param && Progress.isValidDateKey(param)) return param;
    } catch (e) { /* ignore */ }
    return Progress.dateKey(new Date());
  }

  function refreshToday() {
    const key = computeToday();
    if (key !== app.today) {
      app.today = key;
      app.daily = Progress.selectDailyMissions(key, MISSIONS);
    }
  }

  function saveProgress() {
    if (!Progress.save(app.storage, app.progress)) {
      showStorageWarning("Progress could not be saved in this browser. It will last until you close the tab.");
    }
  }

  function showStorageWarning(text) {
    setText("storage-warning", text);
    show(el["storage-warning"], !!text);
  }

  function plural(n, word) {
    return n + " " + word + (n === 1 ? "" : "s");
  }

  function difficultyMeta(key) {
    return DIFFICULTIES[key] || DIFFICULTIES.easy;
  }

  function ruleTags(mission) {
    const r = MissionEngine.rulesOf(mission);
    const tags = [];
    if (r.exactMoves) tags.push("Exactly " + r.exactMoves + " moves");
    if (r.maxMoves) tags.push("Max " + r.maxMoves + " moves");
    if (r.noRepeat) tags.push("Echo Lock");
    if (r.waypoints.length) tags.push(r.waypoints.length === 1 ? "1 waypoint" : r.waypoints.length + " waypoints");
    if (r.rewind) tags.push("Rewind");
    if (mission.target.probability1 !== undefined) tags.push("Probability target");
    return tags;
  }

  // ---------------------------------------------------------------- screens
  function showScreen(id) {
    SCREENS.forEach(function (screenId) {
      show(el[screenId], screenId === id);
    });
    app.currentScreen = id;
    document.body.setAttribute("data-screen", id.replace("screen-", ""));
    window.scrollTo(0, 0);
  }

  function goToMissions() {
    clearWinTimer();
    refreshToday();
    renderMissionControl();
    showScreen("screen-missions");
  }

  function clearWinTimer() {
    if (app.winTimer) {
      clearTimeout(app.winTimer);
      app.winTimer = null;
    }
  }

  // ---------------------------------------------------------------- HUD
  function renderHud() {
    const p = app.progress;
    setText("hud-date", Progress.formatDateLong(app.today));
    setText("hud-xp", String(p.xp));
    setText("hud-rank", Progress.rankFor(p.xp).name);
    setText("hud-streak", String(Progress.currentStreak(p, app.today)));
  }

  // ---------------------------------------------------------------- mission control
  function renderMissionControl() {
    renderHud();
    const p = app.progress;
    const day = Progress.getDay(p, app.today);
    const done = Progress.dailyCompletedCount(p, app.today);

    DIFFICULTY_ORDER.forEach(function (diff) {
      const seg = el["core-seg-" + diff];
      if (seg) seg.classList.toggle("is-done", !!day.completed[diff]);
    });

    setText("daily-progress-count", String(done));
    el["daily-meter"].setAttribute("aria-valuenow", String(done));
    el["daily-meter-fill"].style.width = (done / 3 * 100) + "%";

    if (day.bonus) {
      setText("daily-bonus-text", "All three tiers stabilised. +" + DAILY_BONUS_XP + " XP bonus claimed for today.");
    } else {
      const left = 3 - done;
      setText("daily-bonus-text", "Clear " + left + " more tier" + (left === 1 ? "" : "s") +
        " today for the +" + DAILY_BONUS_XP + " XP stabilisation bonus.");
    }
    el["daily-bonus-text"].classList.toggle("is-claimed", !!day.bonus);

    const streak = Progress.currentStreak(p, app.today);
    setText("control-streak", plural(streak, "day"));
    setText("control-best-streak", plural(p.bestStreak, "day"));
    const rank = Progress.rankFor(p.xp);
    setText("control-next-rank", rank.next ? rank.next.name + " at " + rank.next.xp + " XP" : "Maximum rank");

    let note;
    if (p.lastActiveDate === app.today) {
      note = "Today's streak is secured.";
    } else if (streak > 0) {
      note = "Clear any daily mission today to extend your " + streak + "-day streak.";
    } else if (p.lastActiveDate) {
      note = "Your streak lapsed: a day was missed. Clear a daily mission to start a new one.";
    } else {
      note = "Clear any daily mission to start a streak.";
    }
    setText("streak-note", note);

    setText("board-date", Progress.formatDateLong(app.today));
    renderDailyBoard(day);
    renderArchive();
  }

  function renderDailyBoard(day) {
    const board = el["daily-board"];
    board.textContent = "";

    DIFFICULTY_ORDER.forEach(function (diff) {
      const mission = app.daily[diff];
      const meta = difficultyMeta(diff);
      if (!mission) {
        board.appendChild(h("article", { class: "mission-slot diff-" + diff }, [
          h("p", { class: "slot-empty", text: "No " + meta.label + " missions are available." })
        ]));
        return;
      }
      const completed = day.completed[diff];

      const gateChips = h("span", { class: "chip-row" }, mission.allowedGates.map(function (g) {
        return h("span", { class: "chip chip-gate", text: g });
      }));
      const tags = h("span", { class: "chip-row" }, ruleTags(mission).map(function (t) {
        return h("span", { class: "chip chip-rule", text: t });
      }));

      const status = completed
        ? h("span", { class: "slot-status is-done" }, ["✓ Stabilised in " + plural(completed.moves, "move")])
        : h("span", { class: "slot-status" }, ["● Fracture open"]);

      const slot = h("article", { class: "mission-slot diff-" + diff + (completed ? " is-complete" : "") }, [
        h("div", { class: "slot-tier" }, [
          h("span", { class: "tier-glyph", text: meta.tier.replace("Tier ", "") }),
          h("span", { class: "tier-label", text: meta.label }),
          h("span", { class: "tier-xp", text: "+" + mission.xp + " XP" })
        ]),
        h("div", { class: "slot-body" }, [
          h("p", { class: "slot-sector", text: mission.sector + " · " + mission.concept }),
          h("h3", { class: "slot-title", text: mission.title }),
          h("p", { class: "slot-objective", text: mission.objective }),
          h("div", { class: "slot-tags" }, [gateChips, tags])
        ]),
        h("div", { class: "slot-action" }, [
          status,
          h("button", {
            class: "btn " + (completed ? "btn-secondary" : "btn-primary"),
            type: "button",
            "data-launch": "daily",
            "data-difficulty": diff,
            text: completed ? "Replay" : "Launch"
          })
        ])
      ]);
      board.appendChild(slot);
    });
  }

  function renderArchive() {
    const list = el["archive-list"];
    list.textContent = "";
    const todaysIds = DIFFICULTY_ORDER.map(function (d) { return app.daily[d] && app.daily[d].id; });

    Array.prototype.forEach.call(el["archive-tabs"].querySelectorAll("[data-difficulty]"), function (tab) {
      const active = tab.getAttribute("data-difficulty") === app.archiveFilter;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
    });

    MISSIONS.filter(function (m) {
      return app.archiveFilter === "all" || m.difficulty === app.archiveFilter;
    }).forEach(function (mission) {
      const record = app.progress.missions[mission.id];
      const meta = difficultyMeta(mission.difficulty);
      const isToday = todaysIds.indexOf(mission.id) !== -1;
      list.appendChild(h("li", { class: "archive-row diff-" + mission.difficulty }, [
        h("span", { class: "archive-tier", text: meta.label }),
        h("span", { class: "archive-main" }, [
          h("span", { class: "archive-name", text: mission.title }),
          h("span", { class: "archive-sector", text: mission.sector + " · " + mission.concept })
        ]),
        h("span", { class: "archive-meta" }, [
          isToday ? h("span", { class: "chip chip-today", text: "Today's daily" }) : null,
          h("span", {
            class: "archive-best",
            text: record && record.clears ? "Best " + record.bestMoves + " · par " + MissionEngine.parMoves(mission) : "Uncleared"
          })
        ]),
        h("button", {
          class: "btn btn-ghost btn-small",
          type: "button",
          "data-mission": mission.id,
          "aria-label": "Simulate " + mission.title,
          text: "Simulate"
        })
      ]));
    });
  }

  // ---------------------------------------------------------------- missions
  function startDailyMission(difficulty) {
    refreshToday();
    const mission = app.daily[difficulty];
    if (!mission) return;
    startMission(mission, { mode: "daily", difficulty: difficulty, dateKey: app.today });
  }

  function startTrainingMission(id) {
    const mission = getMissionById(id);
    if (!mission) {
      console.error("Quantum Echo: unknown mission id " + id);
      return;
    }
    startMission(mission, { mode: "training", difficulty: mission.difficulty, dateKey: app.today });
  }

  function startMission(mission, context) {
    clearWinTimer();
    app.context = context;
    app.run = MissionEngine.createRun(mission);
    app.blochAngle = blochAngleFor(app.run.state);
    clearHintList();
    setMessage("Briefing received. " + mission.objective, "info");
    renderGame(true);
    showScreen("screen-game");
  }

  // ---------------------------------------------------------------- puzzle chamber
  function blochAngleFor(state) {
    const v = Quantum.blochVector(state);
    return Math.atan2(v.x, v.z) * 180 / Math.PI; // 0° = |0⟩ (top), 90° = |+⟩ (right)
  }

  function smoothAngle(previous, target) {
    let delta = ((target - previous) % 360 + 540) % 360 - 180;
    if (delta === -180) delta = 180;
    return previous + delta;
  }

  function circlePoint(state, radius) {
    const v = Quantum.blochVector(state);
    const r = radius || CIRCLE.r;
    return { x: CIRCLE.cx + r * v.x, y: CIRCLE.cy - r * v.z };
  }

  function setRotation(node, angle) {
    node.style.transform = "rotate(" + angle + "deg)";
  }

  function renderGame(fresh) {
    const run = app.run;
    if (!run) return;
    const mission = run.mission;
    const meta = difficultyMeta(mission.difficulty);
    const rules = MissionEngine.rulesOf(mission);

    // Briefing
    setText("game-mode", app.context.mode === "daily" ? "Daily fracture" : "Simulation");
    setText("game-difficulty", meta.tier + " · " + meta.label);
    setText("game-sector", mission.sector);
    setText("level-title", mission.title);
    setText("mission-text", mission.intro);
    setText("mission-objective", mission.objective);
    setText("target-label", MissionEngine.targetLabel(mission));
    setText("target-condition", MissionEngine.targetDescription(mission));
    setText("start-label", mission.start);
    el["screen-game"].setAttribute("data-difficulty", mission.difficulty);

    renderRules(rules);
    renderState(fresh);
    renderConsole(rules);
  }

  function renderRules(rules) {
    const run = app.run;
    const list = el["rules-list"];
    list.textContent = "";

    function rule(label, detail, status) {
      list.appendChild(h("li", { class: "rule " + (status ? "is-" + status : "") }, [
        h("span", { class: "rule-label", text: label }),
        detail ? h("span", { class: "rule-detail", text: detail }) : null
      ]));
    }

    rule("Gates online", run.mission.allowedGates.join(" · "));
    if (rules.exactMoves) rule("Exact moves", "Judged at move " + rules.exactMoves);
    if (rules.maxMoves) rule("Move budget", "At most " + rules.maxMoves);
    if (rules.noRepeat) rule("Echo Lock", "No gate twice in a row");
    rules.waypoints.forEach(function (wp, i) {
      const status = i < run.waypointIndex ? "done" : (i === run.waypointIndex ? "next" : "pending");
      rule("Waypoint " + (i + 1), wp + (status === "done" ? " ✓ reached" : status === "next" ? " ← next" : ""), status);
    });
    if (rules.rewind) {
      const detail = run.phase === "REWIND"
        ? run.rewindHistory.length + " / " + run.forwardHistory.length + " gates reversed"
        : (run.status === "won" ? "Complete" : "Unlocks after the target");
      rule("Rewind", detail, run.phase === "REWIND" ? "next" : (run.status === "won" ? "done" : "pending"));
    }
  }

  function renderState(fresh) {
    const run = app.run;
    const state = run.state;
    const mission = run.mission;

    // Needle
    const target = blochAngleFor(state);
    app.blochAngle = fresh ? target : smoothAngle(app.blochAngle, target);
    if (fresh) el["bloch-arrow"].classList.add("no-anim");
    setRotation(el["bloch-arrow"], app.blochAngle);
    if (fresh) {
      void el["bloch-arrow"].getBoundingClientRect();
      el["bloch-arrow"].classList.remove("no-anim");
    }

    // Target marker or probability band
    if (mission.target.state) {
      show(el["bloch-target"], true);
      show(el["bloch-prob-band"], false);
      setRotation(el["bloch-target"], blochAngleFor(Quantum.stateFromLabel(mission.target.state)));
    } else {
      show(el["bloch-target"], false);
      show(el["bloch-prob-band"], true);
    }

    // Waypoints
    const wpGroup = el["bloch-waypoints"];
    wpGroup.textContent = "";
    MissionEngine.rulesOf(mission).waypoints.forEach(function (label, i) {
      const pt = circlePoint(Quantum.stateFromLabel(label));
      const cls = i < run.waypointIndex ? "done" : (i === run.waypointIndex ? "next" : "pending");
      const g = svg("g", { class: "waypoint is-" + cls, transform: "translate(" + pt.x + " " + pt.y + ")" });
      g.appendChild(svg("rect", { x: -9, y: -9, width: 18, height: 18, transform: "rotate(45)" }));
      g.appendChild(svg("text", { x: 0, y: 4, text: String(i + 1) }));
      wpGroup.appendChild(g);
    });

    // Trail of visited states
    const trail = el["bloch-trail"];
    trail.textContent = "";
    const seen = {};
    run.trail.forEach(function (s) {
      const pt = circlePoint(s);
      const key = Math.round(pt.x) + "," + Math.round(pt.y);
      if (seen[key]) return;
      seen[key] = true;
      trail.appendChild(svg("circle", { cx: pt.x, cy: pt.y, r: 4, class: "trail-dot" }));
    });

    // State label
    const id = Quantum.identifyState(state);
    setText("state-label", id ? id.fullLabel : Quantum.getStateLabel(state));
    setText("state-note", id && id.hasGlobalPhase
      ? "≡ " + id.label + ", differing only by a global phase (same physical state)"
      : "");

    // Amplitudes
    setText("amp-a", Quantum.formatComplex(state.a));
    setText("amp-b", Quantum.formatComplex(state.b));
    el["amp-a"].classList.toggle("is-negative", state.a.re < -1e-9);
    el["amp-b"].classList.toggle("is-negative", state.b.re < -1e-9);
    const rel = Quantum.relativePhaseDegrees(state);
    setText("amp-phase", rel === null ? "n/a at a pole" : Math.round(rel) + "°");

    // Probabilities
    const p = Quantum.getProbabilities(state);
    setText("prob-0", (p.p0 * 100).toFixed(1) + "%");
    setText("prob-1", (p.p1 * 100).toFixed(1) + "%");
    el["bar-0"].style.width = Math.max(0, Math.min(100, p.p0 * 100)) + "%";
    el["bar-1"].style.width = Math.max(0, Math.min(100, p.p1 * 100)) + "%";
    setText("prob-sum", (p.p0 + p.p1).toFixed(3));

    // Phase badge
    const badge = run.status === "won" ? "STABILISED" : run.status === "locked" ? "LOCKED" : run.phase;
    setText("phase-label", badge);
    el["phase-label"].className = "phase-badge is-" + badge.toLowerCase();
    el["screen-game"].classList.toggle("is-won", run.status === "won");
    el["screen-game"].classList.toggle("is-rewind", run.phase === "REWIND" && run.status !== "won");
  }

  function renderConsole(rules) {
    const run = app.run;

    setText("move-count", String(run.moves));
    let limit = "";
    if (run.phase === "REWIND") limit = " · rewind " + run.rewindHistory.length + "/" + run.forwardHistory.length;
    else if (rules.exactMoves) limit = " / exactly " + rules.exactMoves;
    else if (rules.maxMoves) limit = " / max " + rules.maxMoves;
    setText("move-limit", limit);

    renderHistoryChips(el["gate-history"], run.forwardHistory, run.rewindHistory, run.phase === "REWIND");

    const remaining = MissionEngine.hintsRemaining(run);
    setText("hints-left", String(remaining));
    el["btn-hint"].disabled = remaining <= 0;
    el["btn-hint"].textContent = remaining > 0 ? "✦ Hint (" + remaining + ")" : "No hints left";

    el["btn-undo"].disabled = !MissionEngine.canUndo(run);
    el["btn-reset"].disabled = run.status === "won";

    const last = MissionEngine.lastGate(run);
    GATES.forEach(function (g) {
      const btn = el["btn-gate-" + g];
      const allowed = run.mission.allowedGates.indexOf(g) !== -1;
      const echoLocked = rules.noRepeat && run.phase === "FORWARD" && last === g;
      btn.disabled = !allowed || run.status !== "active";
      btn.classList.toggle("is-offline", !allowed);
      btn.classList.toggle("is-echo-locked", allowed && echoLocked);
      btn.setAttribute("title", !allowed ? "Gate " + g + " is offline in this sector"
        : echoLocked ? "Echo Lock: " + g + " was just used" : Quantum.GATES[g].name + " gate");
      const nameNode = btn.querySelector(".gate-name");
      if (nameNode) {
        nameNode.textContent = !allowed ? "Offline" : echoLocked ? "Echo locked" : Quantum.GATES[g].nickname;
      }
    });
  }

  function renderHistoryChips(container, forward, rewind, showRewind) {
    container.textContent = "";
    if (!forward.length && !(rewind && rewind.length)) {
      container.appendChild(h("span", { class: "chip-empty", text: "None" }));
      return;
    }
    forward.forEach(function (g) {
      container.appendChild(h("span", { class: "chip chip-gate", text: g }));
    });
    if (showRewind || (rewind && rewind.length)) {
      container.appendChild(h("span", { class: "chip-sep", text: "⟲" }));
      rewind.forEach(function (g) {
        container.appendChild(h("span", { class: "chip chip-gate chip-rewind", text: g }));
      });
    }
  }

  function setMessage(text, tone) {
    const node = el["message"];
    if (!node) return;
    node.textContent = text;
    node.className = "message-text" + (tone ? " tone-" + tone : "");
  }

  function clearHintList() {
    el["hint-text"].textContent = "";
  }

  function flash(node, cls) {
    if (!node) return;
    node.classList.remove(cls);
    void node.getBoundingClientRect();
    node.classList.add(cls);
  }

  // ---------------------------------------------------------------- gameplay actions
  function pressGate(gate) {
    const run = app.run;
    if (!run || app.currentScreen !== "screen-game") return;

    const before = run.state;
    const beforeLabel = Quantum.getStateLabel(before);
    const event = MissionEngine.applyMove(run, gate);

    if (event.type === "rejected") {
      setMessage(event.message, "warn");
      flash(el["btn-gate-" + gate], "is-denied");
      return;
    }

    flash(el["btn-gate-" + gate], "is-fired");
    flash(el["bloch-svg"], "is-pulse");
    const afterLabel = Quantum.getStateLabel(run.state);
    const transition = gate + " applied: " + beforeLabel + " → " + afterLabel + ".";

    switch (event.type) {
      case "applied": {
        let text = transition;
        if (event.waypoint) {
          text += " Waypoint " + event.waypoint + " reached (" + run.waypointIndex + "/" +
            MissionEngine.rulesOf(run.mission).waypoints.length + ").";
        }
        if (run.phase === "REWIND" && event.rewindNext) text += " Keep rewinding.";
        const id = Quantum.identifyState(run.state);
        if (id && id.hasGlobalPhase) text += " (A leading " + id.prefix + " is only a global phase.)";
        setMessage(text, event.waypoint ? "good" : "info");
        break;
      }
      case "locked":
        setMessage(transition + " " + event.message, "warn");
        break;
      case "rewind-start":
        setMessage(transition + " Target reached. " + event.message, "good");
        break;
      case "rewind-wrong":
        setMessage(event.message, "warn");
        break;
      case "won":
        setMessage(transition + " Timeline stabilised!", "win");
        break;
    }

    renderGame(false);

    if (event.type === "won") {
      completeMission();
    }
  }

  function undoMove() {
    const run = app.run;
    if (!run || app.currentScreen !== "screen-game") return;
    if (!MissionEngine.undo(run)) {
      setMessage("Nothing to undo yet.", "info");
      return;
    }
    setMessage("Undo: the last move was rewound. State is " + Quantum.getStateLabel(run.state) + ", " +
      run.moves + (run.moves === 1 ? " move" : " moves") + " used.", "info");
    renderGame(false);
  }

  function resetPuzzle() {
    if (!app.run || app.run.status === "won") return;
    app.run = MissionEngine.reset(app.run);
    setMessage("Puzzle reset to " + app.run.mission.start + ". Your saved XP and streak are untouched.", "info");
    renderGame(false);
  }

  function showHint() {
    const run = app.run;
    if (!run) return;
    const hint = MissionEngine.revealHint(run);
    if (!hint) {
      setMessage("No hints left for this mission.", "warn");
      renderGame(false);
      return;
    }
    renderHintList();
    setMessage("Hint " + run.hintsUsed + " decrypted.", "info");
    renderGame(false);
  }

  function renderHintList() {
    const run = app.run;
    const list = el["hint-text"];
    list.textContent = "";
    run.mission.hints.slice(0, run.hintsUsed).forEach(function (text, i) {
      list.appendChild(h("li", { class: "hint-item" }, [
        h("span", { class: "hint-index", text: "Hint " + (i + 1) }),
        h("span", { text: text })
      ]));
    });
  }

  // ---------------------------------------------------------------- completion and results
  function completeMission() {
    const run = app.run;
    const mission = run.mission;
    const ctx = app.context;
    let report = null;

    // Rewards are saved immediately so nothing is lost if the player navigates away.
    if (ctx.mode === "daily") {
      report = Progress.recordDailyCompletion(app.progress, ctx.dateKey, ctx.difficulty, mission, run.moves, DAILY_BONUS_XP);
    } else {
      Progress.recordMissionClear(app.progress, mission.id, run.moves);
    }
    saveProgress();
    renderHud();

    app.lastResult = { mission: mission, context: ctx, run: run, report: report };
    clearWinTimer();
    app.winTimer = setTimeout(function () {
      app.winTimer = null;
      renderResult();
      showScreen("screen-result");
    }, WIN_DELAY_MS);
  }

  function renderResult() {
    const res = app.lastResult;
    if (!res) return;
    const mission = res.mission;
    const run = res.run;
    const meta = difficultyMeta(mission.difficulty);
    const report = res.report;
    const par = MissionEngine.parMoves(mission);
    const streak = Progress.currentStreak(app.progress, app.today);

    setText("result-kicker", res.context.mode === "daily"
      ? "Daily fracture sealed · " + meta.tier + " " + meta.label
      : "Simulation complete · " + meta.tier + " " + meta.label);
    setText("result-title", mission.title);
    setText("result-narrative", mission.completion);
    setText("result-moves", String(run.moves));
    setText("result-par", String(par));
    const earned = report ? report.missionXp + report.bonusXp : 0;
    setText("result-xp", "+" + earned);
    setText("result-streak", plural(streak, "day"));
    setText("result-total-xp", String(app.progress.xp));

    const lines = [];
    if (report) {
      if (report.alreadyClaimed) {
        lines.push({ tone: "muted", text: "No XP: the " + meta.label + " tier was already claimed today. Replays are for practice." });
      } else {
        lines.push({ tone: "good", text: "+" + report.missionXp + " XP for sealing the " + meta.label + " fracture." });
      }
      if (report.bonusXp) {
        lines.push({ tone: "gold", text: "+" + report.bonusXp + " XP stabilisation bonus: all three tiers cleared today!" });
      } else if (!report.allThreeDone) {
        const left = 3 - Progress.dailyCompletedCount(app.progress, res.context.dateKey);
        lines.push({ tone: "muted", text: left + " tier" + (left === 1 ? "" : "s") + " left today for the +" + DAILY_BONUS_XP + " XP bonus." });
      }
      if (report.streakIncreased) {
        lines.push({ tone: "good", text: report.streakAfter === 1 ? "Streak started: 1 day." : "Streak extended to " + report.streakAfter + " days." });
      }
    } else {
      lines.push({ tone: "muted", text: "Simulation: no XP awarded. Your best move count was recorded." });
    }
    lines.push({
      tone: run.moves <= par ? "good" : "muted",
      text: run.moves <= par ? "Par achieved: the shortest possible solution." : (run.moves - par) + " move" + (run.moves - par === 1 ? "" : "s") + " over par (" + par + ")."
    });
    if (run.hintsUsed) lines.push({ tone: "muted", text: "Hints used: " + run.hintsUsed + "." });

    const list = el["result-breakdown"];
    list.textContent = "";
    lines.forEach(function (line) {
      list.appendChild(h("li", { class: "tone-" + line.tone, text: line.text }));
    });

    renderHistoryChips(el["win-sequence"], run.forwardHistory, run.rewindHistory, run.rewindHistory.length > 0);

    // Next action
    const next = nextMissionAfter(res);
    const nextBtn = el["btn-result-next"];
    if (next) {
      nextBtn.textContent = next.label;
      nextBtn.dataset.mode = next.mode;
      nextBtn.dataset.target = next.target;
      show(nextBtn, true);
    } else {
      show(nextBtn, false);
    }
  }

  function nextMissionAfter(res) {
    if (res.context.mode === "daily") {
      refreshToday();
      const day = Progress.getDay(app.progress, app.today);
      const pending = DIFFICULTY_ORDER.find(function (d) { return !day.completed[d] && app.daily[d]; });
      if (!pending) return null;
      return { mode: "daily", target: pending, label: "Next: " + difficultyMeta(pending).label + " fracture" };
    }
    const pool = MISSIONS.filter(function (m) {
      return app.archiveFilter === "all" || m.difficulty === app.archiveFilter;
    });
    const idx = pool.findIndex(function (m) { return m.id === res.mission.id; });
    const nextMission = idx >= 0 ? pool[idx + 1] : null;
    if (!nextMission) return null;
    return { mode: "training", target: nextMission.id, label: "Next simulation" };
  }

  function launchNext() {
    const btn = el["btn-result-next"];
    if (btn.dataset.mode === "daily") startDailyMission(btn.dataset.target);
    else if (btn.dataset.mode === "training") startTrainingMission(btn.dataset.target);
  }

  function replayLast() {
    const res = app.lastResult;
    if (!res) return goToMissions();
    if (res.context.mode === "daily") startDailyMission(res.context.difficulty);
    else startTrainingMission(res.mission.id);
  }

  // ---------------------------------------------------------------- tutorial
  function tutorialSteps() {
    return el["tutorial-body"].querySelectorAll(".tutorial-step");
  }

  function openTutorial(returnTo) {
    app.tutorialReturn = returnTo;
    if (returnTo !== "game") app.tutorialStep = 0;
    show(el["btn-tutorial-return"], returnTo === "game");
    renderTutorial();
    showScreen("screen-tutorial");
  }

  function renderTutorial() {
    const steps = tutorialSteps();
    const total = steps.length;
    app.tutorialStep = Math.max(0, Math.min(total - 1, app.tutorialStep));
    Array.prototype.forEach.call(steps, function (step, i) {
      show(step, i === app.tutorialStep);
    });
    setText("tutorial-step-count", (app.tutorialStep + 1) + " / " + total);

    const dots = el["tutorial-dots"];
    dots.textContent = "";
    for (let i = 0; i < total; i++) {
      dots.appendChild(h("span", { class: "dot" + (i === app.tutorialStep ? " is-active" : i < app.tutorialStep ? " is-done" : "") }));
    }

    el["btn-tutorial-prev"].disabled = app.tutorialStep === 0;
    const last = app.tutorialStep === total - 1;
    el["btn-tutorial-next"].textContent = last
      ? (app.tutorialReturn === "game" ? "Finish: back to mission" : "Finish: to Mission Control")
      : "Next";
  }

  function tutorialNext() {
    const total = tutorialSteps().length;
    if (app.tutorialStep < total - 1) {
      app.tutorialStep++;
      renderTutorial();
    } else {
      finishTutorial();
    }
  }

  function tutorialPrev() {
    if (app.tutorialStep > 0) {
      app.tutorialStep--;
      renderTutorial();
    }
  }

  function finishTutorial() {
    if (!app.progress.tutorialSeen) {
      app.progress.tutorialSeen = true;
      saveProgress();
    }
    if (app.tutorialReturn === "game" && app.run) {
      returnToGame();
    } else {
      goToMissions();
    }
  }

  // Back to the same puzzle, with its state exactly as it was left.
  function returnToGame() {
    if (!app.run) return goToMissions();
    renderGame(true);
    showScreen("screen-game");
    if (app.run.status === "won") {
      renderResult();
      showScreen("screen-result");
    }
  }

  // ---------------------------------------------------------------- overlays
  function openOverlay(id, focusId) {
    app.overlayReturnFocus = document.activeElement;
    show(el[id], true);
    document.body.classList.add("has-overlay");
    if (el[focusId]) el[focusId].focus();
  }

  function closeOverlay(id) {
    show(el[id], false);
    if (el["notes-panel"].classList.contains("hidden") && el["confirm-dialog"].classList.contains("hidden")) {
      document.body.classList.remove("has-overlay");
    }
    if (app.overlayReturnFocus && app.overlayReturnFocus.focus) app.overlayReturnFocus.focus();
  }

  function openNotes() { openOverlay("notes-panel", "btn-close-notes"); }
  function closeNotes() { closeOverlay("notes-panel"); }

  function askResetProgress() { openOverlay("confirm-dialog", "btn-confirm-no"); }

  function confirmResetProgress() {
    app.progress = Progress.clear(app.storage);
    showStorageWarning("");
    saveProgress();
    closeOverlay("confirm-dialog");
    renderMissionControl();
  }

  function isOpen(id) {
    return el[id] && !el[id].classList.contains("hidden");
  }

  // ---------------------------------------------------------------- input
  function onKeyDown(e) {
    if (e.key === "Escape") {
      if (isOpen("confirm-dialog")) { closeOverlay("confirm-dialog"); e.preventDefault(); return; }
      if (isOpen("notes-panel")) { closeNotes(); e.preventDefault(); return; }
    }
    if (isOpen("confirm-dialog") || isOpen("notes-panel")) return;
    if (app.currentScreen !== "screen-game") return;
    const tag = (e.target && e.target.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA") return;

    if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z")) {
      e.preventDefault();
      undoMove();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    const key = e.key.toUpperCase();
    if (GATES.indexOf(key) !== -1) {
      e.preventDefault();
      pressGate(key);
    } else if (key === "U") {
      e.preventDefault();
      undoMove();
    }
  }

  function bindEvents() {
    on("btn-brand-home", "click", goToMissions);
    on("btn-open-notes", "click", openNotes);
    on("btn-close-notes", "click", closeNotes);
    on("notes-panel", "click", function (e) { if (e.target === el["notes-panel"]) closeNotes(); });

    on("btn-start", "click", goToMissions);
    on("btn-start-tutorial", "click", function () { openTutorial("missions"); });

    on("btn-tutorial-prev", "click", tutorialPrev);
    on("btn-tutorial-next", "click", tutorialNext);
    on("btn-skip-tutorial", "click", finishTutorial);
    on("btn-tutorial-return", "click", returnToGame);

    on("daily-board", "click", function (e) {
      const btn = e.target.closest("[data-launch]");
      if (btn) startDailyMission(btn.getAttribute("data-difficulty"));
    });
    on("archive-list", "click", function (e) {
      const btn = e.target.closest("[data-mission]");
      if (btn) startTrainingMission(btn.getAttribute("data-mission"));
    });
    on("archive-tabs", "click", function (e) {
      const tab = e.target.closest("[data-difficulty]");
      if (!tab) return;
      app.archiveFilter = tab.getAttribute("data-difficulty");
      renderArchive();
    });
    on("btn-mission-tutorial", "click", function () { openTutorial("missions"); });
    on("btn-reset-progress", "click", askResetProgress);
    on("btn-confirm-yes", "click", confirmResetProgress);
    on("btn-confirm-no", "click", function () { closeOverlay("confirm-dialog"); });
    on("confirm-dialog", "click", function (e) { if (e.target === el["confirm-dialog"]) closeOverlay("confirm-dialog"); });

    on("btn-game-back", "click", goToMissions);
    on("btn-game-tutorial", "click", function () { openTutorial("game"); });
    on("btn-game-notes", "click", openNotes);
    GATES.forEach(function (g) {
      on("btn-gate-" + g, "click", function () { pressGate(g); });
    });
    on("btn-undo", "click", undoMove);
    on("btn-reset", "click", resetPuzzle);
    on("btn-hint", "click", showHint);

    on("btn-result-next", "click", launchNext);
    on("btn-result-replay", "click", replayLast);
    on("btn-result-home", "click", goToMissions);

    document.addEventListener("keydown", onKeyDown);
  }

  // ---------------------------------------------------------------- start-up
  function init() {
    const missingScripts = ["Quantum", "MissionEngine", "Progress"].filter(function (name) {
      return typeof window[name] === "undefined";
    });
    if (missingScripts.length || typeof MISSIONS === "undefined") {
      showFatal("Quantum Echo could not start: a script file failed to load (" +
        missingScripts.concat(typeof MISSIONS === "undefined" ? ["levels.js"] : []).join(", ") +
        "). Check that the js/ folder sits next to index.html.");
      return;
    }

    const missing = collectElements();
    if (missing.length) {
      console.error("Quantum Echo: missing elements: #" + missing.join(", #"));
      showFatal("Quantum Echo: some page elements are missing (" + missing.join(", ") + "). The rest of the game will still try to run.");
    }

    const store = getStorage();
    app.storage = store.storage;
    const loaded = Progress.load(app.storage);
    app.progress = loaded.progress;
    if (!store.persistent) {
      showStorageWarning("This browser is blocking local storage, so progress will last only until you close the tab.");
    } else if (loaded.warning) {
      showStorageWarning(loaded.warning);
    }

    refreshToday();
    bindEvents();

    try {
      renderMissionControl();
    } catch (err) {
      console.error(err);
      showFatal("Mission Control failed to render: " + err.message);
    }
    showScreen("screen-start");

    // Exposed for debugging in the browser console.
    window.QuantumEchoDebug = { app: app };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
