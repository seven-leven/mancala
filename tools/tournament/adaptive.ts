/**
 * Adaptive allocation (`deno task rate 240 --adaptive`): close pairings get many games, lopsided
 * ones few. A game between bots that win p and 1 − p of the time carries p(1 − p) of information,
 * a quarter at 50/50 and almost nothing at 99/1, and the lopsided games are the slow searchers'
 * (Minimax against Pushover), so they cost the most for the least. docs/RATING.md has the maths.
 *
 * The plan is fixed before the run, from the ratings in src/bots/ratings.ts, and never changed by
 * results as they come in: that would bias both the fit and its ranges.
 */
import type { BotId, DormantId } from "../../src/bots/bots.ts";
import { BOTS, DORMANT, isDormantId } from "../../src/bots/bots.ts";

/** The fewest games any pairing gets: enough that a bot that isn't transitive still shows. */
export const FLOOR = 10;

/**
 * Matched pairs for each pairing: games(i, j) = max(FLOOR, round(G × 4p(1 − p))), rounded up to
 * whole pairs, with p from the ratings. A bot with no rating yet plays every pairing in full.
 */
export function plan(ids: (BotId | DormantId)[], ratings: Record<string, { elo: number }>, games: number): number[][] {
  return ids.map((a, i) =>
    ids.map((b, j) => {
      if (i === j) return 0;
      const [ra, rb] = [ratings[a]?.elo, ratings[b]?.elo];
      if (ra === undefined || rb === undefined) return games / 2;
      const p = 1 / (1 + 10 ** ((rb - ra) / 400));
      return Math.ceil(Math.max(FLOOR, Math.round(games * 4 * p * (1 - p))) / 2);
    })
  );
}

/** A rough cost for one of a bot's moves, to hand out the slowest pairings first. */
export function weight(id: BotId | DormantId): number {
  const spec = isDormantId(id) ? DORMANT[id] : BOTS[id];
  return id === "minimax" || id === "grandmaster"
    ? 100
    : spec.family === "search"
    ? 10
    : spec.family === "chain"
    ? 2
    : 1;
}
