/**
 * Solves small boards exactly: n pits a side and s seeds in each, with the game's rules (relay
 * sowing, free turns, captures on your own side, the early finish at a majority). The answer is
 * the margin of the player to move with best play by both: how many seeds more than the opponent.
 *
 * Board: pits 0..n-1 are the first player's, then their store (2n); pits n..2n-1 the second
 * player's, then theirs (2n+1). Seeds travel 0..n-1, store, 2n-1..n, store, as in the engine (whose
 * 7-pit board this matches exactly; tests/solver_test.ts checks it), and pit i faces pit i+n.
 *
 * Seeds only move towards their side's store or into a store, so no position comes round twice:
 * every position's value can be remembered, whatever line reached it. MTD(f) narrows the margin
 * with zero-window alpha-beta searches; a budget of positions stops it on boards too big, leaving
 * the bounds it proved. parallel.ts runs the same searches on several cores, sharing the memo.
 *
 * Built for speed: boards are typed arrays made once per depth, keys are updated seed by seed as
 * moves are played, and the memo is a fixed table of 8-byte entries that replaces its cheapest
 * entry when full, so memory never grows.
 */

export interface Board {
  n: number;
  /** 2n pits, then the two stores. */
  pits: number[];
  /** 0 for the first player, 1 for the second. */
  mover: 0 | 1;
}

/** What a solve proved: the margin of the player to move lies in [lo, hi] (equal when solved). */
export interface Solved {
  lo: number;
  hi: number;
  /** The best pit for the player to move (0-based, from their first pit), when solved. */
  move: number | null;
  nodes: number;
}

export const newBoard = (n: number, seeds: number): Board => ({
  n,
  pits: [...new Array<number>(2 * n).fill(seeds), 0, 0],
  mover: 0,
});

/** A move's result: the mover plays again, or the game is over. */
export const AGAIN = 1, OVER = 2;
const MAX_DROPS = 100_000;

/** mulberry32: the same keys every run, so saved memos and workers agree. */
function seededRandom(seed: number): () => number {
  let x = seed >>> 0;
  return () => {
    x = (x + 0x6d2b79f5) | 0;
    let t = Math.imul(x ^ (x >>> 15), 1 | x);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  };
}

/**
 * The rules for one board size (n pits, `total` seeds), with its Zobrist keys: a random pair of
 * 32-bit numbers for each slot and seed count, XORed together, and one more pair when the second
 * player is to move. play() keeps the key of the board it changes in `lo` and `hi`.
 */
export class Rules {
  readonly n: number;
  readonly slots: number;
  readonly total: number;
  /** The slot after each slot, for each mover (skipping the opponent's store): [mover * slots + slot]. */
  private next: Int8Array;
  private zl: Uint32Array;
  private zh: Uint32Array;
  private width: number;
  lo = 0;
  hi = 0;

  constructor(n: number, total: number) {
    [this.n, this.slots, this.total, this.width] = [n, 2 * n + 2, total, total + 1];
    const s1 = 2 * n, s2 = 2 * n + 1;
    this.next = new Int8Array(2 * this.slots);
    for (const mover of [0, 1]) {
      for (let i = 0; i < this.slots; i++) {
        let j = i;
        do {
          if (j === s1) j = 2 * n - 1;
          else if (j === s2) j = 0;
          else if (j < n - 1) j++;
          else if (j === n - 1) j = s1;
          else if (j > n) j--; // the second player's pits, running down to n
          else j = s2; // pit n
        } while (j === (mover === 0 ? s2 : s1));
        this.next[mover * this.slots + i] = j;
      }
    }
    const random = seededRandom(0x5eed + 1009 * n + total);
    this.zl = Uint32Array.from({ length: this.slots * this.width + 1 }, random);
    this.zh = Uint32Array.from({ length: this.zl.length }, random);
  }

  /** Sets `lo` and `hi` to the key of `pits` with `mover` to move. */
  hash(pits: ArrayLike<number>, mover: number): void {
    let lo = 0, hi = 0;
    for (let i = 0, o = 0; i < this.slots; i++, o += this.width) {
      lo ^= this.zl[o + pits[i]];
      hi ^= this.zh[o + pits[i]];
    }
    const side = this.zl.length - 1;
    if (mover) [lo, hi] = [lo ^ this.zl[side], hi ^ this.zh[side]];
    [this.lo, this.hi] = [lo >>> 0, hi >>> 0];
  }

  /** Changes slot `i` by `by` seeds, keeping the key up to date. */
  private add(pits: Int32Array | number[], i: number, by: number): void {
    const o = i * this.width + pits[i];
    this.lo = (this.lo ^ this.zl[o] ^ this.zl[o + by]) >>> 0;
    this.hi = (this.hi ^ this.zh[o] ^ this.zh[o + by]) >>> 0;
    pits[i] += by;
  }

