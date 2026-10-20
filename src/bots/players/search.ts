/** Family "search": bots built on the Minimax search (search/minimax.ts), each asking it something different. */
import { validMoves } from "../../game/engine.ts";
import type { GameState } from "../../game/types.ts";
import type { Bot, Evaluator, Rng } from "../contracts.ts";
import { search, type SearchOptions, type SearchResult } from "../search/minimax.ts";
import { WIN } from "../search/evaluate.ts";
import { Boards, playOn } from "../search/moves.ts";

/** How a search bot describes what it saw. */
function describe(r: SearchResult): string | null {
  if (r.depth === 0) return null;
  if (r.score >= WIN) return `sees a forced win`;
  if (r.score <= -WIN) return `sees a forced loss`;
  const lead = Math.round(r.score);
  return `saw ${r.depth} ${r.depth === 1 ? "move" : "moves"} ahead, ${lead > 0 ? "+" : ""}${lead}`;
}

/** Alpha-beta search that plans for the opponent's replies too. See search/minimax.ts. */
export class MinimaxBot implements Bot {
  private last: SearchResult | null = null;
  private opts: { timeMs?: number; depth?: number };
  constructor(opts: { timeMs?: number; depth?: number } = { timeMs: 700 }) {
    this.opts = opts;
  }
  choose(state: GameState): number | null {
    this.last = search(state, this.opts);
    return this.last.move;
  }
  note(): string | null {
    return this.last && describe(this.last);
  }
}

/**
 * A gentler Minimax: it looks only a couple of moves ahead, doesn't follow free-turn chains past
 * them, and picks at random among the moves within `slack` seeds of its best. It plays sensibly
 * but misses the long chains, and its games vary.
 */
export class LookaheadBot implements Bot {
  private last: SearchResult | null = null;
  private depth: number;
  private slack: number;
  private rng: Rng;
  constructor(depth = 2, slack = 3, rng: Rng = Math.random) {
    [this.depth, this.slack, this.rng] = [depth, slack, rng];
  }
  note(): string | null {
    return this.last && describe(this.last);
  }
  choose(state: GameState): number | null {
    const r = this.last = search(state, { depth: this.depth, scoreAll: true, extensions: 0 });
    if (!r.scores || r.scores.size === 0) return r.move;
    const good = [...r.scores].filter(([, v]) => v >= r.score - this.slack).map(([m]) => m);
    return good[Math.floor(this.rng() * good.length)];
  }
}

/**
 * The worst possible player: it searches ahead like Minimax but plays to lose by as much as it can,
 * assuming you play to win. Even a careless opponent ends up winning.
 */
export class PushoverBot implements Bot {
  private depth: number;
  private score: SearchOptions["score"];
  /** `score`: how it judges a position (Minimax's evaluation; the learned losers pass their own). */
  constructor(depth = 3, score?: SearchOptions["score"]) {
    [this.depth, this.score] = [depth, score];
  }
  choose(state: GameState): number | null {
    // Nothing prunes a search where both sides want the same result, so it follows only short
    // free-turn chains (3), which keeps a move under ~0.1 s.
    return search(state, { depth: this.depth, aim: "lose", extensions: 3, score: this.score }).move;
  }
}

/**
 * Two moves deep, by brute force: for each of its moves, the opponent's reply that `evaluate`
 * likes least for it, and it plays the move whose worst case is best. A free turn ends the line
 * (it doesn't look past it), which is where it differs from Lookahead. Planner and Spoiler are
 * this with different scoring.
 */
export class TwoMoveBot implements Bot {
  private evaluate: Evaluator;
  private boards = new Boards();
  constructor(evaluate: Evaluator) {
    this.evaluate = evaluate;
  }
  choose(state: GameState): number | null {
    const me = state.current;
    let best: number | null = null;
    let bestValue = -Infinity;
    const after = this.boards.at(0, state), replied = this.boards.at(1, state);
    for (const move of validMoves(state)) {
      playOn(after, state, move);
      let value = this.evaluate(after, me);
      if (!after.gameOver && after.current !== me) {
        let worst = Infinity;
        for (const reply of validMoves(after)) {
          playOn(replied, after, reply);
          worst = Math.min(worst, this.evaluate(replied, me));
        }
        if (worst < Infinity) value = worst;
      }
      if (value > bestValue) [best, bestValue] = [move, value];
    }
    return best;
  }
}
