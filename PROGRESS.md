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

- 2026-10-08 Step 6 started (branch `step-6-concepts`, stacked on `step-5-game` because the concepts use the real Game + MockBackend): two playable concepts instead of porting the Figma straight away, see below.

## Figma and concepts
- Figma file `DguVpT99kmgeVsB2GvEfD7`: one page "reference" (node 0:1) with 63 reference screenshots in 7 columns (by x). No Mines design frames yet.
- Liked by the user: column 2 = "Mummy's Mines" (Egyptian tomb, purple stone panel, gold button) and column 5 = "Mines 2" (dark navy glass UI, left bet panel, boost meter). The user does not like the UX of the references (Start button over the board, settings in a tall left panel, tiny controls).
- Concept A "Tomb" (`concepts/a-tomb`) and concept B "Glass" (`concepts/b-glass`): own art in these two moods, not copies. Shared structure: `concepts/shared/ui.js` (binds the real Game) and `base.css`; each concept only has `theme.css` + `index.html` + `assets/`. Run: dev server config `mines-concepts` (port 5174, root of the repo), open `/concepts/a-tomb/index.html` or `/concepts/b-glass/index.html`.
- UX decisions for both: the board is never covered; one action button in one fixed place (PLAY / PICK A TILE / CASH OUT with the amount / PLAY AGAIN); settings (mines, field, bet) are locked during a round; readouts (multiplier, win, next tile) and the multiplier ladder sit next to the board on desktop and above it on phones; result banner is in the flow above the board; phones: board on top, thumb-reach dock below (bet, mines, field, one big button). Concept A has the dock under the board, concept B a side panel on the left.
- Art: generated with Higgsfield (model nano_banana_2, the only one the free plan accepts), white backgrounds cut out locally (Pillow flood fill), converted to WebP. Sources `*.src.png` are git-ignored. Higgsfield credits: 12 before, 0.5 after (7 images + 1 failed cut-out; nano_banana_2 costs ~1.5 credits per image, I did not preflight it).
- Skills installed globally: `design-taste-frontend` (leonxlnx/taste-skill) and `awesome-design-md` (wearescientist/awesome-design-md). The taste skill is for landing pages, so only its general rules were used (one accent, shape lock, contrast, no AI slop); icons are Phosphor.

