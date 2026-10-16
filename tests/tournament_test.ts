import { test } from "node:test";
import { assert, assertEquals, assertThrows } from "./assert.ts";
import { newGame } from "../src/game/engine.ts";
import { DEFAULT_RULES, M1, M2, P1, P2 } from "../src/game/types.ts";
import { seeded } from "../tools/match.ts";
import { aboveShare, fit, misfits, ranges } from "../tools/tournament/elo.ts";
import { opening, symmetricLayout } from "../tools/tournament/openings.ts";

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

test("a game can start from a layout, with empty stores", () => {
  const layout = [3, 4, 5, 6, 7, 10, 14, 14, 10, 7, 6, 5, 4, 3];
  const g = newGame(DEFAULT_RULES, P2, layout);
  assertEquals(g.pits.slice(0, 14), layout);
  assertEquals([g.pits[M1], g.pits[M2], g.current], [0, 0, P2]);
});

test("a layout must fill 14 pits with every seed", () => {
  assertThrows(() => newGame(DEFAULT_RULES, P1, new Array(14).fill(6)));
  assertThrows(() => newGame(DEFAULT_RULES, P1, new Array(13).fill(7)));
});

test("symmetric boards: 49 a side, 3 to 10 a pit, the same from both seats", () => {
  const rng = seeded(1);
  for (let k = 0; k < 200; k++) {
    const b = symmetricLayout(rng);
    assertEquals(sum(b.slice(0, 7)), 49);
    assertEquals(sum(b.slice(7)), 49);
    assert(b.every((x) => x >= 3 && x <= 10), `out of range: ${b}`);
    // Player 1's pit i (from their left) matches Player 2's pit 13 − i (from theirs).
    for (let i = 0; i < 7; i++) assertEquals(b[i], b[13 - i]);
  }
});

test("openings: standard is the new game; the others vary with the seed", () => {
  assertEquals(opening("standard", P1, seeded(1)).state.pits, newGame(DEFAULT_RULES, P1).pits);
  for (const kind of ["random-moves", "symmetric"] as const) {
    const a = opening(kind, P1, seeded(1)).state, b = opening(kind, P1, seeded(2)).state;
    assertEquals(sum(a.pits), 98);
    assert(a.pits.join() !== b.pits.join(), kind);
  }
});

test("Elo: an even record rates level; ranges resample whole pairs", () => {
  // Two bots, eight pairs that always split 1–1: every resample still splits them evenly.
  const split = [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0];
  const res = [[[], split], [split.map((x) => 1 - x), []]];
  assertEquals(fit(res).map(Math.round), [1000, 1000]);
  assertEquals(ranges(res, seeded(3), 2)[1], [1000, 1000]);
});

test("above: the share of resamples where one bot rates above another", () => {
  const samples = [[1000, 1000, 1000, 1000], [1100, 990, 1050, 1200], [900, 1010, 950, 800]];
  assertEquals(aboveShare(samples, 1, 0), 0.75);
  assertEquals(aboveShare(samples, 1, 2), 0.75); // resample 2: 990 is below 1010
  assertEquals(aboveShare(samples, 2, 1), 0.25);
});

test("model check: a pairing the ratings can't explain is flagged, a fair one isn't", () => {
  // Three bots, 20 matched pairs each. A beats B and B beats C as expected, but C beats A every
  // time: rock, paper, scissors, which no set of ratings explains.
  const pairs = (share: number) => Array.from({ length: 40 }, (_, k) => (k < 40 * share ? 1 : 0));
  const flip = (xs: number[]) => xs.map((x) => 1 - x);
  const ab = pairs(0.75), bc = pairs(0.75), ca = pairs(1);
  const res = [[[], ab, flip(ca)], [flip(ab), [], bc], [ca, flip(bc), []]];
  const found = misfits(res, fit(res));
  assert(found.length > 0, "rock-paper-scissors should be flagged");
  const fair = [[[], ab, pairs(0.9)], [flip(ab), [], bc], [flip(pairs(0.9)), flip(bc), []]];
  assertEquals(misfits(fair, fit(fair)), []);
});
