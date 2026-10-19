/** Family "one-move": play each pit once, score the position after it, and stop there. */
import { validMoves } from "../../game/engine.ts";
import type { GameState } from "../../game/types.ts";
import type { Bot, Evaluator, Rng } from "../contracts.ts";
import { banked, exposed, onSide, threats } from "../search/evaluate.ts";
import { Boards, playOn } from "../search/moves.ts";

export interface OneMoveOptions {
  /** Play the move that scores best (the default), or the worst. */
  aim?: "best" | "worst";
  /** Among equal moves: the first one found (the default), or one at random. */
  ties?: "first" | "random";
}

/** The pit whose resulting position `evaluate` likes best (or least). */
export class OneMoveBot implements Bot {
  private evaluate: Evaluator;
  private opts: OneMoveOptions;
  private rng: Rng;
  private boards = new Boards();
  constructor(evaluate: Evaluator, opts: OneMoveOptions = {}, rng: Rng = Math.random) {
    [this.evaluate, this.opts, this.rng] = [evaluate, opts, rng];
  }
  choose(state: GameState): number | null {
    const me = state.current;
    const sign = this.opts.aim === "worst" ? -1 : 1;
    let best: number[] = [];
    let bestScore = -Infinity;
    const after = this.boards.at(0, state);
    for (const move of validMoves(state)) {
      playOn(after, state, move);
      const s = sign * this.evaluate(after, me);
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

/**
 * Keeps its seeds at home: the move that leaves the most seeds on its own side, plus `thrift` for
 * each seed it banks. It rarely gives seeds away, but it rarely takes any either.
 */
export class HoarderBot extends OneMoveBot {
  constructor(thrift = 0.3, rng: Rng = Math.random) {
    super((s, me) => onSide(s, me) + thrift * banked(s, me), { ties: "random" }, rng);
  }
}

/**
 * Banks what it can and lines up captures: `aggression` for every seed sitting in a pit that faces
 * one of its empty pits, ready to be taken next turn.
 */
export class StrikerBot extends OneMoveBot {
  constructor(aggression = 0.5, rng: Rng = Math.random) {
    super((s, me) => banked(s, me) + aggression * threats(s, me), { ties: "random" }, rng);
  }
}
