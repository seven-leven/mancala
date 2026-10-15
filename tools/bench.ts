/**
 * How deep and how fast Minimax searches: 30 mid-game positions (seeded, so runs compare),
 * each searched for a fixed time. Use it before and after changing src/bots/search/.
 *
 *   deno task bench [ms per position, default 300]
 */
import { search } from "../src/bots/search/minimax.ts";
import { newGame, playTurn, validMoves } from "../src/game/engine.ts";
import { DEFAULT_RULES, type GameState, P1, P2 } from "../src/game/types.ts";
import { seeded } from "./match.ts";

const MS = Number(Deno.args[0] ?? 300);
const rng = seeded(2024);
const WIN = 10_000;

// Positions 2–6 random moves into a game that's still going.
const positions: GameState[] = [];
while (positions.length < 30) {
  let g = newGame(DEFAULT_RULES, positions.length % 2 ? P1 : P2);
  const plies = 2 + Math.floor(rng() * 5);
  for (let i = 0; i < plies && !g.gameOver; i++) {
    const moves = validMoves(g);
    g = playTurn(g, moves[Math.floor(rng() * moves.length)], { record: false }).state;
  }
  if (!g.gameOver && validMoves(g).length > 1) positions.push(g);
}

// Most positions get solved outright (a forced win or loss found), which says little about speed;
// the unsolved ones show how deep the search gets in the time.
let nodes = 0, time = 0;
const unsolvedDepths: number[] = [];
let solved = 0;
for (const p of positions) {
  const t = performance.now();
  const r = search(p, { timeMs: MS });
  time += performance.now() - t;
  nodes += r.nodes;
  if (Math.abs(r.score) >= WIN) solved++;
  else unsolvedDepths.push(r.depth);
}
const mean = unsolvedDepths.reduce((a, b) => a + b, 0) / Math.max(1, unsolvedDepths.length);
console.log(
  `${positions.length} positions, ${MS} ms each: solved ${solved}; the other ${unsolvedDepths.length} reached depth ` +
    `${mean.toFixed(1)} on average. ${Math.round(nodes / time)}k nodes/s.`,
);
