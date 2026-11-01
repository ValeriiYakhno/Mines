import { ANALYTICS } from './config.js';
import { round2 } from './game.js';

/**
 * Product + technical metrics. Listens to the Game's domain events and a few page-level hooks
 * (js/main.js) and turns them into flat analytics events. Game events are wired in bind() once
 * js/game.js exists (PROGRESS.md, step 5); right now it carries only the generic funnel + technical part.
 *
 * Funnel      page_open -> assets_loaded -> game_loaded (assets + backend ready) -> first_bet -> first_collect
 * Technical   asset_load_failed, game_error (every error incl. uncaught JS), fps_sample (average FPS every 60 s
 *             of visible play), session_end
 *
 * Context on EVERY event: player_id (UUID, localStorage), session_id, seq, ts, server_session, app_version,
 * is_demo, currency, first-visit UTM + first_referrer, device_type, os, browser, in_app_browser, screen,
 * viewport, dpr, layout, env (local/prod/preview), is_internal (?internal=1).
 *
 * Delivery: PostHog (snippet + init in index.html <head>, key and host in js/posthog.config.js) and
 * window.dataLayer. Every sink is optional and guarded. `?debug` logs every event to the console.
 */

const uid = () => crypto.randomUUID();
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];

/** first-touch attribution: the UTM tags + referrer of the very first visit, kept for later visits */
function firstTouch() {
  const saved = store.get('shinesAndMinesFirstTouch');
  if (saved) { try { return JSON.parse(saved); } catch { /* rewrite below */ } }
  const q = new URLSearchParams(location.search), t = {};
  UTM_KEYS.forEach(k => { t[k] = q.get(k) || null; });
  let ref = null;
  try { ref = document.referrer ? new URL(document.referrer).hostname : null; } catch { /* opaque */ }
  t.first_referrer = ref;
  t.first_visit_ts = new Date().toISOString();
  store.set('shinesAndMinesFirstTouch', JSON.stringify(t));
  return t;
}

/** coarse device / OS / browser from the UA - enough to split problems by platform */
function deviceInfo() {
  const ua = navigator.userAgent, uad = navigator.userAgentData;
  const m = re => { const x = ua.match(re); return x ? (x[1] || '').replace(/_/g, '.') : null; };
  const tablet = /iPad|Tablet|PlayBook|Silk/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
    || (/Android/i.test(ua) && !/Mobile/i.test(ua));
  const mobile = !tablet && (uad?.mobile || /Mobi|iPhone|iPod|Android.*Mobile/i.test(ua));
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android'
    : /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? 'iOS'
      : /Mac OS X/.test(ua) ? 'macOS' : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/.test(ua) ? 'Linux' : 'other';
  const osVersion = os === 'Android' ? m(/Android ([\d.]+)/) : os === 'iOS' ? m(/OS ([\d_]+) like Mac/) : os === 'Windows' ? m(/Windows NT ([\d.]+)/) : null;
  const browsers = [
    ['Facebook', /FBAN|FBAV\/([\d.]+)/], ['Instagram', /Instagram ([\d.]+)/], ['TikTok', /(?:musical_ly|BytedanceWebview|TikTok)[_/ ]?([\d.]*)/],
    ['Edge', /EdgA?\/([\d.]+)/], ['Opera', /(?:OPR|Opera)\/([\d.]+)/], ['Samsung Internet', /SamsungBrowser\/([\d.]+)/],
    ['UC Browser', /UCBrowser\/([\d.]+)/], ['Mi Browser', /MiuiBrowser\/([\d.]+)/], ['Chrome iOS', /CriOS\/([\d.]+)/],
    ['Firefox iOS', /FxiOS\/([\d.]+)/], ['Firefox', /Firefox\/([\d.]+)/], ['Chrome', /Chrome\/([\d.]+)/],
    ['Safari', /Version\/([\d.]+).*Safari/],
  ];
  const [browser, re] = browsers.find(([, r]) => r.test(ua)) || ['other', null];
  return {
    device_type: tablet ? 'tablet' : mobile ? 'mobile' : 'desktop',
    os, os_version: osVersion, browser, browser_version: re ? (m(re) || null) : null,
    in_app_browser: ['Facebook', 'Instagram', 'TikTok'].includes(browser),
    screen: `${screen.width}x${screen.height}`, dpr: devicePixelRatio || 1,
  };
}

