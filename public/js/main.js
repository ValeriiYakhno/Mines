// Boot: loading screen, backend (mock for now), Game, UI, tutorial, audio unlock.
// Debug: ?fail=4 makes the first connect fail (offline dialog), ?latency=300 slows the mock down, ?debug logs analytics events.
import { Game } from './game.js';
import { MockBackend } from './mock-backend.js';
import { mountUI } from './ui.js';
import { Analytics } from './analytics.js';
import { MusicPlayer } from './audio.js';
import { SfxPlayer } from './sfx.js';

const q = new URLSearchParams(location.search);
const $ = id => document.getElementById(id);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};
const progress = p => { $('progress-fill').style.width = `${p}%`; $('progress-text').textContent = `Loading ${p}%`; };
progress(5);

const backend = new MockBackend({ latency: +q.get('latency') || 0 });
if (q.get('fail')) backend.failNext(+q.get('fail'));
const game = new Game(backend);
const analytics = new Analytics(game, { debug: q.has('debug') });
window.game = game; window.backend = backend;      // for poking from the console while reviewing

const music = new MusicPlayer(), sfx = new SfxPlayer();
const ui = mountUI(game, { music, sfx });
addEventListener('pointerdown', () => {            // browsers allow audio only after a gesture
  if (ui.unlocked) return;
  ui.unlocked = true; ui.applyAudio();
}, { once: true, capture: true });

// ------------------------------------------------------------------ tutorial
const STEPS = [
  ['Set up your round', 'Choose the bet, the number of mines and the field size, then press Play.'],
  ['Open tiles', 'Every safe tile raises the multiplier. A mine ends the round and the bet is lost.'],
  ['Cash out any time', 'After the first safe tile you can take your win. More tiles means a bigger win and a bigger risk.'],
];
let step = 0;
const dlg = $('dlg-tutorial');
function showStep() {
  const last = step === STEPS.length - 1;
  $('tut-title').textContent = STEPS[step][0]; $('tut-text').textContent = STEPS[step][1];
  [...$('tut-dots').children].forEach((d, i) => d.classList.toggle('on', i === step));
  $('tut-skip').hidden = step !== 0; $('tut-back').hidden = step === 0; $('tut-check').hidden = !last;
  $('tut-next').textContent = last ? 'Got it' : 'Next';
}
function finishTutorial() { if (step !== STEPS.length - 1 || $('tut-dont').checked) store.set('minesTutorialSeen', '1'); dlg.close(); }
$('tut-next').addEventListener('click', () => { if (step < STEPS.length - 1) { step++; showStep(); } else finishTutorial(); });
$('tut-back').addEventListener('click', () => { step--; showStep(); });
$('tut-skip').addEventListener('click', () => { store.set('minesTutorialSeen', '1'); dlg.close(); });
dlg.addEventListener('cancel', e => { e.preventDefault(); finishTutorial(); });

// ------------------------------------------------------------------- offline
$('dlg-offline').addEventListener('cancel', e => e.preventDefault());
$('off-retry').addEventListener('click', async () => {
  await game.init();
  if (game.state !== 'offline') { $('dlg-offline').close(); ui.buildBoard(); ui.buildFieldList(); ui.render(); }
});

// ---------------------------------------------------------------------- boot
const t0 = performance.now();
const fonts = Promise.race([document.fonts?.ready ?? Promise.resolve(), new Promise(r => setTimeout(r, 1500))]);
await fonts; progress(55);
await game.init(); progress(100);
analytics.assetsLoaded({ load_time_ms: Math.round(performance.now() - t0) });
if (game.state !== 'offline') { ui.buildBoard(); ui.buildFieldList(); }
ui.render();
setTimeout(() => {
  $('app').hidden = false; $('loading').classList.add('done');
  setTimeout(() => $('loading').remove(), 400);
  ui.render();
  if (game.state !== 'offline' && store.get('minesTutorialSeen') !== '1') { step = 0; showStep(); dlg.showModal(); }
}, Math.max(0, 450 - (performance.now() - t0)));
