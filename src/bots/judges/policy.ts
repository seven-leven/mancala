/**
 * Intuition's policy network: which move to play, straight from the board, with no search. Trained
 * offline on Minimax's score for every move (lab/learn/train-policy.ts); this file only runs it.
 *
 * Input: the same 16 numbers as the value net (net.ts, `encode`), from the mover's side. Then two
 * hidden layers with ReLU, and seven outputs, one for each of the mover's pits in sowing order
 * (their first pit first). The highest output among the pits that have seeds is the move.
 */
import { pitsOf } from "../../game/engine.ts";
import type { GameState } from "../../game/types.ts";
import { encode, INPUTS } from "./net.ts";

/** A trained policy net's weights, as lab/learn/train-policy.ts writes them: rows of each layer, then biases. */
export interface PolicyWeights {
  w1: number[][]; // first hidden layer × INPUTS
  b1: number[];
  w2: number[][]; // second hidden layer × first
  b2: number[];
  w3: number[][]; // 7 outputs × second hidden layer
  b3: number[];
}

/** A policy net ready to read positions, with its buffers made once and reused. */
export class PolicyNet {
  private w: PolicyWeights;
  private x = new Float64Array(INPUTS);
  private h1: Float64Array;
  private h2: Float64Array;
  private out = new Float64Array(7);

  constructor(w: PolicyWeights) {
    this.w = w;
    this.h1 = new Float64Array(w.b1.length);
    this.h2 = new Float64Array(w.b2.length);
  }

  /** How much the net likes each of the mover's seven pits, in sowing order (higher is better; empty pits included). */
  outputs(s: GameState): Float64Array {
    const { w, x, h1, h2, out } = this;
    encode(s, x);
    layer(w.w1, w.b1, x, h1, true);
    layer(w.w2, w.b2, h1, h2, true);
    return layer(w.w3, w.b3, h2, out, false);
  }

  /** The pit to play: the net's favourite among those with seeds, or null if none has any. */
  choose(s: GameState): number | null {
    if (s.gameOver) return null;
    const out = this.outputs(s);
    const pits = pitsOf(s.current);
    let best: number | null = null;
    for (let i = 0; i < 7; i++) {
      if (s.pits[pits[i]] > 0 && (best === null || out[i] > out[pits.indexOf(best)])) best = pits[i];
    }
    return best;
  }
}

/** One layer: `rows` × `x` + `b` into `y`, through ReLU if `relu`. */
function layer(rows: number[][], b: number[], x: Float64Array, y: Float64Array, relu: boolean): Float64Array {
  for (let j = 0; j < b.length; j++) {
    let a = b[j];
    const r = rows[j];
    for (let i = 0; i < r.length; i++) a += r[i] * x[i];
    y[j] = relu && a < 0 ? 0 : a;
  }
  return y;
}
