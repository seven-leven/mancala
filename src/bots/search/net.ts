/**
 * The learned bot's value network (TODO.md, "A learned bot"): how good a position is for the
 * player to move, from -1 (lost) to +1 (won). Trained offline to match Minimax's scores
 * (tools/learn/); this file only reads positions and runs the net, in plain TypeScript.
 *
 * Input: 16 numbers from the mover's side: their 7 pits in sowing order, the opponent's 7, their
 * store and the opponent's (pits ÷ 8, stores ÷ 49, so all are near 0–2). Seen this way the net
 * never has to learn whose turn it is. Then two hidden layers with ReLU (their sizes come with the
 * weights), and one output through tanh.
 */
import type { GameState, Player } from "../../game/types.ts";
import { evaluate } from "./evaluate.ts";

export const INPUTS = 16;

/** A trained net's weights, as tools/learn/train.ts writes them: rows of each layer, then biases. */
export interface Weights {
  w1: number[][]; // first hidden layer × INPUTS
  b1: number[];
  w2: number[][]; // second hidden layer × first
  b2: number[];
  w3: number[]; // second hidden layer
  b3: number;
}

/** The 16 inputs for `s`, from the mover's side, into `out`. */
export function encode(s: GameState, out: Float64Array = new Float64Array(INPUTS)): Float64Array {
  const p = s.pits;
  const [mine, theirs] = s.current === 1 ? [0, 7] : [7, 0];
  for (let i = 0; i < 7; i++) {
    out[i] = p[mine + i] / 8;
    out[7 + i] = p[theirs + i] / 8;
  }
  out[14] = p[s.current === 1 ? 14 : 15] / 49;
  out[15] = p[s.current === 1 ? 15 : 14] / 49;
  return out;
}

/** A network ready to score positions, with its buffers made once and reused. */
export class ValueNet {
  private n1: number;
  private n2: number;
  private w1: Float64Array;
  private b1: Float64Array;
  /** The second layer's weights by input unit (transposed), so units that are off can be skipped. */
  private w2t: Float64Array;
  private b2: Float64Array;
  private w3: Float64Array;
  private b3: number;
  private x = new Float64Array(INPUTS);
  private h1: Float64Array;
  private on: Int32Array;
  private a2: Float64Array;

  constructor(w: Weights) {
    [this.n1, this.n2] = [w.b1.length, w.b2.length];
    this.w1 = Float64Array.from(w.w1.flat());
    this.b1 = Float64Array.from(w.b1);
    this.w2t = new Float64Array(this.n1 * this.n2);
    for (let j = 0; j < this.n2; j++) for (let i = 0; i < this.n1; i++) this.w2t[i * this.n2 + j] = w.w2[j][i];
    this.b2 = Float64Array.from(w.b2);
    this.w3 = Float64Array.from(w.w3);
    this.b3 = w.b3;
    this.h1 = new Float64Array(this.n1);
    this.on = new Int32Array(this.n1);
    this.a2 = new Float64Array(this.n2);
  }

  /** The position's value for the player to move, from -1 (lost) to +1 (won). */
  value(s: GameState): number {
    const { x, h1, on, a2, w1, b1, w2t, b2, w3, n1, n2 } = this;
    encode(s, x);
    // First layer, noting which units are on: after ReLU about half are zero, and add nothing.
    let count = 0;
    for (let j = 0; j < n1; j++) {
      let a = b1[j];
      for (let i = 0, r = j * INPUTS; i < INPUTS; i++) a += w1[r + i] * x[i];
      if (a > 0) {
        h1[j] = a;
        on[count++] = j;
      }
    }
    // Second layer, from the units that are on only.
    a2.set(b2);
    for (let k = 0; k < count; k++) {
      const i = on[k], v = h1[i];
      for (let j = 0, r = i * n2; j < n2; j++) a2[j] += w2t[r + j] * v;
    }
    let out = this.b3;
    for (let j = 0; j < n2; j++) if (a2[j] > 0) out += w3[j] * a2[j];
    return Math.tanh(out);
  }
}

/**
 * A search's score from the net, for `me`: a finished game as `evaluate` scores it (a real win or
 * loss), anything else as 100 times the net's value from `me`'s side, so a proven result always
 * outranks a guess.
 */
export const netScore = (net: ValueNet) => (s: GameState, me: Player): number =>
  s.gameOver ? evaluate(s, me) : 100 * (s.current === me ? net.value(s) : -net.value(s));
