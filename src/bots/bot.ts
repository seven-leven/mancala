/** What every bot is, and what the search bots share. */
import type { GameState } from "../game/types.ts";
import type { SearchResult } from "./search/minimax.ts";

export interface Bot {
  /** The pit to play, or null if there's no legal move. */
  choose(state: GameState): number | null;
  /** What the last choice was based on, for the move log ("saw 9 moves ahead, +12"), if it searched. */
  note?(): string | null;
}

export type Rng = () => number;

/** How a search bot describes what it saw. */
export function describe(r: SearchResult): string | null {
  if (r.depth === 0) return null;
  if (r.score >= 10_000) return `sees a forced win`;
  if (r.score <= -10_000) return `sees a forced loss`;
  const lead = Math.round(r.score);
  return `saw ${r.depth} ${r.depth === 1 ? "move" : "moves"} ahead, ${lead > 0 ? "+" : ""}${lead}`;
}
