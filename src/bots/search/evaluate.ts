/** How a search scores a position. Minimax and the bots built on it share this. */
import { other, pitsOf, score } from "../../game/engine.ts";
import type { GameState, Player } from "../../game/types.ts";

/** A won game's value; anything at or past it is a forced win, at or below -WIN a forced loss. */
export const WIN = 10_000;

/** How good `s` looks for `me`. */
export function evaluate(s: GameState, me: Player): number {
  const lead = score(s, me) - score(s, other(me));
  if (s.gameOver) return lead > 0 ? WIN + lead : lead < 0 ? -WIN + lead : 0;
  // Seeds still on your side are yours if the game ends now, so they count for a little.
  const side = (p: Player) => pitsOf(p).reduce((n, i) => n + s.pits[i], 0);
  return lead + 0.25 * (side(me) - side(other(me)));
}
