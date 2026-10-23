/**
 * How each matched pair of tournament games starts. An opening is set up once, then both bots
 * play it from each side, so an opening that favours one seat comes out even.
 */
import { newGame, playTurn, validMoves } from "../../src/game/engine.ts";
import { DEFAULT_RULES, type GameState, type Player } from "../../src/game/types.ts";

export const OPENINGS = ["random-moves", "symmetric", "standard"] as const;
export type Opening = typeof OPENINGS[number];
export const isOpening = (x: unknown): x is Opening => OPENINGS.includes(x as Opening);

/**
 * A random start that's fair at move 0: `perSide` seeds on each side, 3 to 10 in a pit, and each
 * side the same as the other seen from its own seat (Player 1's pit i, counted from their left,
 * matches Player 2's pit 13 − i, counted from theirs).
 */
export function symmetricLayout(rng: () => number, perSide = 7 * DEFAULT_RULES.seeds, min = 3, max = 10): number[] {
  const side = new Array<number>(7).fill(min);
  for (let left = perSide - 7 * min; left > 0; left--) {
    const open = side.flatMap((n, i) => (n < max ? [i] : []));
    side[open[Math.floor(rng() * open.length)]]++;
  }
  return [...side, ...[...side].reverse()];
}

/** Where a matched pair starts: the opening board, any moves already made on it, and the result. */
export interface Start {
  /** Pits 0–13 at the very start, when it isn't the standard board. */
  layout?: number[];
  /** Moves played before the bots take over (engine pit indices). */
  moves: number[];
  state: GameState;
}

export function opening(kind: Opening, first: Player, rng: () => number): Start {
  if (kind === "symmetric") {
    const layout = symmetricLayout(rng);
    return { layout, moves: [], state: newGame(DEFAULT_RULES, first, layout) };
  }
  let g = newGame(DEFAULT_RULES, first);
  const moves: number[] = [];
  if (kind === "standard") return { moves, state: g };
  // random-moves: the standard board after two random moves (by whoever's turn it is).
  for (let ply = 0; ply < 2 && !g.gameOver; ply++) {
    const legal = validMoves(g);
    moves.push(legal[Math.floor(rng() * legal.length)]);
    g = playTurn(g, moves.at(-1)!, { record: false }).state;
  }
  return { moves, state: g };
}
