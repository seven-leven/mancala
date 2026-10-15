/** Family "search": bots built on the Minimax search (search/minimax.ts), each asking it something different. */
import { playTurn, validMoves } from "../../game/engine.ts";
import type { GameState } from "../../game/types.ts";
import type { Bot, Evaluator, Rng } from "../contracts.ts";
import { search, type SearchResult } from "../search/minimax.ts";
import { WIN } from "../search/evaluate.ts";

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
  constructor(private opts: { timeMs?: number; depth?: number } = { timeMs: 700 }) {}
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
  constructor(private depth = 2, private slack = 3, private rng: Rng = Math.random) {}
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
  constructor(private depth = 4) {}
  choose(state: GameState): number | null {
    // Nothing prunes a search where both sides want the same result, so it follows only short
    // free-turn chains (3), which keeps a move under ~0.1 s.
    return search(state, { depth: this.depth, aim: "lose", extensions: 3 }).move;
  }
}

/**
 * Two moves deep, by brute force: for each of its moves, the opponent's reply that `evaluate`
 * likes least for it, and it plays the move whose worst case is best. A free turn ends the line
 * (it doesn't look past it), which is where it differs from Lookahead. Planner and Spoiler are
 * this with different scoring.
 */
export class TwoMoveBot implements Bot {
  constructor(private evaluate: Evaluator) {}
  choose(state: GameState): number | null {
    const me = state.current;
    let best: number | null = null;
    let bestValue = -Infinity;
    for (const move of validMoves(state)) {
      const r = playTurn(state, move, { record: false });
      if (r.invalid) continue;
      let value = this.evaluate(r.state, me);
      if (!r.state.gameOver && r.state.current !== me) {
        let worst = Infinity;
        for (const reply of validMoves(r.state)) {
          const rr = playTurn(r.state, reply, { record: false });
          if (!rr.invalid) worst = Math.min(worst, this.evaluate(rr.state, me));
        }
        if (worst < Infinity) value = worst;
      }
      if (value > bestValue) [best, bestValue] = [move, value];
    }
    return best;
  }
}
