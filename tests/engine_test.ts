import { test } from "node:test";
import { assert, assertEquals } from "./assert.ts";
import { newGame, playTurn, SOW_ORDER, validMoves } from "../src/game/engine.ts";
import { DEFAULT_RULES, type GameState, M1, M2, P1, P2, type Rules } from "../src/game/types.ts";

/** A position from a list of 16 numbers (pits 0–13, then M1, M2). */
function position(pits: number[], current = P1, rules: Partial<Rules> = {}): GameState {
  return { rules: { ...DEFAULT_RULES, ...rules }, pits: [...pits], current, gameOver: false };
}
const total = (s: GameState) => s.pits.reduce((a, b) => a + b, 0);
function played(s: GameState, pit: number) {
  const r = playTurn(s, pit);
  if (r.invalid) throw new Error(`pit ${pit} was invalid`);
  return r;
}

test("a new game has seven seeds in each pit and empty stores", () => {
  const g = newGame(DEFAULT_RULES, P1);
  assertEquals(g.pits.slice(0, 14), new Array(14).fill(7));
  assertEquals([g.pits[M1], g.pits[M2]], [0, 0]);
  assertEquals(validMoves(g), [0, 1, 2, 3, 4, 5, 6]);
  assertEquals(validMoves({ ...g, current: P2 }), [7, 8, 9, 10, 11, 12, 13]);
});

test("seeds go round the board counter-clockwise, through both stores", () => {
  assertEquals([...SOW_ORDER], [0, 1, 2, 3, 4, 5, 6, M1, 13, 12, 11, 10, 9, 8, 7, M2]);
});

test("you can't play the other side, an empty pit, or after the game", () => {
  const g = newGame(DEFAULT_RULES, P1);
  assert(playTurn(g, 7).invalid);
  assert(playTurn(g, M1).invalid);
  assert(playTurn(position([0, 1, ...new Array(12).fill(1), 0, 0]), 0).invalid);
  assert(playTurn({ ...g, gameOver: true }, 0).invalid);
});

test("playTurn doesn't change the state it's given", () => {
  const g = newGame(DEFAULT_RULES, P1);
  const before = JSON.stringify(g);
  playTurn(g, 3);
  assertEquals(JSON.stringify(g), before);
});

test("seeds are never created or lost", () => {
  let g = newGame(DEFAULT_RULES, P1);
  for (let i = 0; i < 200 && !g.gameOver; i++) {
    const moves = validMoves(g);
    g = played(g, moves[i % moves.length]).state;
    assertEquals(total(g), 98);
  }
});

test("last seed in your own store: a free turn", () => {
  //               0  1  2  3  4  5  6   7  8  9 10 11 12 13  M1 M2
  const s = position([2, 0, 0, 0, 0, 0, 1, 3, 3, 3, 3, 3, 3, 3, 0, 0]);
  const r = played(s, 6);
  assert(r.freeTurn);
  assertEquals(r.state.current, P1);
  assertEquals(r.state.pits[M1], 1);
});

test("sowing skips the opponent's store", () => {
  // Player 2 sows 9 seeds from pit 8: 7, M2, 0..6 — and Player 1's store is never touched.
  const s = position([0, 0, 0, 0, 0, 0, 0, 0, 9, 0, 0, 0, 0, 1, 0, 0], P2);
  const r = played(s, 8);
  assertEquals(r.state.pits[M1], 0);
  assert(r.events.every((e) => e.type !== "drop" || e.pit !== M1));
});

test("last seed in a pit that had seeds: pick them up and keep sowing (relay)", () => {
  // Pit 0's single seed lands in pit 1 (2 seeds), so those 3 are sown on to 2, 3, 4. (Pit 11,
  // opposite pit 4, is empty, so the last seed doesn't capture.)
  const s = position([1, 2, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0, 1, 1, 0, 0]);
  const r = played(s, 0);
  assertEquals(r.relays, 1);
  assertEquals(r.state.pits.slice(0, 5), [0, 0, 1, 1, 1]);
});

test("last seed in your own empty pit captures only the pit opposite", () => {
  // Pit 0's seed lands in empty pit 1; pit 8 faces it with 5 seeds. The 5 are banked, and the
  // seed that landed stays in pit 1.
  const s = position([1, 0, 0, 0, 0, 0, 3, 1, 5, 1, 1, 1, 1, 1, 0, 0]);
  const r = played(s, 0);
  assertEquals(r.captured, 5);
  assertEquals(r.state.pits[M1], 5);
  assertEquals([r.state.pits[1], r.state.pits[8]], [1, 0]);
  assertEquals(r.state.current, P2);
});

test("capture rule: own side by default, either side when the rules say so", () => {
  // Player 2 sows pit 8's three seeds into pit 7, their store, and empty pit 0 on Player 1's side.
  const pits = [0, 1, 1, 1, 1, 1, 1, 9, 3, 1, 1, 1, 1, 1, 0, 0];
  const own = played(position(pits, P2), 8);
  assertEquals(own.captured, 0);
  const any = played(position(pits, P2, { capture: "any" }), 8);
  assertEquals(any.captured, 10); // pit 7's 10 seeds; the one that landed stays in pit 0
  assertEquals(any.state.pits[0], 1);
});

test("an empty side ends the game and each side banks its own seeds", () => {
  const s = position([0, 0, 0, 0, 0, 0, 1, 0, 2, 0, 0, 0, 0, 0, 30, 20]);
  const r = played(s, 6);
  assert(r.gameOver);
  assertEquals([r.state.pits[M1], r.state.pits[M2]], [31, 22]);
  assertEquals(r.winner, P1);
  assertEquals(r.events.at(-1)?.type, "sweep");
});

test("a clinched majority ends the game early, unless the rules turn it off", () => {
  // Player 1 has 49 banked; one more seed makes 50 of 98, a lead that can't be caught.
  const pits = [1, 0, 0, 0, 0, 0, 1, 7, 7, 7, 7, 7, 1, 2, 49, 0];
  assert(played(position(pits), 6).gameOver);
  assert(!played(position(pits, P1, { clinch: false }), 6).gameOver);
});

test("the event log replays to the final position", () => {
  let g = newGame(DEFAULT_RULES, P2);
  for (let turn = 0; turn < 40 && !g.gameOver; turn++) {
    const r = played(g, validMoves(g)[0]);
    const pits = [...g.pits];
    for (const e of r.events) {
      if (e.type === "pickup") pits[e.pit] = 0;
      if (e.type === "drop") pits[e.pit] = e.count;
      if (e.type === "capture") [pits[e.opposite], pits[e.store]] = [0, e.storeCount];
      if (e.type === "sweep") {
        pits.fill(0, 0, 14);
        [pits[M1], pits[M2]] = [e.m1, e.m2];
      }
    }
    assertEquals(pits, r.state.pits);
    g = r.state;
  }
});