## Figma layout mockup (2026-10-08)
- The user rejected the concepts (concept B's general design was "not bad"). Reference they like: "Frame 1" (node 23:3) on page `reference`, the "Mines Hazard Zone" screens: calm left panel (logo, bet, mines, grid, one big Play button), board in the middle, balance chip top-left of the stage, settings top-right, a few multiplier chips under the board. No history, no extra buttons.
- Mockup built on page `design` (node 19:2) as a structural layout only (neutral wireframe palette; the user will add the real visual design themselves):
  - Frames (desktop 1920x1080): `Desktop / 1 Ready` 27:2, `2 In round` 27:122, `3 Mine hit` 27:252, `4 Cashed out` 27:385. Mobile 390x844: `Mobile / 1 Ready` 29:213, `2 In round` 29:317, `3 Mine hit` 29:430.
  - Layout: left control panel (logo placeholder, bet stepper + 1/2 2x Max, mines stepper + risk label, field select, readout card, one action button), board 5x5, banner above the board, 3 ladder chips under it. Settings are dimmed and locked only while a round is running. On phones: balance and icons on top, banner, ladder chips, board, dock with bet / mines + field / action.
  - Components frame `Components` (26:17): Icon button, Stepper (size lg/sm), Select (size lg/sm), Action button (mode play/cash/wait), Chip (state default/current/done), Readout, Banner (kind hint/win/loss), Cell (state closed/safe/mine/ghost/rest x size lg/sm). Colour variables in collection "Mines Color (wireframe)" (14 placeholders). Fonts: Sora + DM Sans (placeholders). Gem and mine are placeholder shapes named "(replace with art)".
- Figma API notes: paint-level opacity on variable-bound fills is ignored (use tint variables); position/size overrides of inner layers in instances do not stick, so sizes are component variants.
- Added later the same day (all on page `design`): desktop row y=2600/3900: `Desktop / 5 Loading` 36:362, `6 Offline` 36:369, `7-9 Tutorial 1-3 of 3`, `10 How to play`, `11 Field list open`, `12 Sound settings` (popover), `13 Big win` (x23.81 on 5x5 with 24 mines), `14 Board 3x3`, `15 Board 9x9`. Mobile row y=6500: `4 Loading` 37:1031, `5 Offline`, `6 Tutorial 1 of 3`, `7 How to play`, `8 Field list open` (opens upwards), `9 Sound settings` (bottom sheet), `10 Big win`, `11 Board 3x3`, `12 Board 9x9`. New components: Button (primary/secondary/ghost), Toggle (on/off), Step dots (1-3). Mobile spacing: 16 px rhythm between top bar, banner, ladder, board and dock (cells 58 px).
- Open design questions: (1) 9x9 on a phone gives ~31 px tiles, below the 44 px tap target: allow it, cap phones at 7x7, or add zoom? (2) "Bonus" has no mechanic in the rules we know, only Big win was designed (threshold not decided, mock numbers). (3) Mines count picker is only a stepper, no list. (4) Sound is two toggles (music, effects), no volume sliders. (5) Tutorial copy is a draft in English.
- Decisions 2026-10-08 (user): phones are capped at 6x6 (tiles >= 47 px); no bonus mechanic; quick mines list postponed ("decide later"); tutorial copy based on our game is fine; settings get a Turbo mode toggle and an Information row like the reference (gear icon opens Settings: Information, Turbo mode, Music, Sound effects). Figma updated: buttons in dialogs hug their content (was clipped), mobile `12 Board 6x6 (phone max)`, field list on phones shows 3x3..6x6, settings popover/sheet.
- The wireframe is now implemented in the game (branch `step-6-game-ui`, `public/`): `index.html` (all markup incl. loading, tutorial, how to play, offline, big win dialogs, settings popover/sheet), `css/tokens.css` (wireframe palette, same names as the Figma variables), `css/components.css` + `css/mobile.css` (fluid layout, not the 1920 canvas), `js/ui.js` (render + events from the Game getters), `js/main.js` (boot, tutorial flag `minesTutorialSeen`, offline retry, audio unlock, analytics object). Placeholder art: CSS diamond for a safe tile, red dot for a mine. Fonts Sora/DM Sans come from Google Fonts (temporary).
- Try it: `npx http-server public -p 5173 -c-1 --cors` (or the `mines-demo` launch config). Debug URL params: `?fail=4` (first connect fails: offline dialog, "Try again" reconnects), `?latency=300`, `?debug` (analytics events in the console). Console helpers: `game`, `backend.pickMines = () => [..]` for deterministic mines. Big win threshold is `GAME.bigWinMultiplier` (20, placeholder). Turbo = shorter animations. Music/Sound toggles are wired to the players but there are no audio files yet.
- Checked in the in-app browser only (desktop 1440x810, phone 390x844): play, cash out, loss, field list, 9x9 desktop, phone cap, settings, big win, offline + retry, tutorial. Not checked: real phone, other sizes, keyboard-only, screen reader, 144 Hz.
- Review round 2 (user feedback, 2026-10-08), done first in Figma, then in the game:
  - All screens rebuilt with full auto layout (screen frame -> panel + stage -> top bar / board area / hint + history; overlays are absolute children). Node ids changed: desktop main screens 44:1441, 44:1580, 44:1731, 44:1879; extras 44:2027...44:3430; mobile 45:1007...45:2652 (see the page `design`).
  - Removed: the banner above the board ("23 safe | Next tile..."), the multiplier captions under the gem, the second line of the "Current win" card. Reason (user): the history strip already shows the multipliers; the banner added nothing.
  - History strip redone like the second reference: every step as a pill "3 [gem] 1.49x", done = green outline, current (next tile) = filled, scrollable with faded edges (Figma Step chip component; replaces the 3 plain chips).
  - Sound button (speaker note, struck through when muted) next to the settings gear. Settings now: Information, Turbo mode toggle, Music and Sound effects volume sliders (no on/off toggles). Master mute and volumes are stored (minesMuted, minesMusicVol, minesSfxVol) and applied to the players (setVolume added to MusicPlayer/SfxPlayer).
  - Alignment: pills, buttons and icon buttons are inline-flex centred, line-height 1, plus text-box-trim (cap height) where supported. The old ladder chips were inline spans, which is why digits sat high.
  - Open: with the banner gone, a finished round is shown only by the board (mines revealed), the "Last round" card (desktop) and the action button label. On phones the Last round card is hidden, so the result has no text there. Decide: show a compact result line on phones or accept it.
  - Open: on phones the history strip shows 2-3 pills at a time (scrolls); Figma shows 3 clipped pills.
- Not in the mockup: win/lose animations, tile hover/pressed states, keyboard focus states, landscape phone, tablet.

## Rules (measured on the emulator, 5x5 / 3 mines unless noted)
- Board: square 3x3..9x9 (the emulator also has single rows of 3..9 cells, not used). Mines: 1..cells-1. Steps = safe cells, but see the cap below.
- Multiplier after n safe cells = max(1.00, round2(1 / (p(n) * 1.05))), p(n) = chance to survive n openings (RTP ~95.2%). Checked on 5x5 m=1,3,5,12,24 and 9x9 m=10 (52 rows).
- Cap: a ladder stops before the first step above 100000x (5x5 m=12 has 11 steps of 13 safe cells; 9x9 m=10 has 52 of 71). Reaching the last step pays out automatically.
- Bet: balance is charged at bet; win is credited at Collect (or automatically at the last step); a mine = payout 0. Collect at step 0 does nothing. Win = bet * multiplier, 2 decimals.
- Fixed bet buttons in the emulator: 0.10 0.20 0.50 0.80 1 1.5 2 3 5 10 15 20 30 50 80 100 (limits 0.10..100 assumed from them); start balance 7777 FUN.
- Provably fair: before the round the server shows a hash, after it the "source" (mine cells + salt); the hash is MD5 of the source string (checked). The mock uses SHA-256 and row-major cell indices instead.

## Not verified
- Concepts: only checked in the in-app browser at 1440x810 and 390x844, no real phone, no other viewports, no keyboard/screen-reader pass. Fonts and Phosphor icons load from Google Fonts / unpkg (concept only; production must self-host woff2).
- Missing states to ask the designer: loading/connecting screen, offline/reconnect, tutorial, round history, sound settings panel, jackpot or bonus (the references have them, we have not decided).
- The real Minefield WebSocket commands (bet / open cell / collect and their replies): api.pdf documents only the generic protocol ("index" parameter = cell, error 16). The interface in backend.js is our abstraction; the adapter must be written when the real spec is known.
- My brute-force table scan of the emulator was unreliable (page redraws lag), so the formula is confirmed only on the configs listed above.
- Nothing runs yet: `index.html` is an empty stage.

## Open questions
- Real server protocol for Minefield and the real bet limits: the user will ask the backend team.
- Spine: undecided (3.8.75 or none).
- Final game name (working title "Mines").

## Decisions
- Only square boards (3x3..9x9); the emulator's single-row mode is dropped by the user's decision (2026-10-08). `GAME.boardCells` lists the allowed cell counts.
- No cell labels (letters/digits) in the design: cells are only row-major indices, UI shows no coordinates.
- Cells are row-major indices 0..cells-1 everywhere in code; labels are a UI matter.
- The mock server owns the multiplier math; the client only multiplies bet by the ladder for the "possible win" display, the real payout always comes from the server.
- `api.pdf` is stored in `docs/` (third-party document, private repo).
- No `gh` CLI: the GitHub repo is created in the browser.
