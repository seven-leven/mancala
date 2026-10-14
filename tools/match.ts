/** Bot-against-bot games, for the tests and the tournament. */
import type { Bot } from "../src/bots/bots.ts";
import { newGame, playTurn } from "../src/game/engine.ts";
import { DEFAULT_RULES, type GameState, P1, type Player, type Rules } from "../src/game/types.ts";

/** Deterministic random numbers (mulberry32), so results can be repeated. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Plays one game: `p1` sits on Player 1's side, `p2` on Player 2's. */
export function playMatch(p1: Bot, p2: Bot, first: Player, rules: Rules = DEFAULT_RULES) {
  let g: GameState = newGame(rules, first);
  let moves = 0;
  while (!g.gameOver && moves < 1000) {
    const move = (g.current === P1 ? p1 : p2).choose(g);
    if (move === null) break;
    const r = playTurn(g, move, { record: false });
    if (r.invalid) throw new Error(`illegal move ${move}`);
    g = r.state;
    moves++;
  }
  const [a, b] = [g.pits[14], g.pits[15]];
  return { winner: a === b ? null : a > b ? P1 : P1 + 1 as Player, score: [a, b] as const, moves };
}
