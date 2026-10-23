/**
 * Trains Intuition's policy net (src/bots/judges/policy.ts) on positions from policy-data.ts, and
 * writes its weights to src/bots/judges/policy-weights.ts.
 *
 *   node lab/learn/train-policy.ts data/learn/policy.jsonl [epochs, default 40] [hidden sizes, default 64,64]
 *
 * The target for each position is the move Minimax plays there. Cross-entropy over the legal moves
 * (softmax of the outputs for pits with seeds), Adam, batches of 256, 10% of positions held out to
 * check how often the net plays Minimax's move. Seeded throughout, so the same data gives the same
 * weights.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { encode, INPUTS } from "../../src/bots/judges/net.ts";
import { PolicyNet, type PolicyWeights } from "../../src/bots/judges/policy.ts";
import { DEFAULT_RULES, type GameState, type Player } from "../../src/game/types.ts";
import { seeded } from "../../harness/match.ts";

const [file, epochsArg, sizesArg] = process.argv.slice(2);
if (!file) {
  console.error("Usage: node lab/learn/train-policy.ts <policy.jsonl> [epochs] [hidden sizes]");
  process.exit(1);
}
const EPOCHS = Number(epochsArg ?? 40), BATCH = 256, RATE = 1e-3;
const [H1, H2] = (sizesArg ?? "64,64").split(",").map(Number);
const rng = seeded(2026);

// --- Data -------------------------------------------------------------------------------------
type Row = { pits: number[]; toMove: Player; move: number };
const rows: Row[] = readFileSync(file, "utf8").trim().split("\n").map((l) => JSON.parse(l));
const state = (r: Row): GameState => ({ rules: DEFAULT_RULES, pits: r.pits, current: r.toMove, gameOver: false });
const n = rows.length;
const X = new Float64Array(n * INPUTS), T = new Float64Array(n * 7), legal = new Uint8Array(n * 7);
rows.forEach((r, k) => {
  X.set(encode(state(r)), k * INPUTS);
  const first = r.toMove === 1 ? 0 : 7;
  for (let i = 0; i < 7; i++) legal[k * 7 + i] = r.pits[first + i] > 0 ? 1 : 0;
  T[k * 7 + r.move] = 1;
});
const order = Array.from({ length: n }, (_, k) => k);
for (let k = n - 1; k > 0; k--) {
  const j = Math.floor(rng() * (k + 1));
  [order[k], order[j]] = [order[j], order[k]];
}
const held = order.slice(0, Math.floor(n / 10)), train = order.slice(Math.floor(n / 10));

// --- The net, flat, with Adam's moments for each parameter ---------------------------------------
const sizes = { w1: H1 * INPUTS, b1: H1, w2: H2 * H1, b2: H2, w3: 7 * H2, b3: 7 };
const total = Object.values(sizes).reduce((a, b) => a + b, 0);
const P = new Float64Array(total),
  G = new Float64Array(total),
  M = new Float64Array(total),
  V = new Float64Array(total);
const at: Record<keyof typeof sizes, number> = {} as never;
{
  let o = 0;
  for (const [k, size] of Object.entries(sizes)) [at[k as keyof typeof sizes], o] = [o, o + size];
}
const gauss = () => Math.sqrt(-2 * Math.log(rng() || 1e-12)) * Math.cos(2 * Math.PI * rng());
for (let i = 0; i < sizes.w1; i++) P[at.w1 + i] = gauss() * Math.sqrt(2 / INPUTS);
for (let i = 0; i < sizes.w2; i++) P[at.w2 + i] = gauss() * Math.sqrt(2 / H1);
for (let i = 0; i < sizes.w3; i++) P[at.w3 + i] = gauss() * Math.sqrt(1 / H2);

const a1 = new Float64Array(H1), h1 = new Float64Array(H1), a2 = new Float64Array(H2), h2 = new Float64Array(H2);
const z = new Float64Array(7), p = new Float64Array(7), d2 = new Float64Array(H2), d1 = new Float64Array(H1);

/** Forward pass for sample k; leaves the activations in a1..h2, the outputs in z, the legal moves' softmax in p. */
function forward(k: number) {
  const x = k * INPUTS;
  for (let j = 0; j < H1; j++) {
    let a = P[at.b1 + j];
    for (let i = 0; i < INPUTS; i++) a += P[at.w1 + j * INPUTS + i] * X[x + i];
    a1[j] = a;
    h1[j] = a > 0 ? a : 0;
  }
  for (let j = 0; j < H2; j++) {
    let a = P[at.b2 + j];
    for (let i = 0; i < H1; i++) a += P[at.w2 + j * H1 + i] * h1[i];
    a2[j] = a;
    h2[j] = a > 0 ? a : 0;
  }
  let max = -Infinity;
  for (let o = 0; o < 7; o++) {
    let a = P[at.b3 + o];
    for (let i = 0; i < H2; i++) a += P[at.w3 + o * H2 + i] * h2[i];
    z[o] = a;
    if (legal[k * 7 + o]) max = Math.max(max, a);
  }
  let sum = 0;
  for (let o = 0; o < 7; o++) sum += p[o] = legal[k * 7 + o] ? Math.exp(z[o] - max) : 0;
  for (let o = 0; o < 7; o++) p[o] /= sum;
}

