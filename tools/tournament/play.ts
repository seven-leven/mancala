/**
 * One pairing's matched pair: two games from one opening, each bot in each seat. Self-contained,
 * with its own seed, so it plays the same games whichever worker runs it, and in whatever order.
 */
import { type Bot, type BotId, createBot, type DormantId } from "../../src/bots/bots.ts";
import { playTurn } from "../../src/game/engine.ts";
import { formatGame } from "../../src/game/notation.ts";
import { type GameState, P1, P2, type Player } from "../../src/game/types.ts";
import { seeded } from "../match.ts";
import { type Opening, opening } from "./openings.ts";

export interface PairJob {
  round: number;
  i: number;
  j: number;
  /** Bot i and bot j. */
  a: BotId | DormantId;
  b: BotId | DormantId;
  opening: Opening;
  /** Return both games in MGN too. */
  record: boolean;
}

export interface PairResult {
  i: number;
  j: number;
  /** Bot i's result in each game (1 a win, ½ a draw, 0 a loss), legs in order. */
  results: [number, number];
  firstWon: number;
  decided: number;
  games: string[];
}

/** Each pairing's seed, from the round and the two bots: the same however the work is split up. */
export const pairSeed = (round: number, i: number, j: number) => 711_000_000 + round * 4096 + i * 64 + j;

/** One game from `start`, `a` on Player 1's side and `b` on Player 2's: the winner (null for a draw) and the moves. */
export function game(a: Bot, b: Bot, start: GameState): { winner: Player | null; moves: number[] } {
  let g = start;
  const moves: number[] = [];
  for (let ply = 0; !g.gameOver && ply < 1000; ply++) {
    const move = (g.current === P1 ? a : b).choose(g);
    if (move === null) break;
    const r = playTurn(g, move, { record: false });
    if (r.invalid) throw new Error("illegal move");
    moves.push(move);
    g = r.state;
  }
  const [x, y] = [g.pits[14], g.pits[15]];
  return { winner: x === y ? null : x > y ? P1 : P2, moves };
}

export function playPair(job: PairJob): PairResult {
  const rng = seeded(pairSeed(job.round, job.i, job.j));
  const bots = [createBot(job.a, { rng, mode: "rate" }), createBot(job.b, { rng, mode: "rate" })];
  // Alternate who moves first from round to round; within a pair, the seats swap.
  const first = job.round % 2 ? P2 : P1;
  const start = opening(job.opening, first, rng);
  const results: number[] = [], games: string[] = [];
  let firstWon = 0, decided = 0;
  for (const [p1, p2] of [[0, 1], [1, 0]]) {
    const { winner, moves } = game(bots[p1], bots[p2], start.state);
    if (job.record) {
      const id = (k: number) => (k === 0 ? job.a : job.b);
      games.push(formatGame({
        tags: { Event: "Tournament", Opening: job.opening, Round: String(job.round + 1), P1: id(p1), P2: id(p2) },
        rules: start.state.rules,
        first,
        layout: start.layout,
        moves: [...start.moves, ...moves],
      }));
    }
    results.push(winner === null ? 0.5 : (winner === P1 ? p1 : p2) === 0 ? 1 : 0);
    if (winner !== null) {
      decided++;
      if (winner === first) firstWon++;
    }
  }
  return { i: job.i, j: job.j, results: [results[0], results[1]], firstWon, decided, games };
}
