import { Emitter } from './emitter.js';
import { BackendError, ERR } from './backend.js';
import { GAME } from './config.js';

/** Money is always rounded to 2 decimals in this one function. */
export const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

/**
 * Headless rules/state machine: no DOM, no timers, talks only to a backend (js/backend.js interface).
 * It never knows where the mines are until the backend ends the round. The UI subscribes to events and
 * enables controls from the `can*` getters only.
 *
 * state:  'connecting' -> 'idle' <-> 'playing'   |   'offline' (connect failed or session lost)
 * round:  null until the first bet; kept after it ends (status 'mine' | 'cashed' | 'cleared') until the next bet.
 * events: state, balance, betSelected {bet, previous, source}, board {cells, mines}, ladder, roundStart,
 *         cell {cell, safe, step, multiplier, win}, roundEnd {kind, bet, payout, multiplier, step, mines, source, balance},
 *         recovery {kind}, error (BackendError)
 */
export class Game extends Emitter {
  constructor(backend) {
    super();
    this.backend = backend;
    this.state = 'connecting';
    this.busy = false;               // a request is in flight: blocks every action
    this.balance = 0; this.currency = GAME.currency; this.demo = true; this.serverSession = null;
    this.bets = GAME.bets; this.minBet = GAME.minBet; this.maxBet = GAME.maxBet;
    this.bet = 1; this.cells = GAME.defaultCells; this.mines = GAME.defaultMines;
    this.ladder = [];                // multiplier per step for the selected board
    this.round = null;
    this._queue = Promise.resolve(); // the protocol allows one request at a time
    this._pending = 0;
  }

  // ------------------------------------------------------------------ getters
  get canChangeSettings() { return this.state === 'idle' && !this.busy; }
  get canBet() { return this.canChangeSettings && this.ladder.length > 0 && this.bet >= this.minBet && this.bet <= this.balance; }
  get playing() { return this.state === 'playing'; }
  canOpen(cell) {
    return this.playing && !this.busy && Number.isInteger(cell) && cell >= 0 && cell < this.round.cells && !this.round.opened.includes(cell);
  }
  get canCollect() { return this.playing && !this.busy && this.round.step > 0; }
  /** the win if the next opening is safe (idle: if the first one is) */
  get possibleWin() {
    const next = this.ladder[this.playing ? this.round.step : 0];
    return next === undefined ? null : round2((this.playing ? this.round.bet : this.bet) * next);
  }

  // ----------------------------------------------------------------- plumbing
  _setState(s) { if (s !== this.state) { this.state = s; this.emit('state', s); } }

  /** run one backend call: serialised, with busy set, errors turned into events; resolves to the reply or null */
  _send(fn) {
    this._pending++; this.busy = true;      // synchronously, so a second click right behind the first is already blocked
    const run = async () => {
      try { return await fn(); }
      catch (e) { await this._fail(e instanceof BackendError ? e : new BackendError(ERR.UNSPECIFIED, String(e?.message || e))); return null; }
      finally { this.busy = --this._pending > 0; }
    };
    return (this._queue = this._queue.then(run, run));
  }

  async _fail(err) {
    this.emit('error', err);
    if (err.code === ERR.NOT_AUTH || err.code === ERR.BAD_SESSION) this._setState('offline');
    else if (err.code === ERR.WRONG_STATE || err.code === ERR.MUST_BET || err.code === ERR.BAD_REQUEST) await this._resync();
  }

  /** the client and the server disagree about the round: ask the server and follow it */
  async _resync() {
    try {
      this._apply(await this.backend.connect());
      this.ladder = await this.backend.getLadder({ cells: this.cells, mines: this.mines });   // not _send: we are inside it
      this._restoreWin();
      this.emit('recovery', { kind: this.playing ? 'resumed' : 'idle' });
    }
    catch { this._setState('offline'); }
  }

  _apply(c) {
    this.serverSession = c.serverSession; this.demo = c.demo; this.currency = c.currency;
    this.bets = c.bets; this.minBet = c.minBet; this.maxBet = c.maxBet;
    this._setBalance(c.balance);
    const a = c.activeRound;
    if (a) {
      this.bet = a.bet; this.cells = a.cells; this.mines = a.mines;
      this.round = this._newRound(a.roundId, a.bet, a.hash, a.opened);
      this._setState('playing');
    } else {
      if (this.round?.status === 'active') this.round.status = 'aborted';
      this._setState('idle');
    }
  }

