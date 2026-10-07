# New web game demo — playbook (game-agnostic)

Everything here is independent of the game's theme and mechanic. It captures how the previous demo was set up,
shipped and debugged, so a new demo can start from a working process. Copy this file into the new repo.

## 1. Stack that worked

- Plain HTML + CSS + native ES modules, **no bundler, no framework**; one `index.html`, screens/modals in markup,
  states are CSS classes (not routes).
- Fixed design canvas (1920x1080) scaled to the window; a separate mobile composition (< 768 px or portrait).
- Dev server: `npx http-server public -p 5173 -c-1` (no install). Node 24 and wrangler 4.x on this machine.
- Only `public/` is ever deployed. Docs, design exports and notes live outside it and are never published.

## 2. Where to push

- **GitHub**, one repo per game, default branch `master`, **private** (check Settings -> General -> Visibility).
- `gh` CLI is **not installed** here: create the repo in the browser (github.com/new, empty, no README), then:

```bash
git init -b master
git add -A && git commit -m "Initial commit"
git remote add origin https://github.com/ValeriiYakhno/<repo>.git
git push -u origin master
```

- Branch per concern off `master`, small commits, one concern per commit.
- **Never merge to `master`, push or deploy without an explicit go-ahead in that same turn** (approval does not carry over).
- Commit messages end with the co-author line the tooling asks for. Do not commit `node_modules/`, `.wrangler/`, secrets.

## 3. Where to deploy: Cloudflare Workers (static assets)

Not Pages. A Worker that serves static files only, no server code. `wrangler.jsonc`:

```jsonc
{
  "name": "<worker-name>",              // becomes <worker-name>.<account-subdomain>.workers.dev
  "compatibility_date": "<today>",
  "assets": { "directory": "./public" }
}
```

1. Cloudflare dashboard -> Workers & Pages -> Create -> **Import a repository** -> pick the GitHub repo
   (install the Cloudflare GitHub app for that repo only). Production branch `master`, build command empty,
   deploy command `npx wrangler deploy`.
2. Every push to `master` deploys in about 1-2 minutes; other branches get preview URLs
   `<branch-or-version>-<worker-name>.<account-subdomain>.workers.dev`.
3. Before pushing: `npx wrangler deploy --dry-run` lists exactly what would ship.
4. **Confirm a deploy landed**; `git push` alone proves nothing. Poll the live URL for a string from the new commit:
   `curl -s https://<host>/js/main.js | grep <marker>`, or check the Workers Builds connector (build status/logs).
5. `public/_headers` (applied by Workers assets):

```
/*
  X-Robots-Tag: noindex          # remove when the game goes public
  X-Content-Type-Options: nosniff

/assets/fonts/*
  Cache-Control: public, max-age=3600, must-revalidate
/assets/audio/*
  Cache-Control: public, max-age=86400, must-revalidate
```

   If a group of files must always update together (e.g. a Spine export), give it `Cache-Control: no-cache`.
6. Account subdomain is account-wide and **has changed once** (the old address died). localStorage and analytics ids
   are per origin, so any address change resets them. A custom domain removes that risk (and ad networks often reject
   shared `workers.dev` hosts).
7. Connectors available in Claude: Cloudflare Workers Builds (read build status/logs), PostHog. The Cloudflare
   Developer Platform connector (KV/D1/R2) is not needed for a static game.

## 4. Analytics (PostHog, EU)

- New PostHog project per game; the public ingestion key (`phc_...`) is safe in the browser.
- Autocapture off (own events cover what matters); keep `$pageview`/`$pageleave`.
- Session replay **off** in code and in the project settings until there is a consent flow.
- `env` tag by host: `local` / `prod` (only hosts listed in `PROD_HOSTS`) / `preview` (everything else). Unknown hosts
  must never count as prod. When a domain is added: `PROD_HOSTS`, `og:url`, `og:image` in the same commit.
- `?internal=1` marks a browser as a team device; configure "Filter out internal and test users" on reports.
- Headless Chrome user agents are dropped, so automated tests do not pollute stats. Filter early test data by date.

## 5. Possible problems and how to solve them

| Problem | Cause | Fix |
|---|---|---|
| Pushed, live site unchanged | Build takes 1-2 min or failed | Poll for a marker string; read build logs via the Workers Builds connector |
| Old address stopped working | Account subdomain changed | Update README/og tags/`PROD_HOSTS`; get a custom domain |
| Stale files after deploy | Browser/CDN cache | Check `_headers`; `no-cache` for files that must change together; hash filenames |
| Audio does not play | Browser autoplay policy | Start on the first `pointerdown` via one shared AudioContext; separate Music/Sound toggles |
| Loops have a gap | MP3 padding | Pre-decoded Web Audio buffers, sample-accurate loops |
| Mobile layout wrong in the in-app browser | `innerWidth` can report the desktop width under emulation | Measure `documentElement.clientWidth` / `visualViewport` |
| Double-tap zoom, keyboard pushes layout | Real-phone behaviour | Cannot be verified in emulation: do a real-device pass early |
| High CPU on high-refresh screens | Unbounded rAF + big canvas | Cap to 60 fps, cap canvas pixels (~3 Mpx), clamp `dt` to 50 ms, fewer parallax layers |
| Preview browser runs the game slowly | Pane throttles rAF | Drive time via a `game.update(dt)` hook for deterministic checks |
| Tests see cached assets | Chrome profile cache | Fresh `--user-data-dir` every headless run |
| WebGL context lost | GPU reset / tab backgrounded | Handle `webglcontextlost` (previous demo only reported it); show a fallback if no WebGL |
| Spine "version mismatch" | Exported with 3.8.75, runtime is 3.8 | Re-export with 3.8.99, or patch the two version checks in `spine-webgl.js` (see section 7) |
| Figma node ids changed | Designer re-created nodes | Always re-read current nodes before porting |
| Figma export unusable as layer | Exports are flattened onto the frame colour | `download_assets` -> `rawImages[0]` (full-res, transparent) |
| Gradient strokes lose colour | `get_design_context` flattens them | Read real paints with a read-only `use_figma` script |
| Positions off by a few px | Figma child coords are relative to parent padding box (borders shift them) | Subtract parent border/padding |
| Button art distorts | PNG exports cannot stretch and carry asymmetric shadow margins | Build stretchable buttons in CSS; inset negative `::before` for PNG shadows |
| Secrets in repo | Keys pasted into config | Only public keys in the client; nothing else belongs in `public/` |

