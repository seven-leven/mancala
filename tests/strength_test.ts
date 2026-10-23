/**
 * Strength checks: a few wide gaps on the ladder that must always hold, played the way the rating
 * harness plays (matched pairs from random openings, bots at their rated strength). Kept in their
 * own file so `node --test` runs them beside the rest; the whole file stays under 20 s.
 * Finer claims (who is 50 Elo above whom) belong to the rating harness, not to tests.
 */
import { test } from "node:test";
import { assert } from "./assert.ts";
import type { BotId, DormantId } from "../src/bots/bots.ts";
import { playPair } from "../harness/rate/play.ts";

/** How many of `pairs` matched pairs' games `a` wins against `b` (draws count half). */
function score(a: BotId | DormantId, b: BotId | DormantId, pairs: number): number {
  let won = 0;
  for (let round = 0; round < pairs; round++) {
    const r = playPair({ round, i: 0, j: 1, a, b, opening: "random-moves", record: false });
    won += r.results[0] + r.results[1];
  }
  return won;
}

const checks: [BotId | DormantId, BotId | DormantId, number, number][] = [
  // a, b, matched pairs, games a must win (of 2 × pairs)
  ["lookahead", "random", 6, 10],
  ["greedy", "pushover", 6, 11],
  ["random", "pushover", 6, 10],
  ["minimax", "pushover", 4, 8],
  ["minimax", "random", 4, 8],
  ["minimax", "greedy", 4, 7],
  ["montecarlo", "random", 4, 8],
];

for (const [a, b, pairs, need] of checks) {
  test(`${a} beats ${b} (at least ${need} of ${2 * pairs} games)`, () => {
    const won = score(a, b, pairs);
    assert(won >= need, `${a} won ${won} of ${2 * pairs} against ${b}`);
  });
}