/** Adds sample k's gradient of the cross-entropy to G; returns the loss. */
function backward(k: number): number {
  forward(k);
  let loss = 0;
  d2.fill(0);
  for (let o = 0; o < 7; o++) {
    if (!legal[k * 7 + o]) continue;
    const t = T[k * 7 + o];
    if (t > 0) loss -= t * Math.log(p[o] + 1e-12);
    const dz = p[o] - t;
    G[at.b3 + o] += dz;
    for (let i = 0; i < H2; i++) {
      G[at.w3 + o * H2 + i] += dz * h2[i];
      if (a2[i] > 0) d2[i] += dz * P[at.w3 + o * H2 + i];
    }
  }
  d1.fill(0);
  for (let j = 0; j < H2; j++) {
    if (d2[j] === 0) continue;
    G[at.b2 + j] += d2[j];
    for (let i = 0; i < H1; i++) {
      G[at.w2 + j * H1 + i] += d2[j] * h1[i];
      d1[i] += d2[j] * P[at.w2 + j * H1 + i];
    }
  }
  const x = k * INPUTS;
  for (let i = 0; i < H1; i++) {
    if (a1[i] <= 0) continue;
    G[at.b1 + i] += d1[i];
    for (let c = 0; c < INPUTS; c++) G[at.w1 + i * INPUTS + c] += d1[i] * X[x + c];
  }
  return loss;
}

let step = 0;
function adam(batch: number) {
  step++;
  const [b1, b2, eps] = [0.9, 0.999, 1e-8];
  const c1 = 1 - b1 ** step, c2 = 1 - b2 ** step;
  for (let i = 0; i < total; i++) {
    const g = G[i] / batch;
    M[i] = b1 * M[i] + (1 - b1) * g;
    V[i] = b2 * V[i] + (1 - b2) * g * g;
    P[i] -= (RATE * (M[i] / c1)) / (Math.sqrt(V[i] / c2) + eps);
  }
  G.fill(0);
}

// --- Checking it ---------------------------------------------------------------------------------
/** On held-out positions: how often `pick` plays Minimax's move. */
function check(pick: (k: number) => number) {
  const same = held.filter((k) => pick(k) === rows[k].move).length;
  return `Minimax's move ${((100 * same) / held.length).toFixed(1)}%`;
}
const argmax = (k: number) => {
  let b = -1;
  for (let o = 0; o < 7; o++) if (legal[k * 7 + o] && (b < 0 || p[o] > p[b])) b = o;
  return b;
};
const randomPick = (k: number) => {
  const ls = [0, 1, 2, 3, 4, 5, 6].filter((o) => legal[k * 7 + o]);
  return ls[Math.floor(rng() * ls.length)];
};
console.log(
  `${n} positions: ${train.length} to train on, ${held.length} held out; ${INPUTS}-${H1}-${H2}-7, ${total} weights`,
);
console.log(`a random legal move: ${check(randomPick)}`);

const started = performance.now();
for (let epoch = 1; epoch <= EPOCHS; epoch++) {
  for (let k = train.length - 1; k > 0; k--) {
    const j = Math.floor(rng() * (k + 1));
    [train[k], train[j]] = [train[j], train[k]];
  }
  let loss = 0;
  for (let b = 0; b < train.length; b += BATCH) {
    const end = Math.min(b + BATCH, train.length);
    for (let t = b; t < end; t++) loss += backward(train[t]);
    adam(end - b);
  }
  const secs = ((performance.now() - started) / 1000).toFixed(0);
  const heldOut = check((k) => (forward(k), argmax(k)));
  console.log(`epoch ${epoch}: train loss ${(loss / train.length).toFixed(4)}; held out: ${heldOut} (${secs} s)`);
}

// --- Writing the weights --------------------------------------------------------------------------
const r5 = (v: number) => Math.round(v * 1e5) / 1e5;
const rowsOf = (o: number, rowsN: number, cols: number) =>
  Array.from({ length: rowsN }, (_, j) => Array.from(P.subarray(o + j * cols, o + (j + 1) * cols), r5));
const weights: PolicyWeights = {
  w1: rowsOf(at.w1, H1, INPUTS),
  b1: Array.from(P.subarray(at.b1, at.b1 + H1), r5),
  w2: rowsOf(at.w2, H2, H1),
  b2: Array.from(P.subarray(at.b2, at.b2 + H2), r5),
  w3: rowsOf(at.w3, 7, H2),
  b3: Array.from(P.subarray(at.b3, at.b3 + 7), r5),
};
// The rounded weights, checked the way the bot will run them.
const net = new PolicyNet(weights);
console.log(`rounded, as the bot runs it: ${
  check((k) => {
    const r = rows[k], s = state(r);
    const pits = r.toMove === 1 ? [0, 1, 2, 3, 4, 5, 6] : [7, 8, 9, 10, 11, 12, 13];
    return pits.indexOf(net.choose(s)!);
  })
}`);
writeFileSync(
  new URL("../../src/bots/judges/policy-weights.ts", import.meta.url),
  `/** Intuition's policy net (${INPUTS}-${H1}-${H2}-7), as lab/learn/train-policy.ts wrote it from ${n} positions. Generated: don't edit. */\n` +
    `import type { PolicyWeights } from "./policy.ts";\n\n// dprint-ignore\nexport const POLICY_WEIGHTS: PolicyWeights = ${
      JSON.stringify(weights)
    };\n`,
);
console.log("wrote src/bots/judges/policy-weights.ts");
