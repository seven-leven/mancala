/**
 * Elo ratings from `deno task tournament 40 --openings random-moves --write` (40 games per pairing,
 * in matched pairs). Generated: don't edit. Random is pinned at 1000; low and high bound the 90% range.
 */
export const RATINGS_VERSION = "2026-10-15";

export const RATINGS: Record<string, { elo: number; low: number; high: number }> = {
  minimax: { elo: 1915, low: 1867, high: 1983 },
  dfs: { elo: 1862, low: 1805, high: 1928 },
  lookahead: { elo: 1659, low: 1604, high: 1714 },
  chainer: { elo: 1462, low: 1414, high: 1517 },
  greedy: { elo: 1332, low: 1285, high: 1382 },
  turtle: { elo: 1288, low: 1243, high: 1332 },
  sometimesGreedy: { elo: 1203, low: 1162, high: 1246 },
  first: { elo: 1030, low: 984, high: 1069 },
  random: { elo: 1000, low: 1000, high: 1000 },
  sometimesGenerous: { elo: 731, low: 677, high: 782 },
  generous: { elo: 591, low: 522, high: 648 },
  pushover: { elo: 568, low: 511, high: 608 },
};
