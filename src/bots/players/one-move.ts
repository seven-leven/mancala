/** Family "one-move": play each pit once, score the position after it, and stop there. */
import { playTurn, validMoves } from "../../game/engine.ts";
import type { GameState } from "../../game/types.ts";
import type { Bot, Evaluator, Rng } from "../contracts.ts";
import { banked, exposed } from "../search/evaluate.ts";

export interface OneMoveOptions {
  /** Play the move that scores best (the default), or the worst. */
  aim?: "best" | "worst";
  /** Among equal moves: the first one found (the default), or one at random. */
  ties?: "first" | "random";
}

/** The pit whose resulting position `evaluate` likes best (or least). */
export class OneMoveBot implements Bot {
  constructor(private evaluate: Evaluator, private opts: OneMoveOptions = {}, private rng: Rng = Math.random) {}
  choose(state: GameState): number | null {
    const me = state.current;
    const sign = this.opts.aim === "worst" ? -1 : 1;
    let best: number[] = [];
    let bestScore = -Infinity;
    for (const move of validMoves(state)) {
      const r = playTurn(state, move, { record: false });
      if (r.invalid) continue;
      const s = sign * this.evaluate(r.state, me);
      if (s > bestScore) [best, bestScore] = [[move], s];
      else if (s === bestScore) best.push(move);
    }
    if (!best.length) return null;
    return this.opts.ties === "random" ? best[Math.floor(this.rng() * best.length)] : best[0];
  }
}

/** One move deep: the pit that banks the most seeds right now, captures and free turns included. */
export class GreedyBot extends OneMoveBot {
  constructor() {
    super(banked);
  }
}

/**
 * Greedy's opposite: the pit that banks the fewest seeds this turn, so it turns down free turns
 * and captures. The gentlest opponent, for learning the rules. Several moves often bank nothing;
 * it picks among them so its games vary.
 */
export class GenerousBot extends OneMoveBot {
  constructor(rng: Rng = Math.random) {
    super(banked, { aim: "worst", ties: "random" }, rng);
  }
}

/**
 * Greedy with a sense of danger: what it banks, less `caution` for every seed it leaves in a pit
 * the opponent could capture. It gives up a seed now to keep a loaded pit safe.
 */
export class TurtleBot extends OneMoveBot {
  constructor(caution = 0.5, rng: Rng = Math.random) {
    super((s, me) => banked(s, me) - caution * exposed(s, me), { ties: "random" }, rng);
  }
}
