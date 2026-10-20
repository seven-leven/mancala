/**
 * Elo ratings from `npm run rate -- 240 --openings random-moves --write` (240 games per pairing,
 * in matched pairs). Generated: don't edit. Random is pinned at 1000; low and high bound the 90% range;
 * above is the share of resampled fits in which the bot rates above the next one down.
 */
export const RATINGS_VERSION = "2026-10-20";

export const RATINGS: Record<string, { elo: number; low: number; high: number; above?: number }> = {
  learned: { elo: 2074, low: 2056, high: 2097, above: 0.54 },
  minimax: { elo: 2074, low: 2054, high: 2098, above: 0.99 },
  dfs2: { elo: 2057, low: 2038, high: 2079, above: 1.00 },
  dfs: { elo: 2004, low: 1988, high: 2024, above: 1.00 },
  shrewd: { elo: 1919, low: 1900, high: 1941, above: 1.00 },
  montecarlo: { elo: 1840, low: 1823, high: 1859, above: 1.00 },
  lookahead: { elo: 1737, low: 1721, high: 1756, above: 1.00 },
  planner: { elo: 1683, low: 1664, high: 1702, above: 1.00 },
  sometimesPlanner: { elo: 1564, low: 1547, high: 1582, above: 1.00 },
  chainer: { elo: 1485, low: 1467, high: 1503, above: 0.98 },
  spoiler: { elo: 1465, low: 1447, high: 1483, above: 1.00 },
  greedy: { elo: 1311, low: 1295, high: 1329, above: 0.98 },
  turtle: { elo: 1294, low: 1277, high: 1310, above: 1.00 },
  sometimesGreedy: { elo: 1195, low: 1179, high: 1213, above: 1.00 },
  striker: { elo: 1138, low: 1122, high: 1155, above: 1.00 },
  random: { elo: 1000, low: 1000, high: 1000, above: 1.00 },
  hoarder: { elo: 926, low: 906, high: 946, above: 1.00 },
  fickle: { elo: 832, low: 813, high: 847, above: 1.00 },
  sometimesGenerous: { elo: 743, low: 724, high: 761, above: 1.00 },
  generous: { elo: 572, low: 549, high: 592, above: 1.00 },
  pushover: { elo: 504, low: 481, high: 525 },
};
