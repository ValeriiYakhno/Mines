// One place for numbers: limits, boards, currency. Timings and layout numbers join in step 6.
export const ANALYTICS = { appVersion: '0.0.1' };

// Fallbacks and mock-server data. The real server sends bets/limits in connect(); the client reads only
// boardCells / default* from here.
export const GAME = {
  currency: 'FUN',
  startBalance: 7777,
  minBet: 0.1,
  maxBet: 100,
  bets: [0.1, 0.2, 0.5, 0.8, 1, 1.5, 2, 3, 5, 10, 15, 20, 30, 50, 80, 100],
  // allowed cell counts: square boards 3x3..9x9 and single rows of 3..9 cells (same as the emulator)
  boardCells: [3, 4, 5, 6, 7, 8, 9, 16, 25, 36, 49, 64, 81],
  defaultCells: 25,
  defaultMines: 3,
};

// Server-side rules, used ONLY by js/mock-backend.js (the client must never compute outcomes from these).
export const MOCK_RULES = {
  margin: 1.05,            // fair multiplier is divided by this (RTP ~95.2%), measured on the emulator
  maxMultiplier: 100000,   // a ladder stops before the first step that would exceed this
};
