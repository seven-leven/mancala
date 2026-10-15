/**
 * Elo ratings from `deno task rate 60 --openings random-moves --write` (60 games per pairing,
 * in matched pairs). Generated: don't edit. Random is pinned at 1000; low and high bound the 90% range.
 */
export const RATINGS_VERSION = "2026-10-15";

export const RATINGS: Record<string, { elo: number; low: number; high: number }> = {
  minimax: { elo: 1974, low: 1939, high: 2014 },
  dfs: { elo: 1898, low: 1859, high: 1941 },
  shrewd: { elo: 1845, low: 1813, high: 1883 },
  lookahead: { elo: 1689, low: 1656, high: 1730 },
  planner: { elo: 1669, low: 1633, high: 1705 },
  chainer: { elo: 1470, low: 1436, high: 1509 },
  spoiler: { elo: 1447, low: 1414, high: 1481 },
  greedy: { elo: 1319, low: 1286, high: 1351 },
  turtle: { elo: 1303, low: 1276, high: 1334 },
  sometimesGreedy: { elo: 1211, low: 1182, high: 1243 },
  striker: { elo: 1154, low: 1124, high: 1187 },
  first: { elo: 1012, low: 982, high: 1042 },
  random: { elo: 1000, low: 1000, high: 1000 },
  hoarder: { elo: 951, low: 914, high: 983 },
  sometimesGenerous: { elo: 776, low: 740, high: 819 },
  generous: { elo: 638, low: 600, high: 678 },
  pushover: { elo: 566, low: 520, high: 599 },
};
