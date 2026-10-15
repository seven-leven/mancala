/**
 * The bots. Each one is stateless and plays for whoever's turn it is (`state.current`), so any
 * bot can sit on either side. To add one, write a `choose` and register it in BOTS below: the
 * menus fill themselves from that list.
 */
import { playTurn, score, validMoves } from "../game/engine.ts";
import type { GameState } from "../game/types.ts";
import { search } from "./minimax.ts";

export interface Bot {
  /** The pit to play, or null if there's no legal move. */
  choose(state: GameState): number | null;
}

type Rng = () => number;

/** Plays any legal pit. */
export class RandomBot implements Bot {
  constructor(private rng: Rng = Math.random) {}
  choose(state: GameState): number | null {
    const moves = validMoves(state);
    return moves.length ? moves[Math.floor(this.rng() * moves.length)] : null;
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

/** Alpha-beta search that plans for the opponent's replies too. See minimax.ts. */
export class MinimaxBot implements Bot {
  constructor(private opts: { timeMs?: number; depth?: number } = { timeMs: 700 }) {}
  choose(state: GameState): number | null {
    return search(state, this.opts).move;
  }
}

/**
 * A gentler Minimax: it looks only a couple of moves ahead, doesn't follow free-turn chains past
 * them, and picks at random among the moves within `slack` seeds of its best. It plays sensibly
 * but misses the long chains, and its games vary.
 */
export class LookaheadBot implements Bot {
  constructor(private depth = 2, private slack = 3, private rng: Rng = Math.random) {}
  choose(state: GameState): number | null {
    const r = search(state, { depth: this.depth, scoreAll: true, extensions: 0 });
    if (!r.scores || r.scores.size === 0) return r.move;
    const good = [...r.scores].filter(([, v]) => v >= r.score - this.slack).map(([m]) => m);
    return good[Math.floor(this.rng() * good.length)];
  }
}

/**
 * The bots, weakest first; the menus list them in this order. Levels follow the Elo ratings from
 * `deno task tournament` (see the README).
 */
export const BOTS = {
  pushover: {
    label: "Pushover",
    level: "Worst possible",
    blurb: "Searches ahead like Minimax, but to lose by as much as it can.",
    create: () => new PushoverBot(4),
  },
  generous: {
    label: "Generous",
    level: "Beginner",
    blurb: "Greedy's opposite: banks as little as it can, turning down free turns and captures.",
    create: () => new GenerousBot(),
  },
  random: { label: "Random", level: "Novice", blurb: "Plays any legal pit.", create: () => new RandomBot() },
  first: {
    label: "First",
    level: "Novice",
    blurb: "Always plays its first pit with seeds, from its own left.",
    create: () => new FirstBot(),
  },
  greedy: {
    label: "Greedy",
    level: "Easy",
    blurb: "Takes whatever banks the most seeds this turn.",
    create: () => new GreedyBot(),
  },
  lookahead: {
    label: "Lookahead",
    level: "Medium",
    blurb: "Looks two moves ahead and plays one of its better moves, not always the best.",
    create: () => new LookaheadBot(2, 3),
  },
  dfs: {
    label: "DFS",
    level: "Hard",
    blurb: "Chains free turns as far as they go. The original 2024 bot.",
    create: () => new DfsBot(8),
  },
  minimax: {
    label: "Minimax",
    level: "Expert",
    blurb: "Searches ahead with alpha-beta pruning, planning for your replies too.",
    create: (timeMs?: number) => new MinimaxBot({ timeMs: timeMs ?? 700 }),
  },
} as const;

export type BotId = keyof typeof BOTS;
/** Who sits on a side: a person, or one of the bots. */
export type Seat = "human" | BotId;

export const isBotId = (x: unknown): x is BotId => typeof x === "string" && x in BOTS;
export const createBot = (id: BotId, timeMs?: number): Bot =>
  id === "minimax" ? BOTS.minimax.create(timeMs) : BOTS[id].create();
