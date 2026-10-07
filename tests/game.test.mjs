// Headless checks of Game against MockBackend: `npm test` (node:test, no dependencies).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, round2 } from '../public/js/game.js';
import { MockBackend, ladder } from '../public/js/mock-backend.js';
import { ERR, BackendError } from '../public/js/backend.js';

// mines at cells 0,1,2 (when 3 of them), the rest is safe
const fixed = (...at) => ({ pickMines: () => at });
const start = async (opts = {}, setup = async () => {}) => {
  const backend = new MockBackend(opts);
  const game = new Game(backend);
  await game.init();
  await setup(game);
  return { backend, game };
};
const events = (game, ...names) => { const log = []; names.forEach(n => game.on(n, e => log.push([n, e]))); return log; };

test('ladder matches the emulator (values read from polishchuk.com/projects/jgame/#/mnf1)', () => {
  assert.deepEqual(ladder(25, 1).slice(0, 6), [1, 1.04, 1.08, 1.13, 1.19, 1.25]);   // step 1 is clamped to 1.00
  assert.equal(ladder(25, 1).length, 24);
  assert.equal(ladder(25, 1).at(-1), 23.81);
  assert.deepEqual(ladder(25, 3).slice(0, 5), [1.08, 1.24, 1.42, 1.65, 1.92]);
  assert.equal(ladder(25, 3).length, 22);
  assert.equal(ladder(25, 3).at(-1), 2190.48);
  assert.equal(ladder(25, 5).at(-1), 50600);
  assert.equal(ladder(25, 12).length, 11);          // cut before the first step above 100000
  assert.equal(ladder(25, 12).at(-1), 54424.91);
  assert.equal(ladder(81, 10).length, 52);
  assert.equal(ladder(81, 10).at(-1), 89313.24);
  assert.deepEqual(ladder(25, 24), [23.81]);
});

test('init: connected, idle, balance and ladder loaded', async () => {
  const { game } = await start();
  assert.equal(game.state, 'idle');
  assert.equal(game.balance, 7777);
  assert.equal(game.ladder.length, 22);
  assert.equal(game.canBet, true);
  assert.equal(game.possibleWin, 1.08);
});

test('happy path: bet, two safe cells, collect', async () => {
  const { game } = await start(fixed(0, 1, 2));
  const log = events(game, 'roundStart', 'cell', 'roundEnd');
  game.setBet(10);
  assert.equal(await game.placeBet(), true);
  assert.equal(game.state, 'playing');
  assert.equal(game.balance, 7767);
  assert.equal(game.canBet, false);
  assert.equal(game.canCollect, false);             // nothing opened yet
  await game.open(10); await game.open(11);
  assert.equal(game.round.step, 2);
  assert.equal(game.round.win, round2(10 * 1.24));
  assert.equal(game.possibleWin, round2(10 * 1.42));
  assert.equal(game.canCollect, true);
  await game.collect();
  assert.equal(game.state, 'idle');
  assert.equal(game.balance, round2(7767 + 12.4));
  assert.equal(game.round.status, 'cashed');
  assert.deepEqual(game.round.minesAt, [0, 1, 2]);
  assert.deepEqual(log.map(([n]) => n), ['roundStart', 'cell', 'cell', 'roundEnd']);
  assert.equal(log.at(-1)[1].payout, 12.4);
});

test('loss: a mine ends the round, no payout, layout revealed', async () => {
  const { game } = await start(fixed(0, 1, 2));
  await game.placeBet();
  await game.open(5);
  await game.open(1);
  assert.equal(game.state, 'idle');
  assert.equal(game.round.status, 'mine');
  assert.equal(game.round.payout, 0);
  assert.equal(game.balance, 7776);
  assert.deepEqual(game.round.minesAt, [0, 1, 2]);
  assert.equal(game.canOpen(3), false);
});

test('clearing every step pays out automatically (3 cells, 1 mine)', async () => {
  const { game } = await start(fixed(0), g => g.setBoard({ cells: 3, mines: 1 }));
  assert.equal(game.ladder.length, 2);
  game.setBet(2);
  await game.placeBet();
  await game.open(1);
  assert.equal(game.state, 'playing');
  await game.open(2);
  assert.equal(game.state, 'idle');
  assert.equal(game.round.status, 'cleared');
  assert.equal(game.round.payout, round2(2 * game.ladder[1]));
  assert.equal(game.balance, round2(7777 - 2 + game.round.payout));
});

test('the client knows nothing about the mines while the round runs', async () => {
  const { game, backend } = await start(fixed(3, 4, 5));
  const seen = [];
  for (const m of ['bet', 'open']) { const f = backend[m].bind(backend); backend[m] = async a => { const r = await f(a); seen.push(r); return r; }; }
  await game.placeBet();
  await game.open(0);
  assert.equal(game.round.minesAt, null);
  assert.equal(game.round.source, null);
  assert.ok(seen.every(r => !('mines' in r) && !('source' in r)));
  assert.ok(!JSON.stringify(game.round).includes('"minesAt":['));
  await game.open(3);
  assert.deepEqual(game.round.minesAt, [3, 4, 5]);
});

