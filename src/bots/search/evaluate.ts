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
export const onSide: Evaluator = (s, me) => pitsOf(me).reduce((n, i) => n + s.pits[i], 0);

/**
 * Seeds `me` leaves open to capture: in their pits that face an empty pit, where the opponent's
 * last seed could land and take them. (Whether the opponent can actually reach it isn't checked.)
 */
export const exposed: Evaluator = (s, me) =>
  pitsOf(me).reduce((n, i) => n + (s.pits[oppositeOf(i)] === 0 ? s.pits[i] : 0), 0);

/** How good `s` looks for `me`, as Minimax sees it. */
export function evaluate(s: GameState, me: Player): number {
  const lead = banked(s, me) - banked(s, other(me));
  if (s.gameOver) return lead > 0 ? WIN + lead : lead < 0 ? -WIN + lead : 0;
  // Seeds still on your side are yours if the game ends now, so they count for a little.
  return lead + 0.25 * (onSide(s, me) - onSide(s, other(me)));
}
