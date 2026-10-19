/**
 * Elo ratings from `npm run rate -- 240 --openings random-moves --write` (240 games per pairing,
 * in matched pairs). Generated: don't edit. Random is pinned at 1000; low and high bound the 90% range;
 * above is the share of resampled fits in which the bot rates above the next one down.
 */
export const RATINGS_VERSION = "2026-10-19";

export const RATINGS: Record<string, { elo: number; low: number; high: number; above?: number }> = {
  minimax: { elo: 2092, low: 2073, high: 2115, above: 1.00 },
  dfs2: { elo: 2064, low: 2042, high: 2088, above: 1.00 },
  dfs: { elo: 2005, low: 1983, high: 2028, above: 1.00 },
  shrewd: { elo: 1918, low: 1896, high: 1942, above: 1.00 },
  montecarlo: { elo: 1848, low: 1829, high: 1868, above: 1.00 },
  lookahead: { elo: 1737, low: 1717, high: 1758, above: 1.00 },
  planner: { elo: 1686, low: 1669, high: 1708, above: 1.00 },
  sometimesPlanner: { elo: 1568, low: 1552, high: 1588, above: 1.00 },
  chainer: { elo: 1487, low: 1471, high: 1510, above: 0.98 },
  spoiler: { elo: 1466, low: 1448, high: 1485, above: 1.00 },
  greedy: { elo: 1312, low: 1295, high: 1331, above: 0.98 },
  turtle: { elo: 1295, low: 1279, high: 1312, above: 1.00 },
  sometimesGreedy: { elo: 1196, low: 1178, high: 1214, above: 1.00 },
  striker: { elo: 1137, low: 1118, high: 1155, above: 1.00 },
  random: { elo: 1000, low: 1000, high: 1000, above: 1.00 },
  hoarder: { elo: 926, low: 907, high: 945, above: 1.00 },
  fickle: { elo: 831, low: 813, high: 853, above: 1.00 },
  sometimesGenerous: { elo: 742, low: 723, high: 762, above: 1.00 },
  generous: { elo: 571, low: 547, high: 594, above: 1.00 },
  pushover: { elo: 503, low: 481, high: 529 },
};
