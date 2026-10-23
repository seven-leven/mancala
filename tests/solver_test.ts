/** The small-board solver (lab/solve/solver.ts): the engine's rules on any board, and exact answers. */
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { assert, assertEquals } from "./assert.ts";
import { newGame, playTurn, validMoves } from "../src/game/engine.ts";
import { DEFAULT_RULES, P1, P2 } from "../src/game/types.ts";
import { solveParallel } from "../lab/solve/parallel.ts";
import { AGAIN, type Board, Memo, newBoard, OVER, play, Rules, solve } from "../lab/solve/solver.ts";
import { seeded } from "../harness/match.ts";

test("on the 7-pit board, the solver's moves are the engine's, seed for seed", () => {
  const rng = seeded(7);
  for (let game = 0; game < 40; game++) {
    let s = newGame({ ...DEFAULT_RULES, seeds: 1 + (game % 10) }, game % 2 ? P1 : P2);
    const b: Board = { n: 7, pits: [...s.pits], mover: s.current === P1 ? 0 : 1 };
    while (!s.gameOver) {
      const moves = validMoves(s);
      const pit = moves[Math.floor(rng() * moves.length)];
      const r = playTurn(s, pit);
      assert(!r.invalid);
      const mine = play(b, pit);
      s = r.state;
      assertEquals(b.pits, s.pits, `game ${game}, pit ${pit}`);
      assertEquals(mine.over, s.gameOver);
      assertEquals(mine.again, r.freeTurn && !s.gameOver);
      if (!s.gameOver) assertEquals(b.mover, s.current === P1 ? 0 : 1);
    }
  }
});

/** Plain minimax, no memory and no pruning: the first player's margin. */
function brute(b: Board): number {
  const { n } = b, me = b.mover, first = me === 0 ? 0 : n;
  let best = -Infinity;
  for (let i = first; i < first + n; i++) {
    if (b.pits[i] === 0) continue;
    const c: Board = { n, pits: [...b.pits], mover: me };
    const r = play(c, i);
    const margin = c.pits[2 * n + me] - c.pits[2 * n + 1 - me];
    best = Math.max(best, r.over ? margin : r.again ? brute(c) : -brute(c));
  }
  return best;
}

test("solving small boards gives plain minimax's answer, and an opening that keeps it", () => {
  for (const [n, seeds] of [[1, 1], [1, 4], [2, 1], [2, 3], [3, 2], [3, 3], [4, 2]]) {
    const b = newBoard(n, seeds);
    const r = solve(b);
    const exact = brute(b);
    assertEquals([r.lo, r.hi], [exact, exact], `${n} pits, ${seeds} seeds`);
    const c: Board = { n, pits: [...b.pits], mover: 0 };
    const after = play(c, r.move!);
    const margin = c.pits[2 * n] - c.pits[2 * n + 1];
    assertEquals(after.over ? margin : after.again ? brute(c) : -brute(c), exact, "the opening keeps the value");
  }
});

test("a position part way through, the second player to move and a pit empty, solves as plain minimax does", () => {
  //                                0  1  2  3  4  5  S1 S2
  const b: Board = { n: 3, pits: [2, 0, 3, 0, 2, 1, 4, 6], mover: 1 };
  const r = solve(b);
  assertEquals([r.lo, r.hi], [brute(b), brute(b)]);
  const c: Board = { n: 3, pits: [...b.pits], mover: 1 };
  const after = play(c, 3 + r.move!);
  const margin = c.pits[7] - c.pits[6];
  assertEquals(after.over ? margin : after.again ? brute(c) : -brute(c), brute(b), "its pit keeps the value");
});

test("out of budget, a solve returns the bounds it has proved and no opening", () => {
  const r = solve(newBoard(5, 5), 50);
  assert(r.lo < r.hi && r.move === null && r.nodes > 50);
  assert(r.lo >= -50 && r.hi <= 50);
});

test("a memo far too small for the board keeps replacing entries, and the answers stay exact", () => {
  // 2^6 = 64 entries for about 80,000 positions: nearly every write replaces another.
  const r = solve(newBoard(6, 4), Infinity, 6);
  assertEquals([r.lo, r.hi, r.move], [42, 42, 5]);
  const m = new Memo(2);
  const entry = (effort: number) => (0x80000000 | (effort << 22)) >>> 0; // a value word, with its work
  m.set(1, 10, entry(5));
  m.set(1, 11, entry(9));
  m.set(1, 12, entry(7)); // a full bucket: replaces the one with less work (5)
  assertEquals([m.get(1, 10), m.get(1, 11) !== 0, m.get(1, 12) !== 0], [0, true, true]);
  m.set(1, 11, entry(1)); // the same key: updated in place, whatever its work
  assertEquals(m.get(1, 11), entry(1));
});

test("a move's key, updated seed by seed, is the key of the board it leaves", () => {
  const rules = new Rules(7, 98), rng = seeded(3);
  for (let game = 0; game < 20; game++) {
    const b = newBoard(7, 7);
    for (let ply = 0; ply < 200; ply++) {
      const moves = [0, 1, 2, 3, 4, 5, 6].map((k) => b.mover * 7 + k).filter((i) => b.pits[i] > 0);
      rules.hash(b.pits, b.mover);
      const f = rules.play(b.pits, b.mover, moves[Math.floor(rng() * moves.length)]);
      const [lo, hi] = [rules.lo, rules.hi];
      if (f & OVER) break;
      if (!(f & AGAIN)) b.mover = b.mover === 0 ? 1 : 0;
      rules.hash(b.pits, b.mover);
      assertEquals([lo, hi], [rules.lo, rules.hi], `game ${game}, ply ${ply}`);
    }
  }
});

test("on several workers sharing a memo, the answer is the same; a saved memo carries the work over", async () => {
  const dir = mkdtempSync(join(tmpdir(), "solve-"));
  const file = join(dir, "6x5.bin");
  const all = await solveParallel(newBoard(6, 5), { workers: 3, bits: 18 });
  assertEquals([all.lo, all.hi, all.move], [52, 52, 2]);
  // Stopped early: the bounds so far, no opening, and the memo saved.
  const short = await solveParallel(newBoard(6, 5), { workers: 2, budget: 20_000, bits: 18, file });
  assert(short.lo < short.hi && short.move === null && existsSync(file));
  // Carried on from it: solved, and the saved memo is no longer kept.
  const rest = await solveParallel(newBoard(6, 5), { workers: 2, bits: 18, file });
  assertEquals([rest.lo, rest.hi, rest.move], [52, 52, 2]);
  assert(!existsSync(file));
  // A memo saved for another board is ignored.
  await solveParallel(newBoard(6, 5), { workers: 2, budget: 20_000, bits: 18, file });
  const other = await solveParallel(newBoard(5, 4), { workers: 2, bits: 18, file });
  assertEquals([other.lo, other.hi], [solve(newBoard(5, 4)).lo, solve(newBoard(5, 4)).hi]);
  rmSync(dir, { recursive: true });
});
