/**
 * Elo ratings from `deno task tournament 40 --write` (40 games per pairing). Generated: don't edit.
 * Random is pinned at 1000; low and high bound the 90% range.
 */
export const RATINGS_VERSION = "2026-10-15";

export const RATINGS: Record<string, { elo: number; low: number; high: number }> = {
  minimax: { elo: 1908, low: 1816, high: 2026 },
  dfs: { elo: 1838, low: 1753, high: 1939 },
  lookahead: { elo: 1677, low: 1600, high: 1786 },
  greedy: { elo: 1383, low: 1308, high: 1460 },
  first: { elo: 1097, low: 1038, high: 1153 },
  random: { elo: 1000, low: 1000, high: 1000 },
  generous: { elo: 609, low: 534, high: 684 },
  pushover: { elo: 556, low: 482, high: 614 },
};
