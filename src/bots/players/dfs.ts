import { playTurn, score, validMoves } from "../../game/engine.ts";
import type { GameState } from "../../game/types.ts";
import type { Bot } from "../bot.ts";

/**
 * The 2024 bot: depth-first search through its own free-turn chains, keeping the chain that ends
 * with the fullest store. It never looks at the opponent's replies, so it strings free turns
 * together brilliantly and walks into captures.
 */
export class DfsBot implements Bot {
  constructor(private maxDepth = 8) {}

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
