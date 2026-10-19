/** Family "chain": follow your own free turns as far as they go, and never look at the replies. */
import { FREE_TURN, score, validMoves } from "../../game/engine.ts";
import type { GameState } from "../../game/types.ts";
import type { Bot } from "../contracts.ts";
import { Boards, playOn } from "../search/moves.ts";

/**
 * Depth-first search through its own free-turn chains, up to `maxDepth` moves in a row, keeping the
 * chain that ends with the fullest store. With the full depth (8) it's the 2024 bot, DFS: it strings
 * free turns together brilliantly and walks into captures. With a short one it's Chainer, which
 * takes a free turn or two and then stops looking.
 */
export class DfsBot implements Bot {
  private maxDepth: number;
  private boards = new Boards();
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
    // One board per depth: a chain's deeper moves never touch the boards above them.
    const after = this.boards.at(depth, state);
    const flags = playOn(after, state, move);
    if (!(flags & FREE_TURN) || depth + 1 >= this.maxDepth) return score(after, me);
    let best = score(after, me);
    for (const next of validMoves(after)) best = Math.max(best, this.chain(after, next, depth + 1, me));
    return best;
  }
}
