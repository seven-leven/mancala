/**
 * Minimax with alpha-beta pruning and iterative deepening.
 *
 * Unlike the DFS bot, it plans for the opponent's replies: on its own turns it takes the best
 * move, on the opponent's it assumes the opponent will too. Free turns are searched without
 * using up depth, so it sees the same long chains the DFS bot hunts for. It searches one ply
 * deeper at a time until the time budget runs out, and keeps the deepest complete answer.
 */
import { other, pitsOf, playTurn, score, storeOf, validMoves } from "../game/engine.ts";
import type { GameState, Player } from "../game/types.ts";

export interface SearchOptions {
  /** Stop after this many milliseconds (keeps the deepest finished search). */
  timeMs?: number;
  /** Search exactly this deep (no time limit). Used by tests and the tournament. */
  depth?: number;
}

export interface SearchResult {
  move: number | null;
  /** The position's value for the player to move: store lead, plus a little for seeds on their side. */
  score: number;
  /** Deepest search finished, in plies (single moves). */
  depth: number;
  nodes: number;
}

const WIN = 10_000;
const FREE_TURN_EXTENSIONS = 12;
class OutOfTime extends Error {}

/** How good `s` looks for `me`. */
function evaluate(s: GameState, me: Player): number {
  const lead = score(s, me) - score(s, other(me));
  if (s.gameOver) return lead > 0 ? WIN + lead : lead < 0 ? -WIN + lead : 0;
  // Seeds still on your side are yours if the game ends now, so they count for a little.
  const side = (p: Player) => pitsOf(p).reduce((n, i) => n + s.pits[i], 0);
  return lead + 0.25 * (side(me) - side(other(me)));
}

export function search(root: GameState, { timeMs = 700, depth }: SearchOptions = {}): SearchResult {
  const me = root.current;
  const moves = validMoves(root);
  if (moves.length === 0) return { move: null, score: evaluate(root, me), depth: 0, nodes: 0 };
  if (moves.length === 1) return { move: moves[0], score: evaluate(root, me), depth: 0, nodes: 1 };

  const deadline = depth === undefined ? performance.now() + timeMs : Infinity;
  const maxDepth = depth ?? 64;
  let nodes = 0;

  /** Children of a position, best-looking first, which makes alpha-beta prune far more. */
  const children = (s: GameState) =>
    validMoves(s)
      .map((move) => {
        const r = playTurn(s, move, { record: false });
        const next = r.state;
        // Free turns first, then whatever grows the mover's store most.
        const order = (r.invalid ? -1e9 : 0) + (!r.invalid && r.freeTurn ? 1000 : 0) + next.pits[storeOf(s.current)];
        return { move, next, order, free: !r.invalid && r.freeTurn };
      })
      .sort((a, b) => b.order - a.order);

  // A free turn doesn't use up depth (the same player simply moves again), so the search follows
  // chains of free turns, which decide this game, up to FREE_TURN_EXTENSIONS extra plies.
  const alphabeta = (s: GameState, d: number, ext: number, alpha: number, beta: number): number => {
    if (++nodes % 2048 === 0 && performance.now() > deadline) throw new OutOfTime();
    if (d === 0 || s.gameOver) return evaluate(s, me);
    const maximising = s.current === me;
    let best = maximising ? -Infinity : Infinity;
    for (const { next, free } of children(s)) {
      const extend = free && ext > 0;
      const v = alphabeta(next, extend ? d : d - 1, extend ? ext - 1 : ext, alpha, beta);
      if (maximising) {
        best = Math.max(best, v);
        alpha = Math.max(alpha, v);
      } else {
        best = Math.min(best, v);
        beta = Math.min(beta, v);
      }
      if (alpha >= beta) break;
    }
    return best;
  };

  let result: SearchResult = { move: moves[0], score: -Infinity, depth: 0, nodes: 0 };
  let order = children(root).map((c) => c.move);
  for (let d = 1; d <= maxDepth; d++) {
    try {
      let bestMove = order[0];
      let bestScore = -Infinity;
      let alpha = -Infinity;
      for (const move of order) {
        const r = playTurn(root, move, { record: false });
        if (r.invalid) continue;
        const extend = r.freeTurn;
        const v = alphabeta(r.state, extend ? d : d - 1, FREE_TURN_EXTENSIONS - (extend ? 1 : 0), alpha, Infinity);
        if (v > bestScore) [bestMove, bestScore] = [move, v];
        alpha = Math.max(alpha, v);
      }
      result = { move: bestMove, score: bestScore, depth: d, nodes };
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
