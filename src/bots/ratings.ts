/**
 * Elo ratings from `npm run rate -- 240 --openings random-moves --write` (240 games per pairing,
 * in matched pairs). Generated: don't edit. Random is pinned at 1000; low and high bound the 90% range;
 * above is the share of resampled fits in which the bot rates above the next one down.
 */
export const RATINGS_VERSION = "2026-10-20";

export const RATINGS: Record<string, { elo: number; low: number; high: number; above?: number }> = {
  minimax: { elo: 2068, low: 2050, high: 2091, above: 0.93 },
  learned: { elo: 2058, low: 2036, high: 2082, above: 0.99 },
  dfs2: { elo: 2041, low: 2021, high: 2064, above: 1.00 },
  dfs: { elo: 2007, low: 1987, high: 2031, above: 1.00 },
  shrewd: { elo: 1925, low: 1907, high: 1948, above: 1.00 },
  montecarlo: { elo: 1857, low: 1837, high: 1878, above: 1.00 },
  lookahead: { elo: 1742, low: 1723, high: 1764, above: 1.00 },
  planner: { elo: 1670, low: 1652, high: 1692, above: 1.00 },
  sometimesPlanner: { elo: 1556, low: 1539, high: 1578, above: 1.00 },
  chainer: { elo: 1492, low: 1477, high: 1512, above: 1.00 },
  spoiler: { elo: 1468, low: 1450, high: 1487, above: 1.00 },
  greedy: { elo: 1324, low: 1307, high: 1342, above: 1.00 },
  turtle: { elo: 1285, low: 1268, high: 1303, above: 1.00 },
  sometimesGreedy: { elo: 1185, low: 1169, high: 1203, above: 0.99 },
  striker: { elo: 1163, low: 1144, high: 1182, above: 1.00 },
  random: { elo: 1000, low: 1000, high: 1000, above: 1.00 },
  hoarder: { elo: 909, low: 888, high: 925, above: 1.00 },
  fickle: { elo: 804, low: 785, high: 825, above: 1.00 },
  sometimesGenerous: { elo: 731, low: 711, high: 749, above: 1.00 },
  generous: { elo: 567, low: 546, high: 588, above: 1.00 },
  pushover: { elo: 489, low: 469, high: 511, above: 0.81 },
  decompiledPushover: { elo: 480, low: 460, high: 501, above: 0.96 },
  learnedPushover: { elo: 456, low: 434, high: 476 },
};