function gpuName(gl) {
  try {
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl?.getParameter(gl.RENDERER) ?? null;
  } catch { return null; }
}

export class Analytics {
  constructor(game, { debug = false } = {}) {
    this.game = game;
    this.debug = debug;
    // created in <head> (js/posthog.config.js) so PostHog can register it before the first event
    const head = window.SHINES_AND_MINES_PLAYER;
    const pid = head?.id || store.get('shinesAndMinesPlayerId');
    this.firstVisit = head ? head.firstVisit : !pid;
    this.playerId = pid || uid();
    if (!pid) store.set('shinesAndMinesPlayerId', this.playerId);
    this.sessionId = uid();
    this.attribution = firstTouch();
    this.device = deviceInfo();
    this.seq = 0;
    this.round = null;              // { id, number, startedAt, bet, seed }
    this.rounds = 0; this.totalBet = 0; this.totalWin = 0; this.wins = 0; this.losses = 0;
    this.firstBetSent = false; this.firstCollectSent = false;
    this.assetsReady = false; this.backendSettled = false; this.gameLoadedSent = false;
    this.fps = { frames: 0, ms: 0, allFrames: 0, allMs: 0, secFrames: 0, secMs: 0, minFps: Infinity };
    this.sessionStart = performance.now();
    window.dataLayer = window.dataLayer || [];

    this.track('page_open', {
      time_since_navigation_ms: Math.round(performance.now()), first_visit: this.firstVisit,
      referrer: (() => { try { return document.referrer ? new URL(document.referrer).hostname : null; } catch { return null; } })(),
      ...this.heavyContext(),
    });
    this.bind();
    addEventListener('pagehide', () => this.endSession());
    // resources that fail to load (images, fonts, scripts) and uncaught JS errors
    addEventListener('error', e => {
      const t = e.target;
      if (t && t !== window && (t.src || t.href)) {
        const url = String(t.src || t.href);
        if (!/posthog\.com/.test(url)) this.track('asset_load_failed', { asset_url: url.slice(0, 300), asset_tag: t.tagName });   // a blocked PostHog is not a game asset
      }
      else this.track('game_error', { error_code: 'js', error_message: String(e.message).slice(0, 300), error_source: `${e.filename}:${e.lineno}`, game_state: game.state });
    }, true);
    addEventListener('unhandledrejection', e => this.track('game_error', { error_code: 'promise', error_message: String(e.reason?.message || e.reason).slice(0, 300), game_state: game.state }));
  }

  heavyContext() {
    const c = navigator.connection;
    return {
      user_agent: navigator.userAgent, language: navigator.language, cores: navigator.hardwareConcurrency ?? null,
      device_memory_gb: navigator.deviceMemory ?? null, network: c?.effectiveType ?? null, save_data: c?.saveData ?? null,
      touch: matchMedia('(pointer: coarse)').matches,
    };
  }

  // ---------------------------------------------------------------- wiring
  bind() {
    const g = this.game;
    g.on('state', s => { if (!this.backendSettled && (s === 'idle' || s === 'offline')) { this.backendSettled = true; this.maybeGameLoaded(); } });
    g.on('error', err => this.track('game_error', {
      ...this.roundProps(), error_code: err.code ?? null, error_message: String(err.message || err).slice(0, 300), game_state: g.state,
    }));
    // TODO step 5: bet_selected / round_started / round_finished / collect ... from the Game events
  }

  roundProps() {
    const r = this.round;
    return r ? { round_id: r.id, round_number: r.number, server_seed: r.seed } : { round_id: null };
  }

