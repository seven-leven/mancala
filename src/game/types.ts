/**
 * The board, as indices into `GameState.pits`:
 *
 *          7  8  9 10 11 12 13       Player 2's pits (top row; seeds travel right to left)
 *    M2                          M1  stores: Player 2's on the left, Player 1's on the right
 *          0  1  2  3  4  5  6       Player 1's pits (bottom row; seeds travel left to right)
 *
 * Seeds travel counter-clockwise: along the bottom row into M1, back along the top row into
 * M2, and round again (see SOW_ORDER in engine.ts). Each player skips the other's store.
 */
export type Player = 1 | 2;

export const P1: Player = 1;
export const P2: Player = 2;

export const P1_PITS: readonly number[] = [0, 1, 2, 3, 4, 5, 6];
export const P2_PITS: readonly number[] = [7, 8, 9, 10, 11, 12, 13];
export const M1 = 14;
export const M2 = 15;

/** Rule options. The defaults are the house rules this game has always used. */
export interface Rules {
  /** Seeds in each pit at the start (ohvalhugondi uses 7). */
  seeds: number;
  /** Capture when the last seed lands in an empty pit on your own side only, or on either side. */
  capture: "own" | "any";
  /** End the game as soon as one store holds more than half of all the seeds. */
  clinch: boolean;
}

export const DEFAULT_RULES: Readonly<Rules> = { seeds: 7, capture: "own", clinch: true };

export interface GameState {
  readonly rules: Rules;
  /** 16 entries: pits 0–13, then the two stores (M1, M2). */
  pits: number[];
  /** Whose turn it is. */
  current: Player;
  gameOver: boolean;
}

/** One step of a turn, in order. The rules record these; the animation replays them. */
export type TurnEvent =
  | { type: "pickup"; pit: number; count: number }
  | { type: "drop"; pit: number; count: number; inHand: number }
  | { type: "capture"; landing: number; opposite: number; captured: number; store: number; storeCount: number }
  | { type: "sweep"; p1Remain: number; p2Remain: number; m1: number; m2: number };

export type TurnResult =
  | { invalid: true; state: GameState }
  | {
    invalid: false;
    /** The state after the move. The input state is never changed. */
    state: GameState;
    player: Player;
    move: number;
    /** The last seed landed in the player's own store, so they go again. */
    freeTurn: boolean;
    /** Seeds banked by a capture this turn (0 if none). */
    captured: number;
    /** How many times the hand was picked up again (relay sowing). */
    relays: number;
    gameOver: boolean;
    /** The winner once the game is over; null for a draw or a game still going. */
    winner: Player | null;
    events: TurnEvent[];
  };
