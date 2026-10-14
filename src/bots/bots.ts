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

export const BOTS = {
  random: { label: "Random", level: "Easy", blurb: "Plays any legal pit.", create: () => new RandomBot() },
  greedy: {
    label: "Greedy",
    level: "Medium",
    blurb: "Takes whatever banks the most seeds this turn.",
    create: () => new GreedyBot(),
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
