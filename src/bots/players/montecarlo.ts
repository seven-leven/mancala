/**
 * Players that sample a game tree: bots that judge a move by playing many random games from it, instead of
 * scoring positions. Monte Carlo tree search (UCT): grow a tree of moves from the position, choosing
 * which line to try next by UCB1 (good results so far, plus a bonus for lines tried less), finish
 * each try with a random game to the end, and play the move tried most.
 */
import { turn, validMoves, winnerOf } from "../../game/engine.ts";
import type { GameState, Player } from "../../game/types.ts";
import type { Bot, Rng } from "../contracts.ts";
import { Boards, playOn } from "../search/moves.ts";

/** UCB1's exploration constant: √2, the textbook value for results between 0 and 1. */
const EXPLORE = Math.SQRT2;
/** A random game stops here if it hasn't ended (no real game comes near it). */
const MAX_PLAYOUT_MOVES = 1000;

/** One move in the tree, with the results of every try that went through it. */
interface Node {
  /** The pit played to reach this node (the root has none). */
  move: number;
  /** Who played it: results are counted for them, since a free turn means it isn't always the other side. */
  mover: Player;
  parent: Node | null;
  children: Node[];
  /** Moves from here not yet in the tree. */
  untried: number[];
  visits: number;
  /** Wins for `mover` (a draw counts half). */
  wins: number;
}

const node = (move: number, mover: Player, parent: Node | null, untried: number[]): Node => ({
  move,
  mover,
  parent,
  children: [],
  untried,
  visits: 0,
  wins: 0,
});

/** How much a try is worth to `p`: 1 for a win, ½ for a draw, 0 for a loss. */
const resultFor = (winner: Player | null, p: Player): number => winner === null ? 0.5 : winner === p ? 1 : 0;

export interface MonteCarloOptions {
  /** Stop after this many tries: a fixed strength, for rating. */
  playouts?: number;
  /** Stop after this long, in ms: for the game. */
  timeMs?: number;
}

/** Monte Carlo tree search with random playouts. See the file's comment. */
export class MonteCarloBot implements Bot {
  private opts: MonteCarloOptions;
  private rng: Rng;
  private boards = new Boards();
  private last: { playouts: number; share: number } | null = null;

  constructor(opts: MonteCarloOptions, rng: Rng = Math.random) {
    this.opts = opts;
    this.rng = rng;
  }

  note(): string | null {
    if (!this.last) return null;
    const { playouts, share } = this.last;
    return `played ${playouts} random ${playouts === 1 ? "game" : "games"}, won ${Math.round(share * 100)}%`;
  }

  choose(state: GameState): number | null {
    this.last = null;
    const moves = validMoves(state);
    if (moves.length <= 1) return moves.length ? moves[0] : null;

    // The root's "mover" is whoever moved last; only its children's results are read.
    const root = node(-1, state.current === 1 ? 2 : 1, null, moves);
    const board = this.boards.at(0, state);
    const { playouts = Infinity, timeMs = Infinity } = this.opts;
    const stop = performance.now() + timeMs;
    let done = 0;
    while (done < playouts && (done === 0 || performance.now() < stop)) {
      this.playout(root, state, board);
      done++;
    }

    let best = root.children[0];
    for (const c of root.children) if (c.visits > best.visits) best = c;
    this.last = { playouts: done, share: best.wins / best.visits };
    return best.move;
  }

  /** One try: down the tree by UCB1, one new move, then a random game to the end, and back up. */
  private playout(root: Node, state: GameState, board: GameState): void {
    // Start each try from the position itself: playOn copies it onto the board, then moves play in place.
    let n = root;
    let started = false;
    const play = (pit: number) => {
      if (started) {
        turn(board, pit);
      } else {
        playOn(board, state, pit);
        started = true;
      }
    };

    // Selection: while every move here has been tried, follow the best by UCB1.
    while (n.untried.length === 0 && n.children.length > 0) {
      const log = Math.log(n.visits);
      let pick = n.children[0], pickValue = -Infinity;
      for (const c of n.children) {
        const value = c.wins / c.visits + EXPLORE * Math.sqrt(log / c.visits);
        if (value > pickValue) [pick, pickValue] = [c, value];
      }
      play(pick.move);
      n = pick;
    }

    // Expansion: add one untried move.
    if (n.untried.length > 0) {
      const i = Math.floor(this.rng() * n.untried.length);
      const move = n.untried[i];
      n.untried[i] = n.untried[n.untried.length - 1];
      n.untried.pop();
      const mover = started ? board.current : state.current;
      play(move);
      const child = node(move, mover, n, validMoves(board));
      n.children.push(child);
      n = child;
    }

    // Simulation: random moves to the end of the game. (The root always has a move, so by now at
    // least one has been played onto the board.)
    for (let i = 0; i < MAX_PLAYOUT_MOVES && !board.gameOver; i++) {
      const legal = validMoves(board);
      turn(board, legal[Math.floor(this.rng() * legal.length)]);
    }

    // Backpropagation: every node on the way gets the result, for whoever made its move.
    const winner = winnerOf(board);
    for (let m: Node | null = n; m; m = m.parent) {
      m.visits++;
      m.wins += resultFor(winner, m.mover);
    }
  }
}