test('bet input is sanitised and clamped', async () => {
  const { game } = await start();
  game.setBet(1000); assert.equal(game.bet, 100);
  game.setBet(0); assert.equal(game.bet, 0.1);
  game.setBet('2,5'); assert.equal(game.bet, 2.5);
  game.setBet(1.239); assert.equal(game.bet, 1.24);
  assert.equal(game.setBet('abc'), false); assert.equal(game.bet, 1.24);
  assert.equal(game.setBet(NaN), false);
  const poor = (await start({ balance: 5 })).game;
  poor.setBet(100); assert.equal(poor.bet, 5);
});

test('balance below the minimum bet: cannot bet, and the server refuses too', async () => {
  const { game, backend } = await start({ balance: 0.05 });
  assert.equal(game.canBet, false);
  assert.equal(await game.placeBet(), false);
  await assert.rejects(backend.bet({ bet: 0.1, cells: 25, mines: 3 }), e => e.code === ERR.LOW_BALANCE);
});

test('a backend error becomes an event, busy is cleared and the game goes on', async () => {
  const { game, backend } = await start();
  const log = events(game, 'error');
  backend.failNext(ERR.SERVER);
  assert.equal(await game.placeBet(), false);
  assert.equal(log[0][1].code, ERR.SERVER);
  assert.equal(game.busy, false);
  assert.equal(game.state, 'idle');
  assert.equal(game.balance, 7777);
  assert.equal(await game.placeBet(), true);
});

test('double actions are blocked while a request is in flight', async () => {
  const { game, backend } = await start({ latency: 5 }, g => g.placeBet());
  let calls = 0;
  const open = backend.open.bind(backend);
  backend.open = a => { calls++; return open(a); };
  const [a, b] = await Promise.all([game.open(7), (game.canOpen(8) ? game.open(8) : false)]);
  assert.equal(game.busy, false);
  assert.equal(calls, 1);
  assert.equal(b, false);
  assert.equal(a, true);
});

test('resume: a new Game on the same backend picks up the open round', async () => {
  const { game, backend } = await start(fixed(0, 1, 2));
  game.setBet(4);
  await game.placeBet(); await game.open(9); await game.open(10);
  const again = new Game(backend);
  const log = events(again, 'recovery');
  await again.init();
  assert.equal(again.state, 'playing');
  assert.equal(again.round.step, 2);
  assert.deepEqual(again.round.opened, [9, 10]);
  assert.equal(again.round.win, round2(4 * 1.24));
  assert.equal(again.bet, 4);
  assert.equal(log[0][1].kind, 'resumed');
  assert.equal(again.canOpen(9), false);
  await again.collect();
  assert.equal(again.balance, round2(7777 - 4 + 4 * 1.24));
});

test('wrong state from the server triggers a resync instead of a stuck screen', async () => {
  const { game, backend } = await start(fixed(0, 1, 2));
  await game.placeBet();
  backend.failNext(ERR.WRONG_STATE);
  const log = events(game, 'error', 'recovery');
  await game.open(10);
  assert.deepEqual(log.map(([n]) => n), ['error', 'recovery']);
  assert.equal(game.state, 'playing');
  assert.equal(game.busy, false);
});

test('connect failure: offline, nothing is enabled', async () => {
  const backend = new MockBackend();
  backend.failNext(ERR.DB_LOST);
  const game = new Game(backend);
  await game.init();
  assert.equal(game.state, 'offline');
  assert.equal(game.canBet, false);
  assert.equal(game.canOpen(0), false);
});

test('board: only allowed sizes, mines clamped, ladder reloaded, no changes mid-round', async () => {
  const { game } = await start();
  assert.equal(await game.setBoard({ cells: 10 }), false);
  await game.setBoard({ cells: 16, mines: 99 });
  assert.deepEqual([game.cells, game.mines], [16, 15]);
  assert.equal(game.ladder.length, 1);
  await game.setBoard({ mines: 0 });
  assert.equal(game.mines, 1);
  await game.setBoard({ cells: 25, mines: 3 });
  await game.placeBet();
  assert.equal(await game.setBoard({ cells: 9 }), false);
  assert.equal(game.setBet(5), false);
});

test('server validation: bad requests are rejected with codes from docs/api.pdf', async () => {
  const b = new MockBackend(fixed(0));
  await assert.rejects(b.open({ roundId: 'x', cell: 0 }), e => e.code === ERR.MUST_BET);
  await assert.rejects(b.bet({ bet: 0.005, cells: 25, mines: 3 }), e => e instanceof BackendError && e.code === ERR.BAD_REQUEST);
  await assert.rejects(b.bet({ bet: 1, cells: 25, mines: 25 }), e => e.code === ERR.BAD_REQUEST);
  const { roundId } = await b.bet({ bet: 1, cells: 25, mines: 1 });
  await assert.rejects(b.bet({ bet: 1, cells: 25, mines: 1 }), e => e.code === ERR.WRONG_STATE);
  await assert.rejects(b.open({ roundId }), e => e.code === ERR.NO_INDEX);
  await assert.rejects(b.open({ roundId, cell: 25 }), e => e.code === ERR.BAD_REQUEST);
  await assert.rejects(b.collect({ roundId }), e => e.code === ERR.WRONG_STATE);   // nothing opened yet
  await b.open({ roundId, cell: 5 });
  await assert.rejects(b.open({ roundId, cell: 5 }), e => e.code === ERR.WRONG_STATE);
});
