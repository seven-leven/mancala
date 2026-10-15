import { assert, assertEquals, assertThrows } from "@std/assert";
import { newGame } from "../src/game/engine.ts";
import { DEFAULT_RULES, M1, M2, P1, P2 } from "../src/game/types.ts";
import { seeded } from "../tools/match.ts";
import { fit, ranges } from "../tools/tournament/elo.ts";
import { opening, symmetricLayout } from "../tools/tournament/openings.ts";

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

Deno.test("a game can start from a layout, with empty stores", () => {
  const layout = [3, 4, 5, 6, 7, 10, 14, 14, 10, 7, 6, 5, 4, 3];
  const g = newGame(DEFAULT_RULES, P2, layout);
  assertEquals(g.pits.slice(0, 14), layout);
  assertEquals([g.pits[M1], g.pits[M2], g.current], [0, 0, P2]);
});

Deno.test("a layout must fill 14 pits with every seed", () => {
  assertThrows(() => newGame(DEFAULT_RULES, P1, new Array(14).fill(6)));
  assertThrows(() => newGame(DEFAULT_RULES, P1, new Array(13).fill(7)));
});

Deno.test("symmetric boards: 49 a side, 3 to 10 a pit, the same from both seats", () => {
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

Deno.test("openings: standard is the new game; the others vary with the seed", () => {
  assertEquals(opening("standard", P1, seeded(1)).state.pits, newGame(DEFAULT_RULES, P1).pits);
  for (const kind of ["random-moves", "symmetric"] as const) {
    const a = opening(kind, P1, seeded(1)).state, b = opening(kind, P1, seeded(2)).state;
    assertEquals(sum(a.pits), 98);
    assert(a.pits.join() !== b.pits.join(), kind);
  }
});

Deno.test("Elo: an even record rates level; ranges resample whole pairs", () => {
  // Two bots, eight pairs that always split 1–1: every resample still splits them evenly.
  const split = [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0];
  const res = [[[], split], [split.map((x) => 1 - x), []]];
  assertEquals(fit(res).map(Math.round), [1000, 1000]);
  assertEquals(ranges(res, seeded(3), 2)[1], [1000, 1000]);
});
