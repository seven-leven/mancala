/**
 * Elo ratings from `deno task rate 240 --openings random-moves --write` (240 games per pairing,
 * in matched pairs). Generated: don't edit. Random is pinned at 1000; low and high bound the 90% range.
 */
export const RATINGS_VERSION = "2026-10-15";

export const RATINGS: Record<string, { elo: number; low: number; high: number }> = {
  minimax: { elo: 2043, low: 2020, high: 2070 },
  dfs: { elo: 1980, low: 1955, high: 2008 },
  shrewd: { elo: 1908, low: 1885, high: 1935 },
  lookahead: { elo: 1739, low: 1720, high: 1768 },
  planner: { elo: 1685, low: 1667, high: 1712 },
  chainer: { elo: 1477, low: 1459, high: 1502 },
  spoiler: { elo: 1466, low: 1448, high: 1488 },
  greedy: { elo: 1320, low: 1303, high: 1340 },
  turtle: { elo: 1307, low: 1290, high: 1329 },
  sometimesGreedy: { elo: 1183, low: 1165, high: 1204 },
  striker: { elo: 1152, low: 1134, high: 1172 },
  random: { elo: 1000, low: 1000, high: 1000 },
  hoarder: { elo: 943, low: 922, high: 967 },
  sometimesGenerous: { elo: 757, low: 738, high: 778 },
  generous: { elo: 585, low: 561, high: 610 },
  pushover: { elo: 516, low: 491, high: 543 },
};
