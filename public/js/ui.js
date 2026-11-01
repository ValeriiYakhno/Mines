// DOM binding for the Game: renders state into the markup of index.html and turns clicks into Game calls.
// Everything that can be enabled comes from the Game's can* getters; the UI never decides outcomes.
import { GAME } from './config.js';
import { round2 } from './game.js';

const $ = id => document.getElementById(id);
const fmt = n => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtX = n => 'x' + (n >= 1000 ? Math.round(n).toLocaleString('en-US') : n.toFixed(2));
const fmtM = n => (n >= 1000 ? Math.round(n).toLocaleString('en-US') : n.toFixed(2)) + '\u00D7';
const tiles = n => (n === 1 ? '1 tile' : n + ' tiles');
const side = cells => Math.round(Math.sqrt(cells));
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

export function mountUI(game, { music, sfx } = {}) {
  const phoneMQ = matchMedia('(max-width: 899px), (orientation: portrait)');
  const maxSide = () => (phoneMQ.matches ? GAME.phoneMaxSide : 9);
  const el = {
    app: $('app'), board: $('board'), hint: $('hint'), hist: $('history-track'), balance: $('balance'), cur: $('cur'),
    lock: $('lock-note'), settings: $('settings'), betIn: $('bet-in'), minesVal: $('mines-val'), risk: $('risk'),
    fieldBtn: $('field-btn'), fieldVal: $('field-val'), fieldList: $('field-list'),
    roTitle: $('ro-title'), roValue: $('ro-value'), action: $('action'), aMain: $('a-main'), aSub: $('a-sub'),
    toast: $('toast'), pop: $('settings-pop'), scrim: $('scrim'),
  };
  const ui = { unlocked: false, wantMusic: false, wantSfx: false, maxSide };
  let last = null;         // result of the last finished round, for the banner / readout
  let toastTimer = 0;

  // ------------------------------------------------------------------ builders
  function buildBoard() {
    const n = side(game.cells);
    el.board.dataset.n = n; el.board.dataset.dense = n >= 8 ? '2' : n >= 6 ? '1' : '0';
    el.board.style.setProperty('--n', n);
    el.board.innerHTML = '';
    for (let i = 0; i < game.cells; i++) {
      const b = document.createElement('button');
      b.className = 'cell'; b.dataset.i = i; b.setAttribute('aria-label', `Tile ${i + 1}`);
      b.innerHTML = '<span class="plus" aria-hidden="true">+</span><span class="gem"></span><span class="dot"></span>';
      el.board.appendChild(b);
    }
    syncBoard();
  }
  function buildFieldList() {
    el.fieldList.innerHTML = GAME.boardCells.filter(c => side(c) <= maxSide()).map(c =>
      `<li role="option" data-cells="${c}" aria-selected="${c === game.cells}">${side(c)} &times; ${side(c)}<small>${c === game.cells ? '&#10003;' : c + ' tiles'}</small></li>`).join('');
  }
  function syncBoard() {            // classes from the Game state (after init, resume, round start)
    const r = game.round;
    el.board.querySelectorAll('.cell').forEach(c => { c.className = 'cell'; });
    if (!r || r.cells !== game.cells) return;
    r.opened.forEach(cell => revealSafe(cell, false));
    if (r.status !== 'active' && r.minesAt) revealRest(r);
  }
  function revealSafe(i, animate = true) { const c = el.board.children[i]; c.classList.add('is-safe'); if (animate) c.classList.add('reveal'); }
  function revealMine(i) { el.board.children[i].classList.add('is-mine', 'reveal'); }
  function revealRest(r) {
    [...el.board.children].forEach((c, i) => {
      if (c.classList.contains('is-safe') || c.classList.contains('is-mine')) return;
      c.classList.add(r.minesAt.includes(i) ? 'ghost' : 'rest');
    });
  }

  // -------------------------------------------------------------------- render
  function render() {
    const g = game, r = g.round, playing = g.playing, step = playing ? r.step : 0;
    el.balance.textContent = fmt(g.balance);
    el.cur.textContent = g.currency; document.querySelectorAll('.cur-tag').forEach(t => { t.textContent = g.currency; });
    el.minesVal.textContent = g.mines;
    const share = g.mines / g.cells, lvl = share < 0.12 ? 'low' : share < 0.25 ? 'mid' : 'high';
    el.risk.textContent = { low: 'Low risk', mid: 'Medium risk', high: 'High risk' }[lvl]; el.risk.dataset.level = lvl;
    if (document.activeElement !== el.betIn) el.betIn.value = fmt(g.bet);
    el.fieldVal.textContent = `${side(g.cells)} × ${side(g.cells)}`;
    el.fieldList.querySelectorAll('li').forEach(li => { const on = +li.dataset.cells === g.cells; li.setAttribute('aria-selected', String(on)); li.querySelector('small').innerHTML = on ? '&#10003;' : `${li.dataset.cells} tiles`; });

    const locked = !g.canChangeSettings;
    el.settings.classList.toggle('locked', playing);
    el.lock.hidden = !playing;
    el.settings.querySelectorAll('button, input').forEach(b => { b.disabled = locked; });
    $('mines-dec').disabled = locked || g.mines <= 1; $('mines-inc').disabled = locked || g.mines >= g.cells - 1;
    if (locked && !el.fieldList.hidden) closeField();

    // board
    el.board.querySelectorAll('.cell').forEach((c, i) => { c.disabled = !g.canOpen(i); });
    el.board.classList.toggle('busy', g.busy);

    // action button
    const a = el.action;
    a.dataset.mode = playing ? (step > 0 ? 'cash' : 'wait') : 'play';
    a.setAttribute('aria-busy', String(g.busy));
    if (g.state === 'offline') { el.aMain.textContent = 'OFFLINE'; el.aSub.textContent = 'No connection'; a.disabled = true; }
    else if (playing && step > 0) { el.aMain.textContent = 'CASH OUT'; el.aSub.textContent = `${fmt(r.win)} ${g.currency}`; a.disabled = !g.canCollect; }
    else if (playing) { el.aMain.textContent = 'PICK A TILE'; el.aSub.textContent = 'Open any tile to start'; a.disabled = true; }
    else { el.aMain.textContent = last ? 'PLAY AGAIN' : 'PLAY'; el.aSub.textContent = `Bet ${fmt(g.bet)} ${g.currency}`; a.disabled = !g.canBet; }

    // readout card: title and value only
    const lad = g.ladder;
    if (playing && step > 0) { el.roTitle.textContent = 'Current win'; el.roValue.textContent = `${fmt(r.win)} ${g.currency}`; }
    else if (playing) { el.roTitle.textContent = 'Possible win'; el.roValue.textContent = `${fmt(g.possibleWin ?? 0)} ${g.currency}`; }
    else if (last) { el.roTitle.textContent = 'Last round'; el.roValue.textContent = `${last.kind === 'mine' ? '' : '+'}${fmt(last.payout)} ${g.currency}`; }
    else { el.roTitle.textContent = 'Possible win'; el.roValue.textContent = lad.length ? `${fmt(g.possibleWin)} ${g.currency}` : '-'; }
    el.hint.textContent = !playing && last ? 'Press Play again for a new round' : playing ? 'Open tiles. Cash out any time.' : 'Set your bet and press Play';

    // history strip: every step with its multiplier; reached = done, the next one = current while playing (as in the Figma layout)
    const idx = playing ? step : last ? last.step : 0;
    const key = lad.join();
    if (el.hist.dataset.key !== key) { el.hist.dataset.key = key; el.hist.innerHTML = lad.map((m, i) => `<span class="step-chip" data-s="${i + 1}"><b>${i + 1}</b><i></i><span>${fmtM(m)}</span></span>`).join(''); }
    el.hist.querySelectorAll('.step-chip').forEach(c => { const n = +c.dataset.s; c.className = 'step-chip' + (n <= idx ? ' done' : (playing || !last) && n === idx + 1 ? ' current' : ''); });
    const focus = el.hist.querySelector('.current') || [...el.hist.querySelectorAll('.done')].pop() || el.hist.firstElementChild;
    if (focus && el.hist.dataset.focus !== `${key}:${focus.dataset.s}:${focus.className}`) {   // scroll only when the focus moved, so repeated renders do not restart the animation
      el.hist.dataset.focus = `${key}:${focus.dataset.s}:${focus.className}`;
      el.hist.scrollTo({ left: focus.offsetLeft - el.hist.clientWidth / 2 + focus.clientWidth / 2, behavior: 'instant' });
    }
  }
  const act = async fn => { const p = fn(); render(); await p; render(); };
  function toast(msg) { el.toast.textContent = msg; el.toast.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.toast.classList.remove('show'), 3200); }

  // --------------------------------------------------------- field list / settings
  function openField() { el.fieldList.hidden = false; el.fieldBtn.setAttribute('aria-expanded', 'true'); }
  function closeField() { el.fieldList.hidden = true; el.fieldBtn.setAttribute('aria-expanded', 'false'); }
  function setPop(open) { el.pop.hidden = !open; el.scrim.hidden = !open || !phoneMQ.matches; $('btn-settings').setAttribute('aria-expanded', String(open)); }
  const bindSwitch = (id, key, apply, def) => {
    const sw = $(id), on = (store.get(key) ?? def) === '1';
    const set = v => { sw.setAttribute('aria-checked', String(v)); store.set(key, v ? '1' : '0'); apply(v); };
    sw.setAttribute('aria-checked', String(on)); apply(on);
    sw.addEventListener('click', () => set(sw.getAttribute('aria-checked') !== 'true'));
  };
  bindSwitch('sw-turbo', 'shinesAndMinesTurbo', v => document.documentElement.classList.toggle('turbo', v), '0');
  // audio: master mute button next to the gear, volume sliders in Settings. Players start only after a user gesture (js/main.js).
  let muted = store.get('shinesAndMinesMuted') === '1';
  const vol = { music: +(store.get('shinesAndMinesMusicVol') ?? 70), sfx: +(store.get('shinesAndMinesSfxVol') ?? 70) };
  const applyAudio = () => {
    if (!ui.unlocked) return;
    music?.setVolume(vol.music / 100); sfx?.setVolume(vol.sfx / 100);
    music?.setEnabled(!muted && vol.music > 0); sfx?.setEnabled(!muted && vol.sfx > 0);
  };
  ui.applyAudio = applyAudio;
  const paintMute = () => { $('btn-sound').setAttribute('aria-pressed', String(muted)); $('btn-sound').setAttribute('aria-label', muted ? 'Sound off' : 'Sound on'); };
  $('btn-sound').addEventListener('click', () => { muted = !muted; store.set('shinesAndMinesMuted', muted ? '1' : '0'); paintMute(); applyAudio(); });
  for (const [k, key] of [['music', 'shinesAndMinesMusicVol'], ['sfx', 'shinesAndMinesSfxVol']]) {
    const input = $('rng-' + k), out = $('out-' + k);
    const paint = () => { input.value = vol[k]; input.style.setProperty('--v', vol[k] + '%'); out.textContent = vol[k] + '%'; };
    input.addEventListener('input', () => { vol[k] = +input.value; store.set(key, String(vol[k])); paint(); applyAudio(); });
    paint();
  }
  paintMute();

  // ------------------------------------------------------------------ wiring
  game.on('board', () => { buildBoard(); buildFieldList(); });
  game.on('ladder', render);
  game.on('roundStart', () => { last = null; syncBoard(); });
  game.on('cell', e => { if (e.safe) revealSafe(e.cell); else revealMine(e.cell); });
  game.on('roundEnd', e => {
    last = e; revealRest(game.round);
    if (e.kind === 'mine') { el.board.classList.remove('shake'); void el.board.offsetWidth; el.board.classList.add('shake'); }
    render();
    if (e.kind !== 'mine' && e.multiplier >= GAME.bigWinMultiplier) {
      $('win-amount').textContent = `+${fmt(e.payout)} ${game.currency}`;
      $('win-sub').textContent = `${fmtX(e.multiplier)}  |  Bet ${fmt(e.bet)} ${game.currency}  |  ${side(game.cells)} × ${side(game.cells)}, ${game.mines} mines`;
      $('dlg-bigwin').showModal();
    }
  });
  game.on('error', err => { if (err.code === 12) toast('Not enough balance for this bet'); else if (game.state === 'idle' || game.state === 'playing') toast(`Server error ${err.code}. Try again`); $('off-code').textContent = `Error code: ${err.code ?? '-'}`; });
  game.on('recovery', () => { buildBoard(); buildFieldList(); render(); toast('Round restored'); });
  game.on('state', s => { if (s === 'offline') $('dlg-offline').open || $('dlg-offline').showModal(); render(); });

  el.board.addEventListener('click', e => { const c = e.target.closest('.cell'); if (c) act(() => game.open(+c.dataset.i)); });
  el.action.addEventListener('click', () => act(() => (game.playing ? game.collect() : game.placeBet())));
  $('mines-dec').addEventListener('click', () => act(() => game.setBoard({ mines: game.mines - 1 })));
  $('mines-inc').addEventListener('click', () => act(() => game.setBoard({ mines: game.mines + 1 })));
  const stepBet = dir => {
    const list = game.bets, i = list.findIndex(v => v >= game.bet - 1e-9);
    const j = dir > 0 ? (list[i] > game.bet + 1e-9 ? i : i + 1) : i - 1;
    game.setBet(list[Math.min(Math.max(j, 0), list.length - 1)], 'stepper'); render();
  };
  $('bet-dec').addEventListener('click', () => stepBet(-1));
  $('bet-inc').addEventListener('click', () => stepBet(1));
  $('bet-chips').addEventListener('click', e => {
    const q = e.target.closest('[data-q]')?.dataset.q; if (!q) return;
    game.setBet(q === 'half' ? game.bet / 2 : q === 'double' ? game.bet * 2 : Math.min(game.maxBet, game.balance), 'chip'); render();
  });
  el.betIn.addEventListener('change', () => { game.setBet(el.betIn.value, 'typed'); render(); });
  el.betIn.addEventListener('focus', () => el.betIn.select());
  el.betIn.addEventListener('keydown', e => { if (e.key === 'Enter') el.betIn.blur(); });
  el.fieldBtn.addEventListener('click', () => (el.fieldList.hidden ? openField() : closeField()));
  el.fieldList.addEventListener('click', e => { const li = e.target.closest('[data-cells]'); if (!li) return; closeField(); act(() => game.setBoard({ cells: +li.dataset.cells })); });
  document.addEventListener('click', e => { if (!e.target.closest('.select')) closeField(); if (!el.pop.hidden && !e.target.closest('#settings-pop, #btn-settings')) setPop(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeField(); setPop(false); } });
  $('btn-settings').addEventListener('click', () => setPop(el.pop.hidden));
  $('pop-done').addEventListener('click', () => setPop(false));
  el.scrim.addEventListener('click', () => setPop(false));
  $('btn-help').addEventListener('click', () => $('dlg-help').showModal());
  $('row-info').addEventListener('click', () => { setPop(false); $('dlg-help').showModal(); });
  phoneMQ.addEventListener('change', () => {         // rotating or resizing: phones are capped at 6x6
    buildFieldList();
    if (game.canChangeSettings && side(game.cells) > maxSide()) act(() => game.setBoard({ cells: maxSide() ** 2 })); else render();
  });

  Object.assign(ui, { render, buildBoard, buildFieldList, toast });
  buildFieldList(); buildBoard(); render();
  return ui;
}