  // ------------------------------------------------------------- lifecycle
  /** assets decoded, screens drawable (js/main.js) */
  assetsLoaded(extra = {}, gl = null) {
    this.assetsReady = true;
    this.assetsExtra = extra;
    this.gpu = gpuName(gl);
    this.track('assets_loaded', { load_time_ms: Math.round(performance.now()), gpu: this.gpu, ...extra });
    this.maybeGameLoaded();
  }

  /** assets ready AND the backend answered (connected or failed): the player can (or can't) play now */
  maybeGameLoaded() {
    if (this.gameLoadedSent || !this.assetsReady || !this.backendSettled) return;
    this.gameLoadedSent = true;
    const nav = performance.getEntriesByType?.('navigation')?.[0];
    this.track('game_loaded', {
      load_time_ms: Math.round(performance.now()), dom_ready_ms: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
      first_visit: this.firstVisit, backend_ready: this.game.state !== 'offline', balance: this.game.balance,
      gpu: this.gpu, ...this.assetsExtra, ...this.heavyContext(),
    });
  }

  /** the screen could not start (js/main.js) */
  sceneFailed(err) {
    const p = { error_message: String(err.message || err).slice(0, 300), game_state: this.game.state };
    if (err.kind === 'assets') this.track('asset_load_failed', { ...p, asset_url: JSON.stringify(err.assets).slice(0, 300) });
    this.track('game_error', { ...p, error_code: 'scene_load' });
  }

  /** called every animation frame with the frame time; hidden-tab gaps (> 1 s) are ignored */
  frame(ms) {
    if (!(ms > 0) || ms > 1000) return;
    const f = this.fps;
    f.frames++; f.ms += ms; f.allFrames++; f.allMs += ms; f.secFrames++; f.secMs += ms;
    if (f.secMs >= 1000) { f.minFps = Math.min(f.minFps, f.secFrames * 1000 / f.secMs); f.secFrames = 0; f.secMs = 0; }
    if (f.ms >= 60000) {
      this.track('fps_sample', { avg_fps: Math.round(f.frames * 1000 / f.ms), min_fps_1s: Math.round(f.minFps), in_round: !!this.round });
      f.frames = 0; f.ms = 0; f.minFps = Infinity;
    }
  }
  avgFps() { const f = this.fps; return f.allMs ? Math.round(f.allFrames * 1000 / f.allMs) : null; }

  endSession() {
    if (this.ended) return;
    this.ended = true;
    this.track('session_end', {
      session_duration_ms: Math.round(performance.now() - this.sessionStart),
      rounds_played: this.rounds, wins: this.wins, losses: this.losses,
      total_bet: round2(this.totalBet), total_win: round2(this.totalWin), net: round2(this.totalWin - this.totalBet),
      round_in_progress: !!this.round, balance: this.game.balance, avg_fps: this.avgFps(),
      reached_first_bet: this.firstBetSent, reached_first_collect: this.firstCollectSent,
    });
  }

  // -------------------------------------------------------------- delivery
  track(event, props = {}) {
    const g = this.game;
    const e = {
      event, ts: new Date().toISOString(), seq: ++this.seq,
      session_id: this.sessionId, player_id: this.playerId, server_session: g.serverSession,
      app_version: ANALYTICS.appVersion, game: 'shines-and-mines', is_demo: g.demo, currency: g.currency,
      env: window.SHINES_AND_MINES_ENV ?? null, is_internal: !!window.SHINES_AND_MINES_INTERNAL,   // js/posthog.config.js
      ...this.attribution, ...this.device,
      layout: document.body.classList.contains('layout-mobile') ? 'mobile' : 'desktop',
      viewport: `${document.documentElement.clientWidth}x${document.documentElement.clientHeight}`,
      ...props,
    };
    window.dataLayer.push(e);
    try {
      const { event: _name, ...props } = e;
      window.posthog?.capture?.(event, props);
    } catch { /* PostHog missing or broken: the game goes on */ }
    if (this.debug) console.info('[analytics]', event, e);
    return e;
  }
}
