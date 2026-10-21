/**
 * Minimax with alpha-beta pruning and iterative deepening.
 *
 * Unlike the DFS bot, it plans for the opponent's replies: on its own turns it takes the best
 * move, on the opponent's it assumes the opponent will too. Free turns are searched without
 * using up depth, so it sees the same long chains the DFS bot hunts for. It searches one ply
 * deeper at a time until the time budget runs out, and keeps the deepest complete answer.
 *
 * A transposition table remembers positions already searched (the same board is often reached by
 * different move orders, and every deeper pass revisits the last one), so each is searched once
 * per depth, and the best move found for it last time is tried first.
 *
 * Speed-ups that keep the same moves are checked against the moves before them (600 decisions
 * on seeded positions, at depths 4 and 6); `npm run bench` measures them.
 */
import { FREE_TURN, INVALID, pitsOf, playTurn, storeOf, validMoves } from "../../game/engine.ts";
import type { GameState, Player } from "../../game/types.ts";
import { evaluate, WIN } from "./evaluate.ts";
import { playOn } from "./moves.ts";

export interface SearchOptions {
  /** Stop after this many milliseconds (keeps the deepest finished search). */
  timeMs?: number;
  /** Search exactly this deep (no time limit). Used by tests and the tournament. */
  depth?: number;
  /** Score every first move exactly (slower), so a caller can choose among near-best moves. */
  scoreAll?: boolean;
  /** How many free turns in a row the search may follow without using up depth (default 12). */
  extensions?: number;
  /**
   * "lose" plays to lose by as much as possible, assuming the opponent plays to win: both sides
   * then want the same thing (the opponent far ahead), so every position takes its best move for
   * that. The worst possible player, for the Pushover bot.
   */
  aim?: "win" | "lose";
  /** How a position is scored for the side searching (default `evaluate`); it must score a finished game as `evaluate` does. */
  score?: (s: GameState, me: Player) => number;
}

export interface SearchResult {
  move: number | null;
  /** The position's value for the player to move: store lead, plus a little for seeds on their side. */
  score: number;
  /** Deepest search finished, in plies (single moves). */
  depth: number;
  nodes: number;
  /** With `scoreAll`: each first move's score at the deepest finished search. */
  scores?: Map<number, number>;
}

/** What a remembered value means: exact, or only a bound because the search was cut off early. */
const EXACT = 0, LOWER = 1, UPPER = 2;
const FREE_TURN_EXTENSIONS = 12;

/*
 * The transposition table. A position's key is 64 bits (two 32-bit halves): the XOR of a random
 * number for each slot's seed count, and one for Player 2 to move (Zobrist hashing). Entries live
 * in typed arrays with open addressing. The table grows instead of evicting, so it remembers every
 * position a search visits, as the Map it replaced did; a generation number empties it between
 * searches without clearing. No strings, no objects per node, so little for the garbage collector.
 */
/** More than any slot can hold under any house rules (14 pits × 15 seeds is 210). */
const COUNTS = 256;
const SIDE = 2 * 16 * COUNTS;
const Z = new Uint32Array(SIDE + 2);
{
  // mulberry32, from a fixed seed, so keys (and searches) repeat. Not xorshift: its outputs are
  // linear in each other, which would tie a key's two halves together and leave it 32 bits.
  let x = 0x9e3779b9;
  for (let k = 0; k < Z.length; k++) {
    x = (x + 0x6d2b79f5) | 0;
    let t = Math.imul(x ^ (x >>> 15), 1 | x);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    Z[k] = (t ^ (t >>> 14)) >>> 0;
  }
}
let keyLo = 0, keyHi = 0;
/** Sets keyLo and keyHi to the position's key. */
function hash(s: GameState): void {
  let lo = 0, hi = 0;
  for (let i = 0; i < 16; i++) {
    const k = 2 * (i * COUNTS + s.pits[i]);
    lo ^= Z[k];
    hi ^= Z[k + 1];
  }
  if (s.current === 2) {
    lo ^= Z[SIDE];
    hi ^= Z[SIDE + 1];
  }
  keyLo = lo >>> 0;
  keyHi = hi >>> 0;
}

