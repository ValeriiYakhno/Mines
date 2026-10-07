import { GAME, MOCK_RULES } from './config.js';
import { BackendError, ERR } from './backend.js';

const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;
const hex = bytes => [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');

/** Multiplier per step for a board; stops before the first step above MOCK_RULES.maxMultiplier. */
export function ladder(cells, mines) {
  const out = [];
  let p = 1;                                            // chance to survive n openings
  for (let n = 1; n <= cells - mines; n++) {
    p *= (cells - mines - n + 1) / (cells - n + 1);
    const mult = Math.max(1, round2(1 / (p * MOCK_RULES.margin)));
    if (mult > MOCK_RULES.maxMultiplier) break;
    out.push(mult);
  }
  return out;
}

const randomMines = (cells, count) => {                 // partial Fisher-Yates over crypto randomness
  const a = [...Array(cells).keys()];
  const r = crypto.getRandomValues(new Uint32Array(count));
  for (let i = 0; i < count; i++) { const j = i + r[i] % (cells - i); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, count);
};
const sha256 = async s => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))));

const validBoard = (cells, mines) => GAME.boardCells.includes(cells) && Number.isInteger(mines) && mines >= 1 && mines < cells;

/**
 * In-memory server with the interface of js/backend.js. Holds mine positions privately and reveals them
 * only when a round ends. Test hooks: `pickMines(cells, count) -> indices`, `failNext(code)`, `latency` (ms).
 */
export class MockBackend {
  #balance; #round = null; #fail = null; #nextId = 1;
  constructor({ balance = GAME.startBalance, pickMines = randomMines, latency = 0 } = {}) {
    this.#balance = balance; this.pickMines = pickMines; this.latency = latency;
  }

  failNext(code) { this.#fail = code; }

  async #call(fn) {
    if (this.latency) await new Promise(r => setTimeout(r, this.latency));
    if (this.#fail) { const code = this.#fail; this.#fail = null; throw new BackendError(code); }
    return fn();
  }

  #roundView() {
    const r = this.#round;
    return r && { roundId: r.id, bet: r.bet, cells: r.cells, mines: r.mines, opened: [...r.opened], step: r.opened.length, hash: r.hash };
  }

  connect() {
    return this.#call(() => ({
      serverSession: 'mock', demo: true, currency: GAME.currency, balance: this.#balance,
      bets: GAME.bets, minBet: GAME.minBet, maxBet: GAME.maxBet, activeRound: this.#roundView(),
    }));
  }

  getLadder({ cells, mines }) {
    return this.#call(() => {
      if (!validBoard(cells, mines)) throw new BackendError(ERR.BAD_REQUEST);
      return ladder(cells, mines);
    });
  }

  bet({ bet, cells, mines }) {
    return this.#call(async () => {
      if (this.#round) throw new BackendError(ERR.WRONG_STATE);
      if (!(bet >= GAME.minBet && bet <= GAME.maxBet) || round2(bet) !== bet || !validBoard(cells, mines)) throw new BackendError(ERR.BAD_REQUEST);
      if (bet > this.#balance) throw new BackendError(ERR.LOW_BALANCE);
      const at = this.pickMines(cells, mines);
      const source = `${at.join(',')},${hex(crypto.getRandomValues(new Uint8Array(16)))}`;
      const hash = await sha256(source);
      this.#balance = round2(this.#balance - bet);
      this.#round = { id: `r${this.#nextId++}`, bet, cells, mines, at, source, steps: ladder(cells, mines), opened: [], hash };
      return { roundId: this.#round.id, balance: this.#balance, hash };
    });
  }

  #finish(kind, payout) {
    const r = this.#round;
    this.#round = null;
    this.#balance = round2(this.#balance + payout);
    return { kind, payout, balance: this.#balance, mines: r.at, source: r.source };
  }

  #current(roundId) {
    if (!this.#round) throw new BackendError(ERR.MUST_BET);
    if (roundId !== this.#round.id) throw new BackendError(ERR.BAD_REQUEST);
    return this.#round;
  }

  open({ roundId, cell }) {
    return this.#call(() => {
      const r = this.#current(roundId);
      if (cell === undefined || cell === null) throw new BackendError(ERR.NO_INDEX);
      if (!Number.isInteger(cell) || cell < 0 || cell >= r.cells) throw new BackendError(ERR.BAD_REQUEST);
      if (r.opened.includes(cell)) throw new BackendError(ERR.WRONG_STATE);
      if (r.at.includes(cell)) return { safe: false, step: r.opened.length, done: true, ...this.#finish('mine', 0) };
      r.opened.push(cell);
      const step = r.opened.length, multiplier = r.steps[step - 1], win = round2(r.bet * multiplier);
      if (step === r.steps.length) return { safe: true, step, multiplier, win, done: true, ...this.#finish('cleared', win) };
      return { safe: true, step, multiplier, win, done: false };
    });
  }

  collect({ roundId }) {
    return this.#call(() => {
      const r = this.#current(roundId);
      const step = r.opened.length;
      if (!step) throw new BackendError(ERR.WRONG_STATE);
      const multiplier = r.steps[step - 1];
      return { step, multiplier, ...this.#finish('cashed', round2(r.bet * multiplier)) };
    });
  }
}
