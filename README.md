# QUANTUM ECHO: THE REWIND PROTOCOL

A story-driven quantum puzzle game for the browser. You steer one qubit with the **X**, **H** and **Z** gates to restore fractured timelines.

## Run it locally (Windows)

1. Open a terminal in this folder. In File Explorer, open the `quantum-echo` folder, click the address bar, type `cmd` and press Enter.
2. Start a local web server:
   ```bash
   python -m http.server 8000
   ```
3. Open http://localhost:8000 in your browser.
4. To stop the server, press `Ctrl + C` in the terminal.

To preview another day's daily board (useful for testing rotation and streaks), add `?date=YYYY-MM-DD`, for example http://localhost:8000/?date=2026-10-05.

## Run the tests

```bash
node tests/run-tests.js
```

The suite checks the quantum maths, verifies that every mission is solvable (a solver confirms each listed solution is the shortest), and tests the daily rotation, XP, bonus, streak, save-data handling and the HTML↔JS element IDs.

## Project structure

| File | Purpose |
| --- | --- |
| `index.html` | All screens: title, training, mission control, puzzle chamber, results, field notes |
| `css/styles.css` | Visual design (midnight navy, cyan, amber) and responsive layout |
| `js/quantum.js` | Single-qubit simulator: complex amplitudes, X/H/Z, probabilities, global-phase-aware comparison |
| `js/levels.js` | 15 missions (5 Easy, 5 Intermediate, 5 Hard), XP values, daily bonus |
| `js/engine.js` | Mission rules: exact/max moves, Echo Lock, waypoints, Rewind, undo, hints, solver |
| `js/progress.js` | Daily rotation, XP, streaks, ranks, safe localStorage saving |
| `js/game.js` | Screens, rendering, controls, keyboard shortcuts |
| `tests/run-tests.js` | Automated logic tests (Node.js) |

Scripts load in this order: `quantum.js` → `levels.js` → `engine.js` → `progress.js` → `game.js`.

## Rewards

- Daily missions: Easy 50 XP, Intermediate 100 XP, Hard 200 XP. Each tier pays once per day.
- Clearing all three tiers on the same day gives a +100 XP bonus, once per day.
- Streak: clear at least one daily mission each calendar day. Missing a day resets it.
- Archive simulations award no XP but record your best move count.