let size = 1 << 16, mask = size - 1, used = 0, generation = 0;
let tLo = new Uint32Array(size), tHi = new Uint32Array(size), tGen = new Uint32Array(size);
let tDepth = new Int16Array(size), tValue = new Float64Array(size), tFlag = new Uint8Array(size);
let tBest = new Int8Array(size);
/** The slot holding this key, or the empty one where it would go. */
function slot(lo: number, hi: number): number {
  let i = lo & mask;
  while (tGen[i] === generation && (tLo[i] !== lo || tHi[i] !== hi)) i = (i + 1) & mask;
  return i;
}
/** Doubles the table, moving this search's entries over. */
function grow(): void {
  const old = { tLo, tHi, tGen, tDepth, tValue, tFlag, tBest };
  size *= 2;
  mask = size - 1;
  [tLo, tHi, tGen] = [new Uint32Array(size), new Uint32Array(size), new Uint32Array(size)];
  [tDepth, tValue, tFlag, tBest] = [
    new Int16Array(size),
    new Float64Array(size),
    new Uint8Array(size),
    new Int8Array(size),
  ];
  for (let j = 0; j < old.tGen.length; j++) {
    if (old.tGen[j] !== generation) continue;
    const i = slot(old.tLo[j], old.tHi[j]);
    [tLo[i], tHi[i], tGen[i]] = [old.tLo[j], old.tHi[j], generation];
    [tDepth[i], tValue[i], tFlag[i], tBest[i]] = [old.tDepth[j], old.tValue[j], old.tFlag[j], old.tBest[j]];
  }
}
/**
 * Gives back the table's memory: back to its starting size, if a big search grew it. Searches are
 * the same either way (each starts with the table empty); a tool that runs thousands of searches in
 * a row calls this so one huge search doesn't keep its memory for the rest.
 */
export function shrinkTable(): void {
  if (size === 1 << 16) return;
  size = 1 << 16;
  mask = size - 1;
  used = 0;
  [tLo, tHi, tGen] = [new Uint32Array(size), new Uint32Array(size), new Uint32Array(size)];
  [tDepth, tValue, tFlag, tBest] = [
    new Int16Array(size),
    new Float64Array(size),
    new Uint8Array(size),
    new Int8Array(size),
  ];
}
function remember(lo: number, hi: number, depth: number, value: number, flag: number, best: number): void {
  if (2 * (used + 1) > size) grow();
  const i = slot(lo, hi);
  if (tGen[i] !== generation) {
    used++;
    tGen[i] = generation;
    tLo[i] = lo;
    tHi[i] = hi;
  }
  tDepth[i] = depth;
  tValue[i] = value;
  tFlag[i] = flag;
  tBest[i] = best;
}
class OutOfTime extends Error {}

/** One ply's children: up to seven boards, their moves, scores, and the order to try them in. */
interface Level {
  boards: GameState[];
  moves: Int8Array;
  free: Uint8Array;
  score: Float64Array;
  order: Int8Array;
}
const newLevel = (like: GameState): Level => ({
  boards: Array.from(
    { length: 7 },
    () => ({ rules: like.rules, pits: new Array<number>(16).fill(0), current: like.current, gameOver: false }),
  ),
  moves: new Int8Array(7),
  free: new Uint8Array(7),
  score: new Float64Array(7),
  order: new Int8Array(7),
});

