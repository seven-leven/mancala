/**
 * What a bot is, and what every bot gets and promises. docs/BOTS.md explains the rules behind these
 * types; the registry (bots.ts) checks each entry against BotSpec.
 */
import type { GameState, Player } from "../game/types.ts";

/** Random numbers in [0, 1). Every bit of a bot's randomness comes from the one it's given. */
export type Rng = () => number;

export interface Bot {
  /** The pit to play: always a legal one, or null only when there's no legal move. */
  choose(state: GameState): number | null;
  /** What the last choice was based on, for the move log ("saw 9 moves ahead, +12"), if it searched. */
  note?(): string | null;
}

/** What a bot is made with. */
export interface BotContext {
  rng: Rng;
  /**
   * "play": in the game, where search bots stop on `timeMs`. "rate": in the tournament, where every
   * bot plays at a fixed strength (a fixed depth, never a clock), so ratings don't depend on the
   * machine.
   */
  mode: "play" | "rate";
  /** The time budget for a move in "play" mode. */
  timeMs: number;
}

/** How a bot decides, which is also where its file lives (src/bots/players/<family>.ts). */
export type Family = "basic" | "one-move" | "chain" | "search" | "mixed" | "montecarlo";

/** A bot as the game lists it: one entry in BOTS. */
export interface BotSpec {
  /** The algorithm, for the curious ("Minimax"). */
  label: string;
  /** The everyday name players see ("Expert"), unique, in Elo order. */
  level: string;
  /** One plain sentence on how it plays. */
  blurb: string;
  family: Family;
  create(ctx: BotContext): Bot;
}

/** How good the position after a move looks for `me`; one-move bots play the best (or worst) of these. */
export type Evaluator = (after: GameState, me: Player) => number;
