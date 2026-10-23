/**
 * The engine's invariants, over thousands of random games (seeded, so a failure repeats): random
 * house rules, random openings, random moves. After every turn: no seed is created or lost, the
 * input is never changed, and the event log replays to the new position; and every game ends.
 */
import { test } from "node:test";
import { assert, assertEquals } from "./assert.ts";
import { newGame, playTurn, totalSeeds, validMoves } from "../src/game/engine.ts";
import { type GameState, M1, M2, P1, P2, type Rules, type TurnEvent } from "../src/game/types.ts";
import { seeded } from "../harness/match.ts";
import { symmetricLayout } from "../harness/rate/openings.ts";

const GAMES = 3000;
const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

/** Applies an event log to a copy of `pits`: what the animation does, so it must land where the engine did. */
function replay(pits: readonly number[], events: TurnEvent[]): number[] {
  const p = [...pits];
  for (const e of events) {
    if (e.type === "pickup") p[e.pit] = 0;
    else if (e.type === "drop") p[e.pit] = e.count;
    else if (e.type === "capture") [p[e.opposite], p[e.store]] = [0, e.storeCount];
    else {
      for (let i = 0; i <= 13; i++) p[i] = 0;
      [p[M1], p[M2]] = [e.m1, e.m2];
    }
  }
  return p;
}

test(`engine invariants hold over ${GAMES} random games`, () => {
  const rng = seeded(2026);
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(rng() * xs.length)];
  let turns = 0;
  for (let k = 0; k < GAMES; k++) {
    const rules: Rules = { seeds: 3 + Math.floor(rng() * 13), capture: pick(["own", "any"]), clinch: rng() < 0.5 };
    const first = pick([P1, P2]);
    // Half the games start from a symmetric random board (7 seeds a pit on average), half from the standard one.
    const layout = rules.seeds === 7 && rng() < 0.5 ? symmetricLayout(rng) : undefined;
    let g: GameState = newGame(rules, first, layout);
    const total = totalSeeds(rules);
    let ply = 0;
    for (; !g.gameOver; ply++) {
      assert(ply < 1000, `game ${k} didn't end in 1000 moves`);
      const before = JSON.stringify(g);
      const r = playTurn(g, pick(validMoves(g)));
      assert(!r.invalid, `game ${k}, move ${ply}: a legal move was refused`);
      assertEquals(JSON.stringify(g), before, `game ${k}, move ${ply}: playTurn changed its input`);
      assertEquals(sum(r.state.pits), total, `game ${k}, move ${ply}: seeds created or lost`);
      assertEquals(replay(g.pits, r.events), r.state.pits, `game ${k}, move ${ply}: the event log doesn't replay`);
      assert(r.state.pits.every((n) => n >= 0 && Number.isInteger(n)), `game ${k}, move ${ply}: a bad count`);
      g = r.state;
      turns++;
    }
    // At the end every seed is in a store.
    assertEquals(g.pits[M1] + g.pits[M2], total, `game ${k}: seeds left on the board at the end`);
  }
  assert(turns > GAMES * 10, `only ${turns} turns: the games are suspiciously short`);
});