  /**
   * Plays pit `start` for `mover` on `pits`, in place, and updates the key from the board's key in
   * `lo`/`hi` (call hash() first, or carry it on from the last play). Returns AGAIN and OVER bits;
   * the mover changes unless one is set. The game's end sweeps each side into its store.
   */
  play(pits: Int32Array | number[], mover: number, start: number): number {
    const { n, next } = this, row = mover * this.slots;
    let drops = 0, pos = start;
    do {
      // Sow from `pos`: pick it all up, one seed into each slot after it.
      let hand = pits[pos];
      this.add(pits, pos, -hand);
      while (hand > 0 && drops++ < MAX_DROPS) {
        pos = next[row + pos];
        this.add(pits, pos, 1);
        hand--;
      }
      // Relay: the last seed landed in a pit that had seeds, so keep going from there.
    } while (pos < 2 * n && pits[pos] > 1 && drops < MAX_DROPS);
    const myStore = 2 * n + mover;
    const again = pos === myStore;
    if (!again && pos < 2 * n && pits[pos] === 1 && (pos < n) === (mover === 0)) {
      const opposite = pos < n ? pos + n : pos - n;
      const taken = pits[opposite];
      this.add(pits, opposite, -taken);
      this.add(pits, myStore, taken);
    }
    let side0 = 0, side1 = 0;
    for (let i = 0; i < n; i++) [side0, side1] = [side0 + pits[i], side1 + pits[n + i]];
    const majority = Math.floor(this.total / 2) + 1;
    if (pits[2 * n] >= majority || pits[2 * n + 1] >= majority || side0 === 0 || side1 === 0) {
      for (let i = 0; i < 2 * n; i++) if (pits[i]) this.add(pits, i, -pits[i]);
      this.add(pits, 2 * n, side0);
      this.add(pits, 2 * n + 1, side1);
      return OVER;
    }
    if (again) return AGAIN;
    const side = this.zl.length - 1;
    this.lo = (this.lo ^ this.zl[side]) >>> 0;
    this.hi = (this.hi ^ this.zh[side]) >>> 0;
    return 0;
  }
}

const rulesCache = new Map<string, Rules>();
/** The rules for a board of n pits holding `total` seeds, made once. */
export function rulesFor(n: number, total: number): Rules {
  const id = `${n}/${total}`;
  let r = rulesCache.get(id);
  if (!r) rulesCache.set(id, r = new Rules(n, total));
  return r;
}

/** Plays pit `start` on `b` in place (the board's own form), for tests and tools. */
export function play(b: Board, start: number): { again: boolean; over: boolean } {
  const r = rulesFor(b.n, b.pits.reduce((a, x) => a + x, 0));
  r.hash(b.pits, b.mover);
  const f = r.play(b.pits, b.mover, start);
  if (!f) b.mover = b.mover === 0 ? 1 : 0;
  return { again: (f & AGAIN) !== 0, over: (f & OVER) !== 0 };
}

/**
 * The memo: what each position's search proved, in a fixed table of 2^bits entries, two 32-bit
 * words each. The value word packs the bounds, the best move and how much work the search took;
 * the check word is the key's high half XORed with the value, so a read that catches another
 * core's write half done fails the check instead of returning nonsense. Entries go in pairs (a
 * bucket); a new one takes an empty slot, else the one whose search did less work. Its buffers can
 * be shared between workers (SharedArrayBuffer) or saved to disk and loaded again.
 */
export class Memo {
  readonly check: Uint32Array;
  readonly value: Uint32Array;
  private mask: number;

  constructor(bits: number, shared = false) {
    const make = () => new Uint32Array(shared ? new SharedArrayBuffer(4 << bits) : new ArrayBuffer(4 << bits));
    [this.check, this.value] = [make(), make()];
    this.mask = this.value.length - 2; // even: the first slot of a bucket
  }

  /** A memo on buffers that already exist: another worker's, or a saved one. */
  static on(check: Uint32Array, value: Uint32Array): Memo {
    const m = Object.create(Memo.prototype) as Memo;
    Object.assign(m, { check, value, mask: value.length - 2 });
    return m;
  }

  /** The value word stored for key (lo, hi), or 0. */
  get(lo: number, hi: number): number {
    const i = lo & this.mask;
    const a = this.value[i], b = this.value[i + 1];
    if (a !== 0 && (this.check[i] ^ a) >>> 0 === hi) return a;
    if (b !== 0 && (this.check[i + 1] ^ b) >>> 0 === hi) return b;
    return 0;
  }

