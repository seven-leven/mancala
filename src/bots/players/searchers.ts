/** Bots built on the Minimax search (search/minimax.ts), each asking it something different. */
import type { GameState } from "../../game/types.ts";
import { type Bot, describe, type Rng } from "../bot.ts";
import { search, type SearchResult } from "../search/minimax.ts";

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
