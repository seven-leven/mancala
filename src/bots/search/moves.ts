/**
 * Trying moves without copying positions: what every bot that looks ahead does, in one place.
 * playTurn() copies the position and keeps an event log, which the screen needs and a bot trying
 * thousands of moves doesn't. Here a move is played onto a board that's reused: copied into from
 * the position, then played in place. A bot keeps one board per depth it looks to.
 */
import { turn } from "../../game/engine.ts";
import type { GameState } from "../../game/types.ts";

/** A board to play moves on, shaped like `like` (its rules and whose turn it is). */
export const newBoard = (like: GameState): GameState => ({
  rules: like.rules,
  pits: new Array<number>(16).fill(0),
  current: like.current,
  gameOver: false,
});

/**
 * Copies `from` onto `board` and plays `pit` there. Returns the engine's flags (FREE_TURN,
 * GAME_OVER), or INVALID. `board` then holds the position after the move, until it's reused. The
 * board must be one made for `from`'s rules (Boards sees to that).
 */
export function playOn(board: GameState, from: GameState, pit: number): number {
  const p = board.pits, q = from.pits;
  for (let i = 0; i < 16; i++) p[i] = q[i];
  board.current = from.current;
  board.gameOver = from.gameOver;
  return turn(board, pit);
}

/** One board per depth, made the first time it's needed and reused after (new ones if the rules change). */
export class Boards {
  private boards: GameState[] = [];
  at(depth: number, like: GameState): GameState {
    const board = this.boards[depth];
    if (board && board.rules === like.rules) return board;
    return (this.boards[depth] = newBoard(like));
  }
}
