/**
 * Elo ratings from `deno task rate 240 --openings random-moves --write` (240 games per pairing,
 * in matched pairs). Generated: don't edit. Random is pinned at 1000; low and high bound the 90% range;
 * above is the share of resampled fits in which the bot rates above the next one down.
 */
export const RATINGS_VERSION = "2026-10-15";

export const RATINGS: Record<string, { elo: number; low: number; high: number; above?: number }> = {
  minimax: { elo: 2048, low: 2028, high: 2070, above: 1.00 },
  dfs: { elo: 1970, low: 1948, high: 1994, above: 1.00 },
  shrewd: { elo: 1911, low: 1890, high: 1933, above: 1.00 },
  lookahead: { elo: 1725, low: 1706, high: 1744, above: 0.99 },
  planner: { elo: 1696, low: 1679, high: 1716, above: 1.00 },
  sometimesPlanner: { elo: 1566, low: 1548, high: 1587, above: 1.00 },
  chainer: { elo: 1482, low: 1465, high: 1501, above: 0.99 },
  spoiler: { elo: 1460, low: 1442, high: 1480, above: 1.00 },
  greedy: { elo: 1311, low: 1296, high: 1331, above: 0.91 },
  turtle: { elo: 1298, low: 1282, high: 1315, above: 1.00 },
  sometimesGreedy: { elo: 1197, low: 1179, high: 1214, above: 1.00 },
  striker: { elo: 1139, low: 1123, high: 1157, above: 1.00 },
  random: { elo: 1000, low: 1000, high: 1000, above: 1.00 },
  hoarder: { elo: 926, low: 907, high: 946, above: 1.00 },
  fickle: { elo: 831, low: 812, high: 849, above: 1.00 },
  sometimesGenerous: { elo: 742, low: 722, high: 761, above: 1.00 },
  generous: { elo: 570, low: 548, high: 594, above: 1.00 },
  pushover: { elo: 502, low: 481, high: 522 },
};
