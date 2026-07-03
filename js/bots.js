import { getValidMoves, playTurn, storeOf } from "./logic.js";

/**
 * Bot interface
 * -------------
 * Every bot exposes:
 *   - thinkDelay {number}  ms to pause before moving, so the move is watchable.
 *   - choose(state) -> number|null  the pit index to play, or null if stuck.
 *
 * Bots are stateless and player-agnostic: they always play for `state.current`,
 * so the same class can drive either side. To add a bot, implement `choose`
 * and register it in BOT_REGISTRY below — the UI dropdown fills itself from
 * that registry, so nothing else needs to change.
 */

/** Plays a uniformly random legal move. */
export class RandomBot {
  thinkDelay = 500;

  choose(state) {
    const moves = getValidMoves(state, state.current);
    return moves.length
      ? moves[Math.floor(Math.random() * moves.length)]
      : null;
  }
}

/**
 * One-ply greedy bot: plays the move that leaves the most stones in its own
 * store right now (captures and free-turn deposits included), with no regard
 * for what the opponent can do next.
 */
export class GreedyBot {
  thinkDelay = 300;

  choose(state) {
    const me = state.current;
    const moves = getValidMoves(state, me);
    if (moves.length === 0) return null;

    let best = moves[0];
    let bestScore = -Infinity;
    for (const move of moves) {
      const { newState } = playTurn(state, move);
      const score = newState.pits[storeOf(me)];
      if (score > bestScore) {
        bestScore = score;
        best = move;
      }
    }
    return best;
  }
}

/**
 * Depth-first bot that follows its own free-turn chains, picking the move that
 * maximises its store at the end of the chain. It does not model the
 * opponent's replies (it is not a minimax search), so it is strong at stringing
 * free turns together but blind to counter-play.
 */
export class DfsBot {
  thinkDelay = 100;

  constructor(maxDepth = 8) {
    this.maxDepth = maxDepth;
  }

  choose(state) {
    const me = state.current;
    const moves = getValidMoves(state, me);
    if (moves.length === 0) return null;

    let best = moves[0];
    let bestScore = -Infinity;
    for (const move of moves) {
      const score = this.evaluate(state, move, me, 0);
      if (score > bestScore) {
        bestScore = score;
        best = move;
      }
    }
    return best;
  }

  /**
   * Returns the best store total reachable from `move`, recursing only through
   * free turns (where `state.current` stays `me`).
   */
  evaluate(state, move, me, depth) {
    if (depth >= this.maxDepth) return state.pits[storeOf(me)];

    const { newState, freeTurn } = playTurn(state, move);
    if (!freeTurn) return newState.pits[storeOf(me)];

    const nextMoves = getValidMoves(newState, me);
    if (nextMoves.length === 0) return newState.pits[storeOf(me)];

    let best = -Infinity;
    for (const next of nextMoves) {
      best = Math.max(best, this.evaluate(newState, next, me, depth + 1));
    }
    return best;
  }
}

/**
 * Registry of selectable bots, keyed by the id used in the mode dropdown.
 * Add an entry here to make a new bot available in the UI.
 */
export const BOT_REGISTRY = new Map([
  ["random", { label: "Random Bot", create: () => new RandomBot() }],
  ["greedy", { label: "Greedy Bot", create: () => new GreedyBot() }],
  ["dfs", { label: "DFS Bot", create: () => new DfsBot(8) }],
]);

/**
 * Opponent options for the dropdown: a human (Player vs Player) first, then
 * every registered bot.
 */
export const OPPONENTS = [
  { value: "human", label: "Player 2 (Human)" },
  ...[...BOT_REGISTRY].map(([value, bot]) => ({ value, label: bot.label })),
];
