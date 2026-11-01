// Playable UI shell shared by the concepts: binds the real headless Game (+ MockBackend) to the DOM.
// Looks come from the concept's own CSS; structure and behaviour live here once.
import { Game } from '../../public/js/game.js';
import { MockBackend } from '../../public/js/mock-backend.js';
import { GAME } from '../../public/js/config.js';

const fmt = n => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtX = n => 'x' + (n >= 1000 ? Math.round(n).toLocaleString('en-US') : n.toFixed(2));
const side = cells => Math.round(Math.sqrt(cells));

const TEMPLATE = `
<header class="top">
  <div class="brand" aria-label="Shines and Mines">SHINES AND MINES</div>
  <div class="balance"><span class="lbl">Balance</span><b id="balance">0.00</b><i id="cur">FUN</i></div>
  <div class="top-actions">
    <button class="icon-btn" id="snd" aria-label="Sound" aria-pressed="false"><i class="ph-bold ph-speaker-slash"></i></button>
    <button class="icon-btn" id="help" aria-label="How to play"><i class="ph-bold ph-question"></i></button>
  </div>
</header>

<main class="stage">
  <section class="stats" aria-live="polite">
    <div class="stat"><span class="lbl">Multiplier</span><b id="st-mult">x1.00</b></div>
    <div class="stat stat-win"><span class="lbl">Win</span><b id="st-win">0.00</b></div>
    <div class="stat"><span class="lbl">Next tile</span><b id="st-next">x1.08</b><small id="st-next-win"></small></div>
  </section>
  <ol class="ladder" id="ladder" aria-label="Multiplier ladder"></ol>
  <div class="board-col">
    <div class="banner" id="banner" role="status"></div>
    <div class="board-wrap"><div class="board" id="board" role="group" aria-label="Game board"></div></div>
  </div>
</main>

<aside class="dock" id="dock">
  <div class="group g-mines">
    <div class="g-head"><span class="lbl">Mines</span><span class="risk" id="risk"></span></div>
    <div class="stepper">
      <button class="step" id="mines-dec" aria-label="Fewer mines"><i class="ph-bold ph-minus"></i></button>
      <output id="mines-val">3</output>
      <button class="step" id="mines-inc" aria-label="More mines"><i class="ph-bold ph-plus"></i></button>
    </div>
    <div class="chips" id="mines-chips"></div>
  </div>
  <div class="group g-field">
    <div class="g-head"><span class="lbl">Field</span></div>
    <div class="seg" id="field" role="radiogroup" aria-label="Field size"></div>
  </div>
  <div class="group g-bet">
    <div class="g-head"><span class="lbl">Bet</span><span class="cur-tag" id="cur2">FUN</span></div>
    <div class="stepper">
      <button class="step" id="bet-dec" aria-label="Lower bet"><i class="ph-bold ph-minus"></i></button>
      <input id="bet-in" inputmode="decimal" autocomplete="off" aria-label="Bet amount">
      <button class="step" id="bet-inc" aria-label="Higher bet"><i class="ph-bold ph-plus"></i></button>
    </div>
    <div class="chips" id="bet-chips">
      <button class="chip" data-q="half">1/2</button><button class="chip" data-q="double">2x</button><button class="chip" data-q="max">Max</button>
    </div>
  </div>
  <button class="action" id="action"><span class="a-main" id="a-main">PLAY</span><span class="a-sub" id="a-sub"></span></button>
</aside>
<div class="toast" id="toast" role="alert"></div>
<dialog class="help" id="help-dlg">
  <h2>How to play</h2>
  <ol>
    <li>Pick the number of mines, the field size and your bet, then press Play.</li>
    <li>Open tiles. Every safe tile raises the multiplier; a mine ends the round.</li>
    <li>Press Cash out any time after the first safe tile to take the current win.</li>
  </ol>
  <form method="dialog"><button class="action small">Got it</button></form>
</dialog>
`;