  _newRound(id, bet, hash, opened = []) {
    return { id, bet, cells: this.cells, mines: this.mines, hash, opened: [...opened], step: opened.length, multiplier: null, win: 0, status: 'active', payout: 0, minesAt: null, source: null };
  }

  /** after a resume the ladder is known again: fill in the multiplier/win of the already opened steps */
  _restoreWin() {
    const r = this.round;
    if (this.playing && r.step > 0) { r.multiplier = this.ladder[r.step - 1] ?? null; r.win = r.multiplier ? round2(r.bet * r.multiplier) : 0; }
  }

  _setBalance(b) { this.balance = b; this.emit('balance', b); }

  // ------------------------------------------------------------------- actions
  async init() {
    const c = await this._send(() => this.backend.connect());
    if (!c) return this._setState('offline');
    this._apply(c);
    await this._loadLadder();
    this._restoreWin();
    if (this.playing) this.emit('recovery', { kind: 'resumed' });
  }

  async _loadLadder() {
    const l = await this._send(() => this.backend.getLadder({ cells: this.cells, mines: this.mines }));
    if (l) { this.ladder = l; this.emit('ladder', l); }
  }

  /** typed or picked bet: sanitised, rounded, clamped to limits and balance. Returns false if ignored. */
  setBet(value, source = 'manual') {
    if (!this.canChangeSettings) return false;
    const v = Number(String(value).trim().replace(',', '.'));
    if (!Number.isFinite(v)) return false;
    const previous = this.bet;
    let bet = round2(clamp(v, this.minBet, this.maxBet));
    if (this.balance >= this.minBet) bet = Math.min(bet, this.balance);
    this.bet = bet;
    this.emit('betSelected', { bet, previous, source });
    return true;
  }

  /** board size and mine count; mines are clamped to 1..cells-1. Returns false if the board is not allowed. */
  async setBoard({ cells = this.cells, mines = this.mines }) {
    if (!this.canChangeSettings || !GAME.boardCells.includes(cells)) return false;
    mines = clamp(Math.round(Number(mines)) || 1, 1, cells - 1);
    this.cells = cells; this.mines = mines;
    this.ladder = [];                // canBet stays false until the new ladder arrives
    this.emit('board', { cells, mines });
    await this._loadLadder();
    return true;
  }

  async placeBet() {
    if (!this.canBet) return false;
    const { bet, cells, mines } = this;
    const r = await this._send(() => this.backend.bet({ bet, cells, mines }));
    if (!r) return false;
    this.round = this._newRound(r.roundId, bet, r.hash);
    this._setBalance(r.balance);
    this._setState('playing');
    this.emit('roundStart', { bet, cells, mines, balance: r.balance, hash: r.hash });
    return true;
  }

  async open(cell) {
    if (!this.canOpen(cell)) return false;
    const round = this.round;
    const r = await this._send(() => this.backend.open({ roundId: round.id, cell }));
    if (!r) return false;
    if (r.safe) {
      round.opened.push(cell); round.step = r.step; round.multiplier = r.multiplier; round.win = r.win;
      this.emit('cell', { cell, safe: true, step: r.step, multiplier: r.multiplier, win: r.win });
    } else this.emit('cell', { cell, safe: false, step: r.step, multiplier: round.multiplier, win: 0 });
    if (r.done) this._finish(r);
    return true;
  }

  async collect() {
    if (!this.canCollect) return false;
    const round = this.round;
    const r = await this._send(() => this.backend.collect({ roundId: round.id }));
    if (!r) return false;
    round.step = r.step; round.multiplier = r.multiplier;
    this._finish(r);
    return true;
  }

  _finish(r) {
    const round = this.round;
    round.status = r.kind; round.payout = r.payout; round.minesAt = r.mines; round.source = r.source;
    this._setBalance(r.balance);
    this._setState('idle');
    this.emit('roundEnd', {
      kind: r.kind, bet: round.bet, payout: r.payout, multiplier: round.multiplier, step: round.step,
      mines: r.mines, source: r.source, balance: r.balance,
    });
  }
}
