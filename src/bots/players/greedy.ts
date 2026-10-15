/** One-move bots: they play each pit, look at the store, and stop there. */
import { playTurn, score, validMoves } from "../../game/engine.ts";
import type { GameState } from "../../game/types.ts";
import type { Bot, Rng } from "../bot.ts";

/** One move deep: the pit that banks the most seeds right now, captures and free turns included. */
export class GreedyBot implements Bot {
  choose(state: GameState): number | null {
    const me = state.current;
    let best: number | null = null;
    let bestScore = -Infinity;
    for (const move of validMoves(state)) {
      const r = playTurn(state, move, { record: false });
      if (r.invalid) continue;
      const s = score(r.state, me);
      if (s > bestScore) [best, bestScore] = [move, s];
    }
    return best;
  }
}

/**
 * Greedy's opposite: the pit that banks the fewest seeds this turn, so it turns down free turns
 * and captures. The gentlest opponent, for learning the rules.
 */
export class GenerousBot implements Bot {
  constructor(private rng: Rng = Math.random) {}
  choose(state: GameState): number | null {
    const me = state.current;
    let worst: number[] = [];
    let worstScore = Infinity;
    for (const move of validMoves(state)) {
      const r = playTurn(state, move, { record: false });
      if (r.invalid) continue;
      const s = score(r.state, me);
      if (s < worstScore) [worst, worstScore] = [[move], s];
      else if (s === worstScore) worst.push(move);
    }
    // Several moves often bank nothing; pick among them so its games vary.
    return worst.length ? worst[Math.floor(this.rng() * worst.length)] : null;
  }
}
