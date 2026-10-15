/**
 * Minimax with alpha-beta pruning and iterative deepening.
 *
 * Unlike the DFS bot, it plans for the opponent's replies: on its own turns it takes the best
 * move, on the opponent's it assumes the opponent will too. Free turns are searched without
 * using up depth, so it sees the same long chains the DFS bot hunts for. It searches one ply
 * deeper at a time until the time budget runs out, and keeps the deepest complete answer.
 *
 * A transposition table remembers positions already searched (the same board is often reached by
 * different move orders, and every deeper pass revisits the last one), so each is searched once
 * per depth, and the best move found for it last time is tried first.
 */
import { playTurn, storeOf, validMoves } from "../../game/engine.ts";
import type { GameState } from "../../game/types.ts";
import { evaluate, WIN } from "./evaluate.ts";

export interface SearchOptions {
  /** Stop after this many milliseconds (keeps the deepest finished search). */
  timeMs?: number;
  /** Search exactly this deep (no time limit). Used by tests and the tournament. */
  depth?: number;
  /** Score every first move exactly (slower), so a caller can choose among near-best moves. */
  scoreAll?: boolean;
  /** How many free turns in a row the search may follow without using up depth (default 12). */
  extensions?: number;
  /**
   * "lose" plays to lose by as much as possible, assuming the opponent plays to win: both sides
   * then want the same thing (the opponent far ahead), so every position takes its best move for
   * that. The worst possible player, for the Pushover bot.
   */
  aim?: "win" | "lose";
}

export interface SearchResult {
  move: number | null;
  /** The position's value for the player to move: store lead, plus a little for seeds on their side. */
  score: number;
  /** Deepest search finished, in plies (single moves). */
  depth: number;
  nodes: number;
  /** With `scoreAll`: each first move's score at the deepest finished search. */
  scores?: Map<number, number>;
}

/** What a remembered value means: exact, or only a bound because the search was cut off early. */
const EXACT = 0, LOWER = 1, UPPER = 2;
interface Entry {
  depth: number;
  value: number;
  flag: number;
  best: number;
}
/** A position's key: its 16 pit counts and whose turn it is, as a short string. */
const keyOf = (s: GameState) => String.fromCharCode(...s.pits, s.current);
const FREE_TURN_EXTENSIONS = 12;
class OutOfTime extends Error {}

export function search(
  root: GameState,
  { timeMs = 700, depth, scoreAll = false, extensions = FREE_TURN_EXTENSIONS, aim = "win" }: SearchOptions = {},
): SearchResult {
  const me = root.current;
  const sign = aim === "lose" ? -1 : 1;
  const value = (s: GameState) => sign * evaluate(s, me);
  const moves = validMoves(root);
  if (moves.length === 0) return { move: null, score: value(root), depth: 0, nodes: 0 };
  if (moves.length === 1) return { move: moves[0], score: value(root), depth: 0, nodes: 1 };

  const deadline = depth === undefined ? performance.now() + timeMs : Infinity;
  const maxDepth = depth ?? 64;
  let nodes = 0;
  const table = new Map<string, Entry>();

  /** Children of a position, best-looking first, which makes alpha-beta prune far more. */
  const children = (s: GameState, hashMove = -1) =>
    validMoves(s)
      .map((move) => {
        const r = playTurn(s, move, { record: false });
        const next = r.state;
        // Last time's best move first, then free turns, then whatever grows the mover's store most.
        const order = (move === hashMove ? 1e6 : 0) + (r.invalid ? -1e9 : 0) + (!r.invalid && r.freeTurn ? 1000 : 0) +
          next.pits[storeOf(s.current)];
        return { move, next, order, free: !r.invalid && r.freeTurn };
      })
      .sort((a, b) => b.order - a.order);

  // A free turn doesn't use up depth (the same player simply moves again), so the search follows
  // chains of free turns, which decide this game, up to FREE_TURN_EXTENSIONS extra plies.
  const alphabeta = (s: GameState, d: number, ext: number, alpha: number, beta: number): number => {
    if (++nodes % 2048 === 0 && performance.now() > deadline) throw new OutOfTime();
    if (d === 0 || s.gameOver) return value(s);

    const key = keyOf(s);
    const hit = table.get(key);
    if (hit && hit.depth >= d) {
      if (hit.flag === EXACT) return hit.value;
      if (hit.flag === LOWER) alpha = Math.max(alpha, hit.value);
      else beta = Math.min(beta, hit.value);
      if (alpha >= beta) return hit.value;
    }

    const [alpha0, beta0] = [alpha, beta];
    const maximising = aim === "lose" || s.current === me;
    let best = maximising ? -Infinity : Infinity;
    let bestMove = -1;
    for (const { move, next, free } of children(s, hit?.best)) {
      const extend = free && ext > 0;
      const v = alphabeta(next, extend ? d : d - 1, extend ? ext - 1 : ext, alpha, beta);
      if (maximising ? v > best : v < best) [best, bestMove] = [v, move];
      if (maximising) alpha = Math.max(alpha, v);
      else beta = Math.min(beta, v);
      if (alpha >= beta) break;
    }
    // Values are always from `me`'s side, so the bounds read the same at every node.
    const flag = best <= alpha0 ? UPPER : best >= beta0 ? LOWER : EXACT;
    table.set(key, { depth: d, value: best, flag, best: bestMove });
    return best;
  };

  let result: SearchResult = { move: moves[0], score: -Infinity, depth: 0, nodes: 0 };
  let order = children(root).map((c) => c.move);
  for (let d = 1; d <= maxDepth; d++) {
    try {
      let bestMove = order[0];
      let bestScore = -Infinity;
      let alpha = -Infinity;
      const scores = new Map<number, number>();
      for (const move of order) {
        const r = playTurn(root, move, { record: false });
        if (r.invalid) continue;
        const extend = r.freeTurn && extensions > 0;
        // scoreAll keeps the window open, so every move gets its true score, not just a bound.
        const v = alphabeta(
          r.state,
          extend ? d : d - 1,
          extensions - (extend ? 1 : 0),
          scoreAll ? -Infinity : alpha,
          Infinity,
        );
        scores.set(move, v);
        if (v > bestScore) [bestMove, bestScore] = [move, v];
        alpha = Math.max(alpha, v);
      }
      result = { move: bestMove, score: bestScore, depth: d, nodes, scores: scoreAll ? scores : undefined };
      // Search the best move first next time round.
      order = [bestMove, ...order.filter((m) => m !== bestMove)];
      // A forced win or loss won't change with more depth.
      if (Math.abs(bestScore) >= WIN) break;
    } catch (e) {
      if (e instanceof OutOfTime) break;
      throw e;
    }
  }
  return { ...result, nodes };
}