export async function mountConcept({ root = document.getElementById('app'), gem, mine, tileLabel = 'Tile' }) {
  root.innerHTML = TEMPLATE;
  const $ = s => root.querySelector(s);
  const game = new Game(new MockBackend({ latency: 140 }));
  window.game = game;                         // for poking from the console while reviewing
  const el = {
    balance: $('#balance'), cur: $('#cur'), cur2: $('#cur2'), board: $('#board'), banner: $('#banner'), ladder: $('#ladder'),
    stMult: $('#st-mult'), stWin: $('#st-win'), stNext: $('#st-next'), stNextWin: $('#st-next-win'),
    minesVal: $('#mines-val'), minesChips: $('#mines-chips'), risk: $('#risk'), field: $('#field'),
    betIn: $('#bet-in'), action: $('#action'), aMain: $('#a-main'), aSub: $('#a-sub'), toast: $('#toast'), dock: $('#dock'),
  };
  let last = null;                             // result of the last finished round, for the banner
  let toastTimer = 0;

  // ------------------------------------------------------------------ builders
  function buildBoard() {
    const n = side(game.cells);
    el.board.style.setProperty('--n', n);
    el.board.innerHTML = '';
    for (let i = 0; i < game.cells; i++) {
      const b = document.createElement('button');
      b.className = 'cell'; b.dataset.i = i; b.setAttribute('aria-label', `${tileLabel} ${i + 1}`);
      b.innerHTML = '<span class="face"></span><img class="ico" alt="" draggable="false"><span class="cap"></span>';
      el.board.appendChild(b);
    }
    syncBoard();
  }
  function buildField() {
    el.field.innerHTML = '';
    for (const c of GAME.boardCells) {
      const b = document.createElement('button');
      b.className = 'seg-btn'; b.dataset.cells = c; b.setAttribute('role', 'radio');
      b.textContent = `${side(c)}x${side(c)}`;
      el.field.appendChild(b);
    }
  }
  function buildLadder() {
    el.ladder.innerHTML = game.ladder.map((m, i) => `<li data-step="${i + 1}">${fmtX(m)}</li>`).join('');
  }
  function buildMineChips() {
    const opts = [1, 3, 5, 10, 20].filter(m => m < game.cells);
    el.minesChips.innerHTML = opts.map(m => `<button class="chip" data-m="${m}">${m}</button>`).join('');
  }

  // sets cell classes from the Game state (after init, resume, round start)
  function syncBoard() {
    const r = game.round;
    el.board.querySelectorAll('.cell').forEach(c => { c.className = 'cell'; c.querySelector('.ico').removeAttribute('src'); c.querySelector('.cap').textContent = ''; });
    if (!r || r.cells !== game.cells) return;
    r.opened.forEach((i, k) => revealSafe(i, game.ladder[k], false));
    if (r.status !== 'active' && r.minesAt) revealRest(r);
  }
  function revealSafe(i, mult, animate = true) {
    const c = el.board.children[i];
    c.classList.add('is-safe'); if (animate) c.classList.add('pop');
    c.querySelector('.ico').src = gem;
    c.querySelector('.cap').textContent = mult ? fmtX(mult) : '';
  }
  function revealMine(i) {
    const c = el.board.children[i];
    c.classList.add('is-mine', 'pop'); c.querySelector('.ico').src = mine;
  }
  function revealRest(r) {
    [...el.board.children].forEach((c, i) => {
      if (c.classList.contains('is-safe') || c.classList.contains('is-mine')) return;
      if (r.minesAt.includes(i)) { c.classList.add('ghost'); c.querySelector('.ico').src = mine; }
      else c.classList.add('rest');
    });
  }

  // -------------------------------------------------------------------- render
  function render() {
    const g = game, r = g.round, playing = g.playing;
    el.balance.textContent = fmt(g.balance);
    el.cur.textContent = el.cur2.textContent = g.currency;
    el.minesVal.textContent = g.mines;
    const share = g.mines / g.cells;
    el.risk.textContent = share < 0.12 ? 'Low risk' : share < 0.25 ? 'Medium risk' : 'High risk';
    el.risk.dataset.level = share < 0.12 ? 'low' : share < 0.25 ? 'mid' : 'high';
    if (document.activeElement !== el.betIn) el.betIn.value = fmt(g.bet);
    el.field.querySelectorAll('.seg-btn').forEach(b => b.setAttribute('aria-checked', String(+b.dataset.cells === g.cells)));
    el.minesChips.querySelectorAll('.chip').forEach(b => b.classList.toggle('on', +b.dataset.m === g.mines));

    const locked = !g.canChangeSettings;
    el.dock.classList.toggle('locked', locked);
    el.dock.querySelectorAll('.group button, .group input').forEach(b => { b.disabled = locked; });
    $('#mines-dec').disabled = locked || g.mines <= 1;
    $('#mines-inc').disabled = locked || g.mines >= g.cells - 1;

    const step = playing ? r.step : 0;
    const mult = step ? g.ladder[step - 1] : 1;
    el.stMult.textContent = fmtX(step ? mult : 1);
    el.stWin.textContent = playing ? fmt(r.win) : last ? fmt(last.payout) : '0.00';
    const nextM = g.ladder[step];
    el.stNext.textContent = nextM ? fmtX(nextM) : 'Max';
    el.stNextWin.textContent = g.possibleWin != null ? `= ${fmt(g.possibleWin)}` : '';
    el.ladder.querySelectorAll('li').forEach(li => {
      const s = +li.dataset.step;
      li.className = s <= step ? 'done' : s === step + 1 && playing ? 'next' : '';
    });
    const nextLi = el.ladder.querySelector('.next') || [...el.ladder.querySelectorAll('.done')].pop() || el.ladder.firstElementChild;
    if (nextLi) nextLi.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });

    el.board.querySelectorAll('.cell').forEach((c, i) => { c.disabled = !g.canOpen(i); c.classList.toggle('open-ready', g.canOpen(i)); });
    el.board.classList.toggle('busy', g.busy);

    // one action button, one place
    const a = el.action;
    a.dataset.mode = g.state === 'offline' ? 'offline' : playing ? (r.step > 0 ? 'cash' : 'wait') : 'play';
    a.setAttribute('aria-busy', String(g.busy));
    if (g.state === 'offline') { el.aMain.textContent = 'OFFLINE'; el.aSub.textContent = 'Reconnecting is not available in the concept'; a.disabled = true; }
    else if (playing && r.step > 0) { el.aMain.textContent = 'CASH OUT'; el.aSub.textContent = `${fmt(r.win)} ${g.currency}`; a.disabled = !g.canCollect; }
    else if (playing) { el.aMain.textContent = 'PICK A TILE'; el.aSub.textContent = 'Open any tile to start'; a.disabled = true; }
    else { el.aMain.textContent = last ? 'PLAY AGAIN' : 'PLAY'; el.aSub.textContent = `Bet ${fmt(g.bet)} ${g.currency}`; a.disabled = !g.canBet; }

    // banner
    const b = el.banner;
    if (!playing && last && last.kind === 'mine') { b.dataset.kind = 'loss'; b.innerHTML = `<b>Mine hit</b><span>Bet ${fmt(last.bet)} lost</span>`; }
    else if (!playing && last) { b.dataset.kind = 'win'; b.innerHTML = `<b>+${fmt(last.payout)} ${g.currency}</b><span>${fmtX(last.multiplier)} after ${last.step} tiles</span>`; }
    else if (playing && r.step === 0) { b.dataset.kind = 'hint'; b.innerHTML = '<b>Open a tile</b><span>Cash out is available after the first safe one</span>'; }
    else if (!playing) { b.dataset.kind = 'hint'; b.innerHTML = '<b>Ready</b><span>Choose mines, field and bet, then press Play</span>'; }
    else { b.dataset.kind = 'live'; b.innerHTML = `<b>${r.step} safe</b><span>Next tile ${nextM ? fmtX(nextM) : 'is the last'}</span>`; }
  }

  const act = async fn => { const p = fn(); render(); await p; render(); };
  const toast = msg => { el.toast.textContent = msg; el.toast.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.toast.classList.remove('show'), 3200); };

  // ------------------------------------------------------------------ wiring
  game.on('board', () => { buildBoard(); buildMineChips(); });
  game.on('ladder', () => { buildLadder(); render(); });
  game.on('roundStart', () => { last = null; syncBoard(); });
  game.on('cell', e => {
    if (e.safe) revealSafe(e.cell, e.multiplier); else revealMine(e.cell);
  });
  game.on('roundEnd', e => {
    last = e;
    const r = game.round;
    revealRest(r);
    if (e.kind === 'mine') { el.board.classList.remove('shake'); void el.board.offsetWidth; el.board.classList.add('shake'); }
    render();
  });
  game.on('error', err => toast(err.code === 12 ? 'Not enough balance for this bet' : `Server error ${err.code}. Try again`));
  game.on('recovery', () => { buildBoard(); render(); toast('Round restored'); });

  el.board.addEventListener('click', e => { const c = e.target.closest('.cell'); if (c) act(() => game.open(+c.dataset.i)); });
  el.action.addEventListener('click', () => act(() => (game.playing ? game.collect() : game.placeBet())));
  $('#mines-dec').addEventListener('click', () => act(() => game.setBoard({ mines: game.mines - 1 })));
  $('#mines-inc').addEventListener('click', () => act(() => game.setBoard({ mines: game.mines + 1 })));
  el.minesChips.addEventListener('click', e => { const b = e.target.closest('[data-m]'); if (b) act(() => game.setBoard({ mines: +b.dataset.m })); });
  el.field.addEventListener('click', e => { const b = e.target.closest('[data-cells]'); if (b) act(() => game.setBoard({ cells: +b.dataset.cells })); });
  const stepBet = dir => {
    const list = game.bets, i = list.findIndex(v => v >= game.bet - 1e-9);
    const j = dir > 0 ? (list[i] > game.bet + 1e-9 ? i : i + 1) : i - 1;
    game.setBet(list[Math.min(Math.max(j, 0), list.length - 1)], 'stepper'); render();
  };
  $('#bet-dec').addEventListener('click', () => stepBet(-1));
  $('#bet-inc').addEventListener('click', () => stepBet(1));
  $('#bet-chips').addEventListener('click', e => {
    const q = e.target.closest('[data-q]')?.dataset.q; if (!q) return;
    game.setBet(q === 'half' ? game.bet / 2 : q === 'double' ? game.bet * 2 : Math.min(game.maxBet, game.balance), 'chip'); render();
  });
  el.betIn.addEventListener('change', () => { game.setBet(el.betIn.value, 'typed'); render(); });
  el.betIn.addEventListener('focus', () => el.betIn.select());
  el.betIn.addEventListener('keydown', e => { if (e.key === 'Enter') el.betIn.blur(); });
  $('#help').addEventListener('click', () => $('#help-dlg').showModal());
  $('#snd').addEventListener('click', e => {
    const on = e.currentTarget.getAttribute('aria-pressed') !== 'true';
    e.currentTarget.setAttribute('aria-pressed', String(on));
    e.currentTarget.firstElementChild.className = `ph-bold ${on ? 'ph-speaker-high' : 'ph-speaker-slash'}`;
  });

  buildField(); buildBoard(); buildMineChips(); render();
  await game.init();
  buildBoard(); buildMineChips(); buildLadder(); render();
  return game;
}
