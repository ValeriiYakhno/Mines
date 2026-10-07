// Backend interface. js/mock-backend.js implements it now; the real WebSocket client replaces it later
// without touching js/game.js. All methods return Promises. The real protocol (docs/api.pdf) is one JSON
// request at a time over a WebSocket, so the Game sends strictly one request at a time.
//
//   connect()                    -> { serverSession, demo, currency, balance, bets, minBet, maxBet,
//                                     activeRound: null | { roundId, bet, cells, mines, opened[], step, hash } }
//   getLadder({ cells, mines })  -> number[]  multiplier per step (index 0 = step 1); its length = max steps
//   bet({ bet, cells, mines })   -> { roundId, balance, hash }   balance is after the bet; hash commits the mine layout
//   open({ roundId, cell })      -> { safe, step, multiplier?, win?, done, kind?, payout?, balance?, mines?, source? }
//   collect({ roundId })         -> { kind, step, multiplier, payout, balance, mines, source }
//
// `cell` is a row-major index 0..cells-1. The mine layout (`mines`, `source`) is ONLY present once the
// round is over (kind: 'mine' | 'cashed' | 'cleared'); while it runs the client knows nothing about it.
// Failures reject with BackendError; codes follow the "Errors" table of docs/api.pdf.

export const ERR = {
  UNSPECIFIED: 1, BAD_REQUEST: 3, DB_LOST: 4, NOT_AUTH: 5, SERVER: 10,
  LOW_BALANCE: 12, BAD_SESSION: 13, WRONG_STATE: 14, MUST_BET: 15, NO_INDEX: 16,
};

export class BackendError extends Error {
  constructor(code, message) { super(message || `backend error ${code}`); this.name = 'BackendError'; this.code = code; }
}
