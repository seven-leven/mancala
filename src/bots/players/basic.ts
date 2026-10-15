/** Bots that don't look at what a move does. */
import { validMoves } from "../../game/engine.ts";
import type { GameState } from "../../game/types.ts";
import type { Bot, Rng } from "../bot.ts";

/** Plays any legal pit. */
export class RandomBot implements Bot {
  constructor(private rng: Rng = Math.random) {}
  choose(state: GameState): number | null {
    const moves = validMoves(state);
    return moves.length ? moves[Math.floor(this.rng() * moves.length)] : null;
  }
}

/**
 * Always plays its first pit that has seeds, counted from its own left: the leftmost pit on screen
 * for Player 1, the rightmost for Player 2 (who sits across the board). No thought at all, though
 * pit 1 happens to be the best opening move.
 */
export class FirstBot implements Bot {
  choose(state: GameState): number | null {
    const moves = validMoves(state);
    if (!moves.length) return null;
    // Player 1's pits run 0..6 from their left; Player 2's run 13..7 from theirs.
    return state.current === 1 ? Math.min(...moves) : Math.max(...moves);
  }
}
