/**
 * How often bots play a perfect move: positions from varied games on the 7-pit board (with fewer
 * seeds, where the solver is quicker), every legal move's exact value from lab/solve/solver.ts,
 * and each bot's choice checked against them. Ratings say who wins; this says who errs, and by how
 * much. Solved positions are kept in data/accuracy/, so a second run (or npm run eval) is quick.
 *
 *   npm run accuracy -- [seeds a pit, default 7] [positions, default 200]
 *
 * Perfect: the bot's move keeps the position's value. Gives up: the seeds of final margin its move
 * loses against perfect play, on average. Positions whose solve takes too long are skipped, so
 * the set leans towards the middle and end of games.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createBot } from "../src/bots/bots.ts";
import type { Bot } from "../src/bots/contracts.ts";
import { MinimaxBot } from "../src/bots/players/search.ts";
import { newGame, playTurn, validMoves } from "../src/game/engine.ts";
import { DEFAULT_RULES, type GameState, P1, P2 } from "../src/game/types.ts";
import { seeded } from "./match.ts";
import { type Board, Memo, mtd, OutOfBudget, play, rulesFor, Solver } from "../lab/solve/solver.ts";

/** A position, and every legal move's exact final margin for the side to move, by pit. */
export interface Solved {
  state: GameState;
  values: Map<number, number>;
}

/** `count` solved positions with `seeds` a pit: from data/accuracy/ if solved before, else solved now. */
export function solvedPositions(seeds: number, count: number, log = (_: string) => {}): Solved[] {
  const file = `data/accuracy/${seeds}-${count}.json`;
  const rules = { ...DEFAULT_RULES, seeds };
  if (existsSync(file)) {
    const rows: { pits: number[]; current: 1 | 2; values: [number, number][] }[] = JSON.parse(
      readFileSync(file, "utf8"),
    );
    return rows.map((r) => ({
      state: { rules, pits: r.pits, current: r.current, gameOver: false },
      values: new Map(r.values),
    }));
  }
  const solverRules = rulesFor(7, 14 * seeds);
  const memo = new Memo(24); // 16 million entries, 128 MB, shared by every position's solve
  const exact = (b: Board) => {
    const s = new Solver(solverRules, memo, 3_000_000);
    const { lo, hi } = mtd(solverRules.total, (beta) => s.test(b, beta));
    return lo === hi ? lo : null;
  };
  const moveValues = (state: GameState) => {
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
  };
  // Games where each side plays a random move a third of the time and Greedy's otherwise, from
  // either seat, sampled after the first few moves; only real choices.
  const rng = seeded(seeds * 1000 + count), greedy = createBot("greedy");
  const out: Solved[] = [];
  while (out.length < count) {
    let s = newGame(rules, rng() < 0.5 ? P1 : P2);
    const stop = 4 + Math.floor(rng() * 30);
    for (let ply = 0; ply < stop && !s.gameOver; ply++) {
      const moves = validMoves(s);
      s = playTurn(s, rng() < 0.33 ? moves[Math.floor(rng() * moves.length)] : greedy.choose(s)!).state;
    }
    if (s.gameOver || validMoves(s).length < 2) continue;
    try {
      const values = moveValues(s);
      if (values && new Set(values.values()).size > 1) out.push({ state: s, values });
    } catch (e) {
      if (!(e instanceof OutOfBudget)) throw e;
    }
    log(`${out.length} of ${count} positions solved`);
  }
  mkdirSync("data/accuracy", { recursive: true });
  const rows = out.map(({ state, values }) => ({ pits: state.pits, current: state.current, values: [...values] }));
  writeFileSync(file, JSON.stringify(rows));
  return out;
}

/** How `bot` does on the positions: the share of perfect moves, seeds given up a move, and ms a move. */
export function score(bot: Bot, positions: Solved[]): { perfect: number; givesUp: number; ms: number } {
  let perfect = 0, lost = 0;
  const t = performance.now();
  for (const { state, values } of positions) {
    const best = Math.max(...values.values());
    const v = values.get(bot.choose(state)!)!;
    if (v === best) perfect++;
    lost += best - v;
  }
  const n = positions.length;
  return { perfect: perfect / n, givesUp: lost / n, ms: (performance.now() - t) / n };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const seeds = Number(process.argv[2] ?? 7), count = Number(process.argv[3] ?? 200);
  const positions = solvedPositions(seeds, count, (s) => process.stderr.write(`\r${s}`));
  process.stderr.write("\n");
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
    const r = score(make(), positions);
    console.log(`| ${name} | ${(100 * r.perfect).toFixed(1)}% | ${r.givesUp.toFixed(2)} | ${r.ms.toFixed(2)} |`);
  }
}