export function search(
  root: GameState,
  { timeMs = 700, depth, scoreAll = false, extensions = FREE_TURN_EXTENSIONS, aim = "win", score = evaluate }:
    SearchOptions = {},
): SearchResult {
  const me = root.current;
  const sign = aim === "lose" ? -1 : 1;
  const value = (s: GameState) => sign * score(s, me);
  const moves = validMoves(root);
  if (moves.length === 0) return { move: null, score: value(root), depth: 0, nodes: 0 };
  if (moves.length === 1) return { move: moves[0], score: value(root), depth: 0, nodes: 1 };

  const deadline = depth === undefined ? performance.now() + timeMs : Infinity;
  const maxDepth = depth ?? 64;
  let nodes = 0;
  // A new generation: the table starts empty for this search.
  generation++;
  used = 0;

  // Boards for the children of each ply, made once per search and reused, so the search never
  // copies a position into a new object: each child is the parent copied into a pooled board,
  // then played in place.
  const levels: Level[] = [];
  const level = (ply: number) => (levels[ply] ??= newLevel(root));
  // The history heuristic: how often each pit cut a search short (weighted by depth). It only
  // breaks ties between moves the ordering below scores the same, always by less than one seed.
  // (Killer moves, tried the same way, searched more nodes, not fewer: free turns and store gain
  // already order this game's moves well.)
  const history = new Float64Array(16);

  /**
   * The children of `s`, into `level(ply)`, best-looking first, which makes alpha-beta prune far
   * more: last time's best move, then free turns, then whatever grows the mover's store most, then
   * the pit with the better history.
   * Returns how many there are; `at.order` lists them by index, best first.
   */
  const children = (s: GameState, ply: number, hashMove = -1): number => {
    const at = level(ply);
    const store = storeOf(s.current);
    let n = 0;
    for (const move of pitsOf(s.current)) {
      if (s.gameOver || s.pits[move] === 0) continue;
      const board = at.boards[n];
      const flags = playOn(board, s, move);
      const free = flags !== INVALID && (flags & FREE_TURN) !== 0;
      at.moves[n] = move;
      at.free[n] = free ? 1 : 0;
      // Only legal moves get here (the check above), so none needs scoring down.
      at.score[n] = (move === hashMove ? 1e6 : 0) + (free ? 1000 : 0) + board.pits[store] +
        history[move] / (history[move] + 1e4);
      // A stable insertion sort, best first: equal scores keep pit order, as Array.sort did.
      let k = n;
      while (k > 0 && at.score[at.order[k - 1]] < at.score[n]) {
        at.order[k] = at.order[k - 1];
        k--;
      }
      at.order[k] = n;
      n++;
    }
    return n;
  };

  // A free turn doesn't use up depth (the same player simply moves again), so the search follows
  // chains of free turns, which decide this game, up to FREE_TURN_EXTENSIONS extra plies.
  const alphabeta = (s: GameState, d: number, ext: number, alpha: number, beta: number, ply: number): number => {
    if (++nodes % 2048 === 0 && performance.now() > deadline) throw new OutOfTime();
    if (d === 0 || s.gameOver) return value(s);

    hash(s);
    const lo = keyLo, hi = keyHi;
    const t = slot(lo, hi);
    const hit = tGen[t] === generation;
    if (hit && tDepth[t] >= d) {
      const v = tValue[t];
      if (tFlag[t] === EXACT) return v;
      if (tFlag[t] === LOWER) alpha = Math.max(alpha, v);
      else beta = Math.min(beta, v);
      if (alpha >= beta) return v;
    }

    const alpha0 = alpha, beta0 = beta;
    const maximising = aim === "lose" || s.current === me;
    let best = maximising ? -Infinity : Infinity;
    let bestMove = -1;
    const at = level(ply);
    const count = children(s, ply, hit ? tBest[t] : -1);
    for (let c = 0; c < count; c++) {
      const k = at.order[c];
      const move = at.moves[k];
      const extend = at.free[k] === 1 && ext > 0;
      const v = alphabeta(at.boards[k], extend ? d : d - 1, extend ? ext - 1 : ext, alpha, beta, ply + 1);
      if (maximising ? v > best : v < best) {
        best = v;
        bestMove = move;
      }
      if (maximising) alpha = Math.max(alpha, v);
      else beta = Math.min(beta, v);
      if (alpha >= beta) {
        history[move] += d * d;
        break;
      }
    }
    // Values are always from `me`'s side, so the bounds read the same at every node.
    const flag = best <= alpha0 ? UPPER : best >= beta0 ? LOWER : EXACT;
    remember(lo, hi, d, best, flag, bestMove);
    return best;
  };

  let result: SearchResult = { move: moves[0], score: -Infinity, depth: 0, nodes: 0 };
  const first = level(0);
  let order = Array.from({ length: children(root, 0) }, (_, c) => first.moves[first.order[c]]);
  for (let d = 1; d <= maxDepth; d++) {
    try {
      let bestMove = order[0];
      let bestScore = -Infinity;
      let alpha = -Infinity;
      const scores = new Map<number, number>();
      for (const move of order) {
        const r = playTurn(root, move, { record: false });
        /* c8 ignore next: `order` holds only legal moves; the check only narrows the type */
        if (r.invalid) continue;
        const extend = r.freeTurn && extensions > 0;
        // scoreAll keeps the window open, so every move gets its true score, not just a bound.
        const v = alphabeta(
          r.state,
          extend ? d : d - 1,
          extensions - (extend ? 1 : 0),
          scoreAll ? -Infinity : alpha,
          Infinity,
          1,
        );
        scores.set(move, v);
        if (v > bestScore) [bestMove, bestScore] = [move, v];
        alpha = Math.max(alpha, v);
      }
      result = { move: bestMove, score: bestScore, depth: d, nodes, scores: scoreAll ? scores : undefined };
      // Search the best move first next time round.
      order = [bestMove, ...order.filter((m) => m !== bestMove)];
      // A forced win or loss won't change with more depth.
      if (Math.abs(bestScore) >= WIN) break;
    } catch (e) {
      if (e instanceof OutOfTime) break;
      /* c8 ignore start: any other error is a bug, passed on */
      throw e;
    }
    /* c8 ignore stop */
  }
  return { ...result, nodes };
}
