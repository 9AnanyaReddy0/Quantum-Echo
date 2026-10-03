"use strict";

// ==========================================================================
// progress.js — dates, daily mission rotation, XP, streaks and saving.
// Pure functions + a small localStorage wrapper. No DOM access.
// ==========================================================================

var Progress = (function () {
  const STORAGE_KEY = "quantumEcho.progress.v1";
  const CORRUPT_KEY = "quantumEcho.progress.corrupt";
  const VERSION = 1;
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  const RANKS = [
    { xp: 0, name: "Cadet" },
    { xp: 150, name: "Calibrator" },
    { xp: 400, name: "Phase Technician" },
    { xp: 900, name: "Interference Engineer" },
    { xp: 1600, name: "Timeline Warden" },
    { xp: 2500, name: "Echo Architect" }
  ];

  // ---------- Dates (local calendar) ----------
  function pad(n) { return (n < 10 ? "0" : "") + n; }

  function dateKey(date) {
    const d = date || new Date();
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  function isValidDateKey(key) {
    if (typeof key !== "string" || !DATE_RE.test(key)) return false;
    const parts = key.split("-").map(Number);
    const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    return d.getUTCFullYear() === parts[0] && d.getUTCMonth() === parts[1] - 1 && d.getUTCDate() === parts[2];
  }

  // Whole days since 1970-01-01 for a calendar date (UTC maths avoids DST problems).
  function dayNumber(key) {
    const p = key.split("-").map(Number);
    return Math.floor(Date.UTC(p[0], p[1] - 1, p[2]) / 86400000);
  }

  function addDays(key, n) {
    const d = new Date((dayNumber(key) + n) * 86400000);
    return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate());
  }

  function formatDateLong(key) {
    const p = key.split("-").map(Number);
    const d = new Date(p[0], p[1] - 1, p[2]);
    return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  }

  // ---------- Daily rotation ----------
  // Deterministic: the same date always gives the same three missions,
  // and consecutive dates always move each pool on by one.
  const POOL_OFFSET = { easy: 0, intermediate: 2, hard: 4 };

  function selectDailyMissions(key, missions) {
    const day = dayNumber(key);
    const result = {};
    ["easy", "intermediate", "hard"].forEach(function (diff) {
      const pool = missions.filter(function (m) { return m.difficulty === diff; });
      if (!pool.length) {
        result[diff] = null;
        return;
      }
      const idx = (((day + POOL_OFFSET[diff]) % pool.length) + pool.length) % pool.length;
      result[diff] = pool[idx];
    });
    return result;
  }

  // ---------- Save data ----------
  function defaultProgress() {
    return {
      version: VERSION,
      xp: 0,
      streak: 0,
      bestStreak: 0,
      lastActiveDate: null,
      days: {},
      missions: {},
      tutorialSeen: false
    };
  }

  function nonNegInt(v) {
    return typeof v === "number" && isFinite(v) && v >= 0 ? Math.floor(v) : 0;
  }

  // Accepts anything and returns a valid progress object. Never throws.
  function sanitize(raw) {
    const p = defaultProgress();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return p;

    p.xp = nonNegInt(raw.xp);
    p.streak = nonNegInt(raw.streak);
    p.bestStreak = Math.max(nonNegInt(raw.bestStreak), p.streak);
    p.lastActiveDate = isValidDateKey(raw.lastActiveDate) ? raw.lastActiveDate : null;
    p.tutorialSeen = raw.tutorialSeen === true;

    if (raw.days && typeof raw.days === "object" && !Array.isArray(raw.days)) {
      Object.keys(raw.days).forEach(function (key) {
        const day = raw.days[key];
        if (!isValidDateKey(key) || !day || typeof day !== "object") return;
        const clean = { completed: {}, bonus: day.bonus === true };
        if (day.completed && typeof day.completed === "object") {
          ["easy", "intermediate", "hard"].forEach(function (diff) {
            const c = day.completed[diff];
            if (c && typeof c === "object" && typeof c.missionId === "string") {
              clean.completed[diff] = {
                missionId: c.missionId,
                moves: nonNegInt(c.moves),
                xp: nonNegInt(c.xp)
              };
            }
          });
        }
        p.days[key] = clean;
      });
    }

    if (raw.missions && typeof raw.missions === "object" && !Array.isArray(raw.missions)) {
      Object.keys(raw.missions).forEach(function (id) {
        const m = raw.missions[id];
        if (!m || typeof m !== "object") return;
        p.missions[id] = { clears: nonNegInt(m.clears), bestMoves: nonNegInt(m.bestMoves) || null };
      });
    }

    return p;
  }

  // storage: any object with getItem/setItem (localStorage, or a stub in tests)
  function load(storage) {
    let text = null;
    try {
      text = storage.getItem(STORAGE_KEY);
    } catch (e) {
      return { progress: defaultProgress(), warning: "Saving is unavailable in this browser mode; progress will last until you close the tab." };
    }
    if (text === null || text === undefined) return { progress: defaultProgress(), warning: null };
    try {
      return { progress: sanitize(JSON.parse(text)), warning: null };
    } catch (e) {
      try { storage.setItem(CORRUPT_KEY, text); } catch (ignored) { /* best effort */ }
      return { progress: defaultProgress(), warning: "Saved progress was unreadable and has been reset. (A copy was kept for safety.)" };
    }
  }

  function save(storage, progress) {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(progress));
      return true;
    } catch (e) {
      return false;
    }
  }

  function clear(storage) {
    try { storage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
    return defaultProgress();
  }

  // ---------- Streaks ----------
  // A streak stays alive if the last daily clear was today or yesterday.
  function currentStreak(progress, todayKey) {
    if (!progress.lastActiveDate) return 0;
    const gap = dayNumber(todayKey) - dayNumber(progress.lastActiveDate);
    return gap === 0 || gap === 1 ? progress.streak : 0;
  }

  function getDay(progress, key) {
    return progress.days[key] || { completed: {}, bonus: false };
  }

  function dailyCompletedCount(progress, key) {
    const day = getDay(progress, key);
    return ["easy", "intermediate", "hard"].filter(function (d) { return !!day.completed[d]; }).length;
  }

  function recordMissionClear(progress, missionId, moves) {
    const rec = progress.missions[missionId] || { clears: 0, bestMoves: null };
    rec.clears++;
    rec.bestMoves = rec.bestMoves ? Math.min(rec.bestMoves, moves) : moves;
    progress.missions[missionId] = rec;
  }

  // Record a daily mission clear. Mutates progress and reports exactly what was awarded.
  function recordDailyCompletion(progress, key, difficulty, mission, moves, bonusXp) {
    const day = getDay(progress, key);
    progress.days[key] = day;
    const report = {
      missionXp: 0,
      bonusXp: 0,
      alreadyClaimed: false,
      streakBefore: currentStreak(progress, key),
      streakAfter: 0,
      streakIncreased: false,
      allThreeDone: false
    };

    recordMissionClear(progress, mission.id, moves);

    if (day.completed[difficulty]) {
      report.alreadyClaimed = true;
    } else {
      day.completed[difficulty] = { missionId: mission.id, moves: moves, xp: mission.xp };
      report.missionXp = mission.xp;
      progress.xp += mission.xp;

      // Streak: first daily clear of this date counts.
      const last = progress.lastActiveDate;
      if (!last || dayNumber(key) > dayNumber(last)) {
        const gap = last ? dayNumber(key) - dayNumber(last) : null;
        progress.streak = gap === 1 ? progress.streak + 1 : 1;
        progress.lastActiveDate = key;
        report.streakIncreased = true;
      }
      progress.bestStreak = Math.max(progress.bestStreak, progress.streak);
    }

    report.allThreeDone = dailyCompletedCount(progress, key) === 3;
    if (report.allThreeDone && !day.bonus) {
      day.bonus = true;
      report.bonusXp = bonusXp;
      progress.xp += bonusXp;
    }

    report.streakAfter = currentStreak(progress, key);
    return report;
  }

  // ---------- Ranks ----------
  function rankFor(xp) {
    let current = RANKS[0];
    let next = null;
    for (let i = 0; i < RANKS.length; i++) {
      if (xp >= RANKS[i].xp) {
        current = RANKS[i];
        next = RANKS[i + 1] || null;
      }
    }
    return { name: current.name, floor: current.xp, next: next };
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    RANKS: RANKS,
    dateKey: dateKey,
    isValidDateKey: isValidDateKey,
    dayNumber: dayNumber,
    addDays: addDays,
    formatDateLong: formatDateLong,
    selectDailyMissions: selectDailyMissions,
    defaultProgress: defaultProgress,
    sanitize: sanitize,
    load: load,
    save: save,
    clear: clear,
    currentStreak: currentStreak,
    getDay: getDay,
    dailyCompletedCount: dailyCompletedCount,
    recordMissionClear: recordMissionClear,
    recordDailyCompletion: recordDailyCompletion,
    rankFor: rankFor
  };
})();
