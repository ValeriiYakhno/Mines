# PROGRESS

## Links
- GitHub: https://github.com/ValeriiYakhno/Mines (private; to be created)
- Figma: file `DguVpT99kmgeVsB2GvEfD7`, page node `0-1` (design in progress)
- Live: https://mines.tugfish.workers.dev/ (Cloudflare Worker `mines`, Workers Builds from `master`)
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

- 2026-10-07 Step 3: Worker connected, first deploy verified (HTTP 200, noindex/nosniff headers). `PROD_HOSTS` has the live host.

## Not verified
- Nothing runs yet: `index.html` is an empty stage.
- Build token of the Worker is still the old `tug-the-fish-perf build token`: replace with `mines build token` (Worker > Settings > Builds).

## Open questions
- Step 4 (PostHog) postponed by the user: key stays empty, no snippet in index.html yet.
- Spine: undecided (3.8.75 or none).
- Final game name (working title "Mines").

## Decisions
- No `gh` CLI: the GitHub repo is created in the browser.
