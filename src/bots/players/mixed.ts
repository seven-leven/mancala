/** Family "mixed": one bot's move some of the time, another's (or a random one) the rest. */
import { validMoves } from "../../game/engine.ts";
import type { GameState } from "../../game/types.ts";
import type { Bot, Rng } from "../contracts.ts";

/**
 * Plays `main`'s move with probability `q`, otherwise `other`'s, or any legal pit if there's no
 * `other`. Its strength slides smoothly between the two (q = 0 plays like `other`, q = 1 like
 * `main`), so q can place it exactly where the ladder needs a bot.
 */
export class MixedBot implements Bot {
  private main: Bot;
  private q: number;
  private rng: Rng;
  private other?: Bot;
  constructor(main: Bot, q: number, rng: Rng = Math.random, other?: Bot) {
    [this.main, this.q, this.rng, this.other] = [main, q, rng, other];
  }
  choose(state: GameState): number | null {
    const moves = validMoves(state);
    if (!moves.length) return null;
    if (this.rng() < this.q) return this.main.choose(state);
    return this.other ? this.other.choose(state) : moves[Math.floor(this.rng() * moves.length)];
  }
}
