# PROGRESS

## Links
- GitHub: https://github.com/ValeriiYakhno/Mines (private; to be created)
- Figma: file `DguVpT99kmgeVsB2GvEfD7`, page node `0-1` (design in progress)
- Rules: https://polishchuk.com/projects/jgame/#/mnf1
- Old project (read-only source of shared code): E:\DistinctPlay_Projects\TugTheFish

## Done
- 2026-10-07 Step 1, scaffold: shared files copied from the old project and stripped of fishing content.
  - `emitter.js`, `audio-context.js` copied as is.
  - `audio.js`: track list emptied, guard for an empty playlist. `sfx.js`: rewritten as a generic player (empty clip list).
  - `analytics.js`: generic funnel/device/error/fps/session part kept; game events removed (TODO step 5). Storage keys `mines*`, globals `MINES_*`, `game: 'mines'`.
  - `posthog.config.js`: old PostHog key removed (empty until step 4), `PROD_HOSTS` has no host yet.
  - CSS: `tokens.css` and `base.css` kept (token values are placeholders from the old Figma); `components.css` / `mobile.css` are empty skeletons (the old ones were 100% fishing layout).
  - `wrangler.jsonc`: Worker name `mines`.

- 2026-10-08 Step 5, rules without graphics (branch `step-5-game`):
  - Rules read from the emulator (Minefield, mnf1) and `docs/api.pdf` (given by the user; generic protocol: WebSocket, one JSON request at a time, `{"error":CODE}` table).
  - `js/backend.js`: the interface (documented in the header), `BackendError`, error codes from api.pdf. `js/mock-backend.js`: in-memory server, keeps mines private, reveals them only at round end, commit hash on bet, test hooks (`pickMines`, `failNext`, `latency`).
  - `js/game.js`: headless state machine (`connecting/idle/playing/offline`), `can*` getters, `busy` set synchronously, one request at a time, resume of an open round, resync on wrong-state errors, `round2`, bet sanitising/clamping. `analytics.js` now imports `round2` from it.
  - `tests/game.test.mjs`: 15 checks, run with `npm test` (node:test, no dependencies), all pass.

## Rules (measured on the emulator, 5x5 / 3 mines unless noted)
- Board: square 3x3..9x9, or a single row of 3..9 cells ("number of cells"). Mines: 1..cells-1. Steps = safe cells, but see the cap below.
- Multiplier after n safe cells = max(1.00, round2(1 / (p(n) * 1.05))), p(n) = chance to survive n openings (RTP ~95.2%). Checked on 5x5 m=1,3,5,12,24 and 9x9 m=10 (52 rows).
- Cap: a ladder stops before the first step above 100000x (5x5 m=12 has 11 steps of 13 safe cells; 9x9 m=10 has 52 of 71). Reaching the last step pays out automatically.
- Bet: balance is charged at bet; win is credited at Collect (or automatically at the last step); a mine = payout 0. Collect at step 0 does nothing. Win = bet * multiplier, 2 decimals.
- Fixed bet buttons in the emulator: 0.10 0.20 0.50 0.80 1 1.5 2 3 5 10 15 20 30 50 80 100 (limits 0.10..100 assumed from them); start balance 7777 FUN.
- Provably fair: before the round the server shows a hash, after it the "source" (mine cells + salt); the hash is MD5 of the source string (checked). The mock uses SHA-256 and row-major cell indices instead.

## Not verified
- The real Minefield WebSocket commands (bet / open cell / collect and their replies): api.pdf documents only the generic protocol ("index" parameter = cell, error 16). The interface in backend.js is our abstraction; the adapter must be written when the real spec is known.
- My brute-force table scan of the emulator was unreliable (page redraws lag), so the formula is confirmed only on the configs listed above.
- Nothing runs yet: `index.html` is an empty stage.

## Open questions
- Real server protocol for Minefield (see Not verified) and the real bet limits.
- Do we need the single-row boards (3..9 cells) or only squares? Cell label format for the UI (emulator source uses letter+number, and its letter/number order is not the board header order).
- Spine: undecided (3.8.75 or none).
- Final game name (working title "Mines").

## Decisions
- Cells are row-major indices 0..cells-1 everywhere in code; labels are a UI matter.
- The mock server owns the multiplier math; the client only multiplies bet by the ladder for the "possible win" display, the real payout always comes from the server.
- `api.pdf` is stored in `docs/` (third-party document, private repo).
- No `gh` CLI: the GitHub repo is created in the browser.
