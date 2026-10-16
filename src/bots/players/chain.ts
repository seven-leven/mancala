/** Family "chain": follow your own free turns as far as they go, and never look at the replies. */
import { playTurn, score, validMoves } from "../../game/engine.ts";
import type { GameState } from "../../game/types.ts";
import type { Bot } from "../contracts.ts";

/**
 * Depth-first search through its own free-turn chains, up to `maxDepth` moves in a row, keeping the
 * chain that ends with the fullest store. With the full depth (8) it's the 2024 bot, DFS: it strings
 * free turns together brilliantly and walks into captures. With a short one it's Chainer, which
 * takes a free turn or two and then stops looking.
 */
export class DfsBot implements Bot {
  private maxDepth: number;
  constructor(maxDepth = 8) {
    this.maxDepth = maxDepth;
  }

  choose(state: GameState): number | null {
    const me = state.current;
    let best: number | null = null;
    let bestScore = -Infinity;
    for (const move of validMoves(state)) {
      const s = this.chain(state, move, 0, me);
      if (s > bestScore) [best, bestScore] = [move, s];
    }
    return best;
  }

  private chain(state: GameState, move: number, depth: number, me: GameState["current"]): number {
    const r = playTurn(state, move, { record: false });
    if (r.invalid) return -Infinity;
    if (!r.freeTurn || depth + 1 >= this.maxDepth) return score(r.state, me);
    let best = score(r.state, me);
    for (const next of validMoves(r.state)) best = Math.max(best, this.chain(r.state, next, depth + 1, me));
    return best;
  }
}