  set(lo: number, hi: number, v: number): void {
    const i = lo & this.mask;
    const a = this.value[i], b = this.value[i + 1];
    let j: number;
    if (a !== 0 && (this.check[i] ^ a) >>> 0 === hi) j = i;
    else if (b !== 0 && (this.check[i + 1] ^ b) >>> 0 === hi) j = i + 1;
    else if (a === 0) j = i;
    else j = b === 0 || work(b) < work(a) ? i + 1 : i;
    this.value[j] = v;
    this.check[j] = (hi ^ v) >>> 0;
  }
}

// The value word: bit 31 set (never 0), work in 22-27, best move in 18-21, hi + T in 9-17, lo + T in 0-8.
const work = (v: number) => (v >>> 22) & 63;
const pack = (lo: number, hi: number, best: number, effort: number, total: number) =>
  (0x80000000 | (effort << 22) | (best << 18) | ((hi + total) << 9) | (lo + total)) >>> 0;

export class OutOfBudget extends Error {}
export class Aborted extends Error {}

/** One depth's boards: a child for each pit, with its key, mover, result and how promising it looks. */
interface Ply {
  boards: Int32Array[];
  lo: Uint32Array;
  hi: Uint32Array;
  flags: Uint8Array;
  pit: Uint8Array;
  gain: Int32Array;
  order: Uint8Array;
}

/**
 * Zero-window searches on one board size, against one memo. Alone it counts positions against a
 * budget; in a worker it also shares a count and a stop signal with the others (`ctrl`: [0] the
 * current search's number, changed to stop it; [1] positions searched, in units of 1024).
 */
export class Solver {
  nodes = 0;
  budget: number;
  /** The current search's number, for `ctrl`. */
  generation = 0;
  readonly memo: Memo;
  private plies: Ply[] = [];
  private rules: Rules;
  private ctrl: Int32Array | null;
  private worker: number;
  private T: number;

  constructor(rules: Rules, memo: Memo, budget = Infinity, ctrl: Int32Array | null = null, worker = 0) {
    [this.rules, this.memo, this.budget, this.ctrl, this.worker] = [rules, memo, budget, ctrl, worker];
    this.T = rules.total;
  }

  private ply(d: number): Ply {
    const n = this.rules.n;
    return (this.plies[d] ??= {
      boards: Array.from({ length: n }, () => new Int32Array(this.rules.slots)),
      lo: new Uint32Array(n),
      hi: new Uint32Array(n),
      flags: new Uint8Array(n),
      pit: new Uint8Array(n),
      gain: new Int32Array(n),
      order: new Uint8Array(n),
    });
  }

  /** Every 1024 positions in a worker: add to the shared count, and stop if told to or past the budget. */
  private tick(c: Int32Array): void {
    const done = Atomics.add(c, 1, 1) + 1;
    if (Atomics.load(c, 0) !== this.generation) throw new Aborted();
    if (done * 1024 > this.budget) throw new OutOfBudget();
  }

  // The bounds known for a position before searching it (known() sets them), and its best move.
  private bLo = 0;
  private bHi = 0;
  private bBest = -1;
  private known(pits: Int32Array, mover: number, lo: number, hi: number): void {
    const n2 = 2 * this.rules.n, T = this.T;
    // Stores never lose seeds: the mover ends with at least theirs, at most all but the opponent's.
    this.bLo = 2 * pits[n2 + mover] - T;
    this.bHi = T - 2 * pits[n2 + 1 - mover];
    this.bBest = -1;
    const v = this.memo.get(lo, hi);
    if (v === 0) return;
    this.bLo = Math.max(this.bLo, (v & 511) - T);
    this.bHi = Math.min(this.bHi, ((v >>> 9) & 511) - T);
    this.bBest = (v >>> 18) & 15;
  }

