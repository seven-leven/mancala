/**
 * How often bots play a perfect move: positions from varied games on the 7-pit board with fewer
 * seeds (where the solver is quick), every legal move's exact value from solver.ts, and each bot's
 * choice checked against them. Ratings say who wins; this says who errs, and by how much.
 *
 *   node harness/accuracy.ts [seeds a pit, default 4] [positions, default 300]
 *
 * Perfect: the bot's move keeps the position's value. Gives up: the seeds of final margin its move
 * loses against perfect play, on average. Positions where a solve takes too long are skipped.
 */
import { createBot } from "../src/bots/bots.ts";
import { MinimaxBot } from "../src/bots/players/search.ts";
import type { Bot } from "../src/bots/contracts.ts";
import { newGame, playTurn, validMoves } from "../src/game/engine.ts";
import { DEFAULT_RULES, type GameState, P1, P2 } from "../src/game/types.ts";
import { seeded } from "./match.ts";
import { type Board, Memo, mtd, OutOfBudget, play, rulesFor, Solver } from "../lab/solve/solver.ts";

const seeds = Number(process.argv[2] ?? 4), wanted = Number(process.argv[3] ?? 300);
const rules = { ...DEFAULT_RULES, seeds };
const solverRules = rulesFor(7, 14 * seeds);
const memo = new Memo(24); // 16 million entries, 128 MB, shared by every position's solve
const rng = seeded(seeds * 1000 + wanted);

/** The exact value of `b` for its mover, or null if it takes more than `budget` positions. */
function exact(b: Board, budget = 3_000_000): number | null {
  const s = new Solver(solverRules, memo, budget);
  const { lo, hi } = mtd(solverRules.total, (beta) => s.test(b, beta));
  return lo === hi ? lo : null;
}

/** Every legal move's exact value for the mover, by pit; null if any solve ran out. */
function moveValues(state: GameState): Map<number, number> | null {
  const mover = state.current === P1 ? 0 : 1;
  const out = new Map<number, number>();
  for (const pit of validMoves(state)) {
    const b: Board = { n: 7, pits: [...state.pits], mover };
    const r = play(b, pit);
    const v = r.over ? b.pits[14 + mover] - b.pits[15 - mover] : exact(b);
    if (v === null) return null;
    out.set(pit, r.over || r.again ? v : -v);
  }
  return out;
}

// Positions: games where each side plays a random move a third of the time and Greedy's
// otherwise, from either seat, sampled after the first few moves; only real choices.
const greedy = createBot("greedy");
const positions: { state: GameState; values: Map<number, number> }[] = [];
const started = performance.now();
while (positions.length < wanted) {
  let s = newGame(rules, rng() < 0.5 ? P1 : P2);
  const stop = 4 + Math.floor(rng() * 30);
  for (let ply = 0; ply < stop && !s.gameOver; ply++) {
    const moves = validMoves(s);
    s = playTurn(s, rng() < 0.33 ? moves[Math.floor(rng() * moves.length)] : greedy.choose(s)!).state;
  }
  if (s.gameOver || validMoves(s).length < 2) continue;
  try {
    const values = moveValues(s);
    if (values && new Set(values.values()).size > 1) positions.push({ state: s, values });
  } catch (e) {
    /* c8 ignore next */
    if (!(e instanceof OutOfBudget)) throw e;
  }
  process.stderr.write(`\r${positions.length} of ${wanted} positions solved`);
}
process.stderr.write(` (${((performance.now() - started) / 1000).toFixed(0)} s)\n`);

const bots: [string, () => Bot][] = [
  ["Greedy", () => createBot("greedy")],
  ["Planner", () => createBot("planner")],
  ["Lookahead (depth 2)", () => createBot("lookahead", { mode: "rate", rng: seeded(1) })],
  ["Shrewd (depth 3)", () => createBot("shrewd", { mode: "rate", rng: seeded(1) })],
  ["DFS v2", () => createBot("dfs2")],
  ["Learned DFS", () => createBot("learned")],
];
for (const depth of [1, 2, 3, 4, 6]) {
  bots.push([`Minimax depth ${depth}`, () => new MinimaxBot({ depth })]);
  for (const q of [2, 8]) bots.push([`  + quiescence ${q}`, () => new MinimaxBot({ depth, quiescence: q })]);
}

console.log(`\n${positions.length} positions on the 7-pit board with ${seeds} seeds a pit\n`);
console.log("| Bot | Perfect | Gives up (seeds) | ms a move |");
console.log("| --- | ---: | ---: | ---: |");
for (const [name, make] of bots) {
  const bot = make();
  let perfect = 0, lost = 0;
  const t = performance.now();
  for (const { state, values } of positions) {
    const best = Math.max(...values.values());
    const v = values.get(bot.choose(state)!)!;
    if (v === best) perfect++;
    lost += best - v;
  }
  const ms = (performance.now() - t) / positions.length;
  console.log(
    `| ${name} | ${((100 * perfect) / positions.length).toFixed(1)}% | ${(lost / positions.length).toFixed(2)} | ${
      ms.toFixed(2)
    } |`,
  );
}
