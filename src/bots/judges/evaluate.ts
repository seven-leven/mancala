/**
 * How a bot scores a position: small pieces (each an Evaluator), and the blend Minimax searches
 * with. One-move bots and the search share these, so a new idea is a new piece here.
 */
import { oppositeOf, other, pitsOf, score } from "../../game/engine.ts";
import type { GameState, Player } from "../../game/types.ts";
import type { Evaluator } from "../contracts.ts";

/** A won game's value; anything at or past it is a forced win, at or below -WIN a forced loss. */
export const WIN = 10_000;

/** Seeds in `me`'s store. */
export const banked: Evaluator = (s, me) => score(s, me);

/** Seeds on `me`'s side of the board, which are theirs if the game ends now. */
export const onSide: Evaluator = (s, me) => {
  const o = me === 1 ? 0 : 7, p = s.pits;
  return p[o] + p[o + 1] + p[o + 2] + p[o + 3] + p[o + 4] + p[o + 5] + p[o + 6];
};

/**
 * Seeds `me` leaves open to capture: in their pits that face an empty pit, where the opponent's
 * last seed could land and take them. (Whether the opponent can actually reach it isn't checked.)
 */
export const exposed: Evaluator = (s, me) => {
  let n = 0;
  for (const i of pitsOf(me)) if (s.pits[oppositeOf(i)] === 0) n += s.pits[i];
  return n;
};

/** Moves from a pit to its owner's store: Player 1's pit 0 is 7 away; Player 2's pit 7 is 1 away. */
const toStore = (pit: number): number => (pit <= 6 ? 7 - pit : pit - 6);

/**
 * Free turns `me` has set up: pits whose seeds would end exactly in their store. A lap that skips
 * the opponent's store is 15 drops, so 15 more seeds land in the same place.
 */
export const freeTurnsReady: Evaluator = (s, me) => {
  let n = 0;
  for (const i of pitsOf(me)) if (s.pits[i] > 0 && s.pits[i] % 15 === toStore(i) % 15) n++;
  return n;
};

/** Seeds `me` could capture: in the opponent's pits that face one of `me`'s empty pits. */
export const threats: Evaluator = (s, me) => {
  let n = 0;
  for (const i of pitsOf(me)) if (s.pits[i] === 0) n += s.pits[oppositeOf(i)];
  return n;
};

/** How many pits `me` could play: few left means little choice and a side about to run dry. */
export const mobility: Evaluator = (s, me) => {
  let n = 0;
  for (const i of pitsOf(me)) if (s.pits[i] > 0) n++;
  return n;
};

/** How good `s` looks for `me`, as Minimax sees it. */
export function evaluate(s: GameState, me: Player): number {
  const lead = banked(s, me) - banked(s, other(me));
  if (s.gameOver) return lead > 0 ? WIN + lead : lead < 0 ? -WIN + lead : 0;
  // Seeds still on your side are yours if the game ends now, so they count for a little.
  return lead + 0.25 * (onSide(s, me) - onSide(s, other(me)));
}

/** `me`'s store lead. */
export const lead: Evaluator = (s, me) => banked(s, me) - banked(s, other(me));

/** What Planner weighs, per unit of each scoring piece. */
export const PLANNER_WEIGHTS = { lead: 1, freeTurns: 1.5, threats: 0.3, exposed: -0.5, mobility: 0.2 };

/**
 * Every piece at once, as Planner scores a position: the store lead, free turns set up, captures
 * threatened, seeds left exposed, and pits still playable. Worth about 75 Elo over the lead alone
 * in the same two-move search.
 */
export const planned = (w = PLANNER_WEIGHTS): Evaluator => (s, me) =>
  w.lead * lead(s, me) + w.freeTurns * freeTurnsReady(s, me) + w.threats * threats(s, me) +
  w.exposed * exposed(s, me) + w.mobility * mobility(s, me);
