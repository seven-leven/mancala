/**
 * Elo ratings from `deno task rate 240 --openings random-moves --write` (240 games per pairing,
 * in matched pairs). Generated: don't edit. Random is pinned at 1000; low and high bound the 90% range.
 */
export const RATINGS_VERSION = "2026-10-15";

export const RATINGS: Record<string, { elo: number; low: number; high: number }> = {
  minimax: { elo: 2064, low: 2043, high: 2092 },
  dfs: { elo: 1976, low: 1957, high: 2004 },
  shrewd: { elo: 1905, low: 1884, high: 1931 },
  lookahead: { elo: 1750, low: 1729, high: 1776 },
  planner: { elo: 1698, low: 1680, high: 1720 },
  chainer: { elo: 1494, low: 1475, high: 1515 },
  spoiler: { elo: 1476, low: 1459, high: 1495 },
  greedy: { elo: 1325, low: 1310, high: 1344 },
  turtle: { elo: 1315, low: 1299, high: 1336 },
  sometimesGreedy: { elo: 1205, low: 1188, high: 1225 },
  striker: { elo: 1147, low: 1130, high: 1165 },
  random: { elo: 1000, low: 1000, high: 1000 },
  first: { elo: 999, low: 984, high: 1017 },
  hoarder: { elo: 920, low: 905, high: 940 },
  sometimesGenerous: { elo: 730, low: 709, high: 752 },
  generous: { elo: 561, low: 537, high: 586 },
  pushover: { elo: 494, low: 471, high: 518 },
};