  /** Fail-soft alpha-beta on `b` (key lo/hi): the mover's final margin, as a bound against the window. */
  private search(
    d: number,
    b: Int32Array,
    mover: number,
    klo: number,
    khi: number,
    alpha: number,
    beta: number,
  ): number {
    if (this.ctrl) {
      if ((++this.nodes & 1023) === 0) this.tick(this.ctrl);
    } else if (++this.nodes > this.budget) throw new OutOfBudget();
    const n = this.rules.n, T = this.T, rules = this.rules;
    this.known(b, mover, klo, khi);
    const lo = this.bLo, hi = this.bHi, last = this.bBest;
    if (lo === hi || lo >= beta) return lo;
    if (hi <= alpha) return hi;
    [alpha, beta] = [Math.max(alpha, lo), Math.min(beta, hi)];
    const p = this.ply(d), mine = 2 * n + mover, theirs = 2 * n + 1 - mover;
    let count = 0;
    for (let k = 0; k < n; k++) {
      const pit = mover * n + k;
      if (b[pit] === 0) continue;
      const c = p.boards[count];
      c.set(b);
      [rules.lo, rules.hi] = [klo, khi];
      const f = rules.play(c, mover, pit);
      let gain = c[mine] - b[mine];
      if (f & OVER) {
        // A move that ends the game: its margin is exact.
        const margin = c[mine] - c[theirs];
        if (margin >= beta) return margin;
        gain += 400;
      } else {
        // A child whose known bounds already beat beta settles this position without a search.
        this.known(c, f & AGAIN ? mover : 1 - mover, rules.lo, rules.hi);
        const floor = f & AGAIN ? this.bLo : -this.bHi;
        if (floor >= beta) return floor;
        if (f & AGAIN) gain += 200; // free turns early: a chain that clinches is a proof on its own
      }
      if (k === last) gain += 1000;
      [p.lo[count], p.hi[count], p.flags[count], p.pit[count], p.gain[count]] = [rules.lo, rules.hi, f, k, gain];
      // Insertion sort by gain, best first.
      let j = count++;
      while (j > 0 && p.gain[p.order[j - 1]] < gain) {
        p.order[j] = p.order[j - 1];
        j--;
      }
      p.order[j] = count - 1;
    }
    // Workers after the first take the shallowest moves in a different order, so they don't all
    // repeat one search (lazy SMP: they share what they find through the memo).
    const shift = this.worker && d < 2 ? this.worker % count : 0;
    let best = -Infinity, bestPit = 15, a = alpha;
    const before = this.nodes;
    for (let j = 0; j < count; j++) {
      const i = p.order[(j + shift) % count], c = p.boards[i], f = p.flags[i];
      const v = f & OVER
        ? c[mine] - c[theirs]
        : f & AGAIN
        ? this.search(d + 1, c, mover, p.lo[i], p.hi[i], a, beta)
        : -this.search(d + 1, c, 1 - mover, p.lo[i], p.hi[i], -beta, -a);
      if (v > best) [best, bestPit] = [v, p.pit[i]];
      if (best > a) a = best;
      if (a >= beta) break;
    }
    // Every search is zero-window (beta = alpha + 1), so the answer is a bound, never exact.
    const [newLo, newHi] = best <= alpha ? [lo, best] : [best, hi];
    const effort = Math.min(63, Math.floor(Math.log2(this.nodes - before + 1)));
    this.memo.set(klo, khi, pack(newLo, newHi, bestPit, effort, T));
    return best;
  }

  /** Is the mover's margin on `root` at least `beta`? A fail-soft bound: ≥ beta if so, < beta if not. */
  test(root: Board, beta: number): number {
    const b = Int32Array.from(root.pits);
    this.rules.hash(b, root.mover);
    return this.search(0, b, root.mover, this.rules.lo, this.rules.hi, beta - 1, beta);
  }

  /** With the value `v` known, the first pit (0-based) that reaches it. */
  opening(root: Board, v: number): number {
    const n = this.rules.n, rules = this.rules, me = root.mover;
    const reaches = (k: number) => {
      if (root.pits[me * n + k] === 0) return false;
      const c = Int32Array.from(root.pits);
      rules.hash(c, me);
      const f = rules.play(c, me, me * n + k);
      const r = f & OVER
        ? c[2 * n + me] - c[2 * n + 1 - me]
        : f & AGAIN
        ? this.search(1, c, me, rules.lo, rules.hi, v - 1, v)
        : -this.search(1, c, 1 - me, rules.lo, rules.hi, -v, -v + 1);
      return r >= v;
    };
    // The value is the best of the openings, so one of them reaches it.
    return [...Array(n).keys()].find(reaches)!;
  }
}

/** MTD(f): yes/no questions close in on the value, the first "does the mover win?". */
export function mtd(total: number, test: (beta: number) => number): { lo: number; hi: number } {
  let lo = -total, hi = total, g = 1;
  try {
    while (lo < hi) {
      const beta = g === lo ? g + 1 : g;
      g = test(beta);
      if (g < beta) hi = g;
      else lo = g;
    }
  } catch (e) {
    /* c8 ignore next: any other error is a bug, passed on */
    if (!(e instanceof OutOfBudget)) throw e;
  }
  return { lo, hi };
}

/**
 * Solves `start` on this core within `budget` positions, with a memo of 2^bits entries (8 bytes
 * each). parallel.ts does the same on several cores.
 */
export function solve(start: Board, budget = Infinity, bits = 20): Solved {
  const rules = rulesFor(start.n, start.pits.reduce((a, b) => a + b, 0));
  const s = new Solver(rules, new Memo(bits), budget);
  const { lo, hi } = mtd(rules.total, (beta) => s.test(start, beta));
  const nodes = s.nodes;
  if (lo < hi) return { lo, hi, move: null, nodes };
  s.budget = Infinity; // the value is known: finding its opening is cheap
  return { lo, hi, move: s.opening(start, lo), nodes };
}