## 6. What every new game needs (checklist)

**Project setup**
- [ ] Private GitHub repo, `master`, `.gitignore` (`node_modules/`, `*.log`, `.wrangler/`, `.DS_Store`, `Thumbs.db`)
- [ ] `public/` (index.html, css/, js/, assets/, `_headers`), `wrangler.jsonc`, `README.md`, `PROGRESS.md`
- [ ] `.claude/launch.json` entry for the dev server (`npx http-server public -c-1 --cors`, port 5173)
- [ ] Cloudflare Worker connected to the repo, first deploy verified on the live URL
- [ ] PostHog project, key in config, `PROD_HOSTS` set, `?internal=1` filter

**Architecture (the part worth keeping)**
- [ ] Game logic as a headless state machine: no DOM, no WebGL, emits events; `canX` getters are the single source of
      truth for enabling buttons; a `busy` flag blocks double actions; `update(dt)` for timers
- [ ] Backend behind an interface (`connect/init/start/...`) with a **mock implementation first**; the client must not know
      a hidden outcome before the server (mock) answers
- [ ] Presentation delay separate from the answer (answer is instant, reveal is synchronised with animation)
- [ ] Tiny event emitter, UI and scene subscribe to the game; sound hooks via callbacks
- [ ] Config in one file (layout numbers, timings, ladders); currency from config, never a hard-coded symbol
- [ ] `fit()` for the design canvas + separate mobile layout; loading screen with progress; first-run tutorial
      (flag in localStorage)
- [ ] Shared AudioContext, Music and Sound toggles, autoplay unlock on first gesture; check licences of every track
- [ ] Error handling for backend errors, reconnect/resume of an open round (not done in the previous demo)
- [ ] Money: round to 2 decimals in one function; clamp bet to balance and limits; sanitise typed bet input

**Design to code**
- [ ] Figma file/page ids recorded in `PROGRESS.md`; always re-read nodes before porting
- [ ] Tokens in `tokens.css` (colours, fonts), then `base.css`, `components.css` (desktop), `mobile.css`
- [ ] All states drawn for every control (disabled, active, locked); missing states asked from design, not invented
- [ ] Fonts as `.woff2`; images as WebP; hash or version asset names for cache busting

**Quality**
- [ ] A few headless unit checks of the state machine against the mock (happy path, loss, errors, bet clamping)
- [ ] Viewport matrix: 1920x1080, 1366x768, ultrawide, zoom 125/150 %, mobile 360/375/390/430, iPad portrait
- [ ] Real-device pass on a phone, performance pass on a low-end device and a 144 Hz desktop
- [ ] Accessibility basics: real `<button>`s, `aria-label`s, focus rings, `prefers-reduced-motion`
- [ ] Legal/product items that the target market needs (age gate, limits, RTP text) decided explicitly, not forgotten

## 7. Reusable pieces to copy from the previous repo (`E:\DistinctPlay_Projects\TugTheFish`)

Copy, then strip theme-specific content:

| Piece | File | Notes |
|---|---|---|
| Pub/sub | `public/js/emitter.js` | 6 lines |
| Shared AudioContext, music, SFX | `audio-context.js`, `audio.js`, `sfx.js` | Replace track list and volumes |
| Analytics | `analytics.js`, `posthog.config.js` | New key, new `PROD_HOSTS` |
| Backend client pattern | `backend.js` | FIFO request queue + error-code table; swap protocol |
| Responsive `fit()`, loading, tutorial | `main.js` | Take the pattern, rewrite the content |
| Styles skeleton | `public/css/{tokens,base,components,mobile}.css` | Replace values from the new Figma |
| Deploy config | `wrangler.jsonc`, `public/_headers` | New Worker name |
| Spine runtime (only if used) | `public/vendor/spine-webgl.js` + `docs/spine-runtime-patch.md` | See below |

**If the new game uses Spine 3.8.75:** upstream 3.8 runtime rejects that version, so the two version checks are patched out.
Atlases are premultiplied (draw with PMA, do not premultiply on upload). Convert atlas PNG -> lossless WebP with `sharp`
(`exact: true`; no cwebp/ImageMagick here) and rename the atlas first line to `.webp`. Slot/skin/animation/event names are
referenced by code: never rename after the first export. Re-export from 3.8.99 when possible. If Spine is not
needed, prefer CSS/Canvas/Lottie and skip all of this.

**Do not copy:** the previous game's scene/animation code, assets, copy text, fake live-wins feed, hidden debug/cheat builds
(the `tug-the-fish-perf` branch must never ship), the hard-coded `$`.

## 8. Working agreements

- A living `PROGRESS.md`: what changed and why, exact numbers/constant names, what is **not** verified yet, open questions,
  decisions with reasons. Update it in the same batch of work, before merging.
- Product-feedback numbers (timings, amplitudes) are not engineering constants: record their history.
- Ask the designer for missing states; do not guess silently. List judgment calls for confirmation.
