/**
 * Trains the learned bot's value net (src/bots/search/net.ts) on positions from data.ts, and writes
 * its weights to src/bots/search/weights.ts.
 *
 *   node tools/learn/train.ts data/learn/positions.jsonl [epochs, default 20] [hidden sizes, default 64,64]
 *
 * The target for each position: +1 or -1 where Minimax sees a forced win or loss, otherwise its
 * score squashed to tanh(score / 10). Mean squared error, Adam, batches of 256, 10% of positions
 * held out to check it. Seeded throughout, so the same data gives the same weights.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { evaluate, WIN } from "../../src/bots/search/evaluate.ts";
import { encode, INPUTS, ValueNet, type Weights } from "../../src/bots/search/net.ts";
import { DEFAULT_RULES, type GameState, type Player } from "../../src/game/types.ts";
import { seeded } from "../match.ts";

const [file, epochsArg, sizesArg] = process.argv.slice(2);
if (!file) {
  console.error("Usage: node tools/learn/train.ts <positions.jsonl> [epochs]");
  process.exit(1);
}
const EPOCHS = Number(epochsArg ?? 20), BATCH = 256, RATE = 1e-3;
const [H1, H2] = (sizesArg ?? "64,64").split(",").map(Number);
const rng = seeded(2026);

// --- Data -------------------------------------------------------------------------------------
type Row = { pits: number[]; toMove: Player; score: number };
const rows: Row[] = readFileSync(file, "utf8").trim().split("\n").map((l) => JSON.parse(l));
const target = (score: number) => (score >= WIN ? 1 : score <= -WIN ? -1 : Math.tanh(score / 10));
const state = (r: Row): GameState => ({ rules: DEFAULT_RULES, pits: r.pits, current: r.toMove, gameOver: false });
const n = rows.length;
const X = new Float64Array(n * INPUTS), Y = new Float64Array(n);
rows.forEach((r, k) => {
  X.set(encode(state(r)), k * INPUTS);
  Y[k] = target(r.score);
});
const order = Array.from({ length: n }, (_, k) => k);
for (let k = n - 1; k > 0; k--) {
  const j = Math.floor(rng() * (k + 1));
  [order[k], order[j]] = [order[j], order[k]];
}
const held = order.slice(0, Math.floor(n / 10)), train = order.slice(Math.floor(n / 10));

// --- The net, flat, with Adam's moments for each parameter ---------------------------------------
const sizes = { w1: H1 * INPUTS, b1: H1, w2: H2 * H1, b2: H2, w3: H2, b3: 1 };
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
const d2 = new Float64Array(H2), d1 = new Float64Array(H1);

/** Forward pass for sample k; leaves the activations in a1, h1, a2, h2 and returns the output. */
function forward(k: number): number {
  const x = k * INPUTS;
  for (let j = 0; j < H1; j++) {
    let a = P[at.b1 + j];
    for (let i = 0; i < INPUTS; i++) a += P[at.w1 + j * INPUTS + i] * X[x + i];
    a1[j] = a;
    h1[j] = a > 0 ? a : 0;
  }
  let out = P[at.b3];
  for (let j = 0; j < H2; j++) {
    let a = P[at.b2 + j];
    for (let i = 0; i < H1; i++) a += P[at.w2 + j * H1 + i] * h1[i];
    a2[j] = a;
    h2[j] = a > 0 ? a : 0;
    out += P[at.w3 + j] * h2[j];
  }
  return Math.tanh(out);
}

/** Adds sample k's gradient of the squared error to G. */
function backward(k: number, y: number): number {
  const v = forward(k);
  const dOut = 2 * (v - Y[k]) * (1 - v * v);
  G[at.b3] += dOut;
  for (let j = 0; j < H2; j++) {
    G[at.w3 + j] += dOut * h2[j];
    d2[j] = a2[j] > 0 ? dOut * P[at.w3 + j] : 0;
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
  return (v - y) ** 2;
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
/** Held-out error, and how often the sign is right: on forced positions, and on every decided one. */
function check(value: (k: number) => number) {
  let se = 0, forced = 0, forcedRight = 0, decided = 0, right = 0;
  for (const k of held) {
    const v = value(k);
    se += (v - Y[k]) ** 2;
    if (Y[k] === 0) continue;
    decided++;
    if (Math.sign(v) === Math.sign(Y[k])) right++;
    if (Math.abs(Y[k]) === 1) {
      forced++;
      if (Math.sign(v) === Math.sign(Y[k])) forcedRight++;
    }
  }
  const pct = (a: number, b: number) => `${((100 * a) / b).toFixed(1)}%`;
  return `error ${(se / held.length).toFixed(4)}, sign right ${pct(right, decided)} (forced ${
    pct(forcedRight, forced)
  })`;
}
const baseline = (k: number) => {
  const r = rows[k];
  return Math.tanh(evaluate(state(r), r.toMove) / 10);
};
console.log(
  `${n} positions: ${train.length} to train on, ${held.length} held out; ${INPUTS}-${H1}-${H2}-1, ${total} weights`,
);
console.log(`Minimax's evaluation alone (no search): ${check(baseline)}`);

const started = performance.now();
for (let epoch = 1; epoch <= EPOCHS; epoch++) {
  for (let k = train.length - 1; k > 0; k--) {
    const j = Math.floor(rng() * (k + 1));
    [train[k], train[j]] = [train[j], train[k]];
  }
  let loss = 0;
  for (let b = 0; b < train.length; b += BATCH) {
    const end = Math.min(b + BATCH, train.length);
    for (let t = b; t < end; t++) loss += backward(train[t], Y[train[t]]);
    adam(end - b);
  }
  const secs = ((performance.now() - started) / 1000).toFixed(0);
  console.log(
    `epoch ${epoch}: train error ${(loss / train.length).toFixed(4)}; held out: ${check(forward)} (${secs} s)`,
  );
}

// --- Writing the weights --------------------------------------------------------------------------
const r5 = (v: number) => Math.round(v * 1e5) / 1e5;
const rowsOf = (o: number, rowsN: number, cols: number) =>
  Array.from({ length: rowsN }, (_, j) => Array.from(P.subarray(o + j * cols, o + (j + 1) * cols), r5));
const weights: Weights = {
  w1: rowsOf(at.w1, H1, INPUTS),
  b1: Array.from(P.subarray(at.b1, at.b1 + H1), r5),
  w2: rowsOf(at.w2, H2, H1),
  b2: Array.from(P.subarray(at.b2, at.b2 + H2), r5),
  w3: Array.from(P.subarray(at.w3, at.w3 + H2), r5),
  b3: r5(P[at.b3]),
};
// The rounded weights, checked the way the bot will run them.
const net = new ValueNet(weights);
console.log(`rounded, as the bot runs it: ${check((k) => net.value(state(rows[k])))}`);
writeFileSync(
  new URL("../../src/bots/search/weights.ts", import.meta.url),
  `/** The learned bot's value net, as tools/learn/train.ts wrote it from ${n} positions. Generated: don't edit. */\n` +
    `import type { Weights } from "./net.ts";\n\n// dprint-ignore\nexport const WEIGHTS: Weights = ${
      JSON.stringify(weights)
    };\n`,
);
console.log("wrote src/bots/search/weights.ts");
