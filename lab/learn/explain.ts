/**
 * What the learned bot's value net has learned, in readable terms. Three views, on positions from
 * data.ts:
 *
 *   1. Seed values: in real positions, put one more seed in a pit (or a store) and see how far the
 *      net's opinion moves. Averaged, it's what a seed there is worth to the side to move.
 *   2. A formula: the plain weighted sum of a few readable pieces (store lead, seeds on each side,
 *      free turns set up, seeds exposed, captures threatened) that best matches the net, and how
 *      much of the net it explains.
 *   3. Rules: a small decision tree that imitates the net's verdict (winning or losing), printed as
 *      if/then rules, with how often it agrees with the net and with Minimax.
 *
 *   node lab/learn/explain.ts data/learn/positions.jsonl
 *
 * The net's opinion is read before its final squash (atanh of its value), where effects add up.
 */
import { readFileSync } from "node:fs";
import { exposed, freeTurnsReady, threats } from "../../src/bots/search/evaluate.ts";
import { ValueNet } from "../../src/bots/search/net.ts";
import { WEIGHTS } from "../../src/bots/search/weights.ts";
import { other } from "../../src/game/engine.ts";
import { DEFAULT_RULES, type GameState, type Player } from "../../src/game/types.ts";

const file = process.argv[2];
if (!file) {
  console.error("Usage: node lab/learn/explain.ts <positions.jsonl>");
  process.exit(1);
}
type Row = { pits: number[]; toMove: Player; score: number };
const rows: Row[] = readFileSync(file, "utf8").trim().split("\n").map((l) => JSON.parse(l));
const net = new ValueNet(WEIGHTS);
const state = (pits: number[], current: Player): GameState => ({
  rules: DEFAULT_RULES,
  pits,
  current,
  gameOver: false,
});
const logit = (s: GameState) => Math.atanh(Math.max(-0.999999, Math.min(0.999999, net.value(s))));
const pct = (x: number) => `${(100 * x).toFixed(1)}%`;

/** Pits from the mover's side: their own 7 in sowing order, then the opponent's 7. */
const sides = (r: Row) => {
  const [mine, theirs] = r.toMove === 1 ? [0, 7] : [7, 0];
  return {
    mine: r.pits.slice(mine, mine + 7),
    theirs: r.pits.slice(theirs, theirs + 7),
    myStore: r.pits[r.toMove === 1 ? 14 : 15],
    theirStore: r.pits[r.toMove === 1 ? 15 : 14],
  };
};

// --- 1. Seed values ------------------------------------------------------------------------------
console.log("1. WHAT A SEED IS WORTH, to the side to move (change in the net's opinion, one seed added)\n");
const SAMPLE = rows.slice(0, 20000);
const slots: [string, (r: Row) => number][] = [];
for (let k = 0; k < 7; k++) {
  slots.push([`your pit ${k + 1} (${7 - k} from your store)`, (r) => (r.toMove === 1 ? k : 7 + k)]);
}
slots.push(["your store", (r) => (r.toMove === 1 ? 14 : 15)]);
for (let k = 0; k < 7; k++) {
  slots.push([`their pit ${k + 1} (${7 - k} from their store)`, (r) => (r.toMove === 1 ? 7 + k : k)]);
}
slots.push(["their store", (r) => (r.toMove === 1 ? 15 : 14)]);
const unit = (() => {
  // One seed banked in your own store, in the same units, to compare against.
  let sum = 0;
  for (const r of SAMPLE) {
    const s = state(r.pits, r.toMove), at = r.toMove === 1 ? 14 : 15;
    const more = [...r.pits];
    more[at]++;
    sum += logit(state(more, r.toMove)) - logit(s);
  }
  return sum / SAMPLE.length;
})();
for (const [name, slot] of slots) {
  let sum = 0;
  for (const r of SAMPLE) {
    const more = [...r.pits];
    more[slot(r)]++;
    sum += logit(state(more, r.toMove)) - logit(state(r.pits, r.toMove));
  }
  const v = sum / SAMPLE.length / unit;
  console.log(`  ${name.padEnd(30)} ${v >= 0 ? "+" : ""}${v.toFixed(2)} of a banked seed`);
}

// --- 2. A formula --------------------------------------------------------------------------------
console.log("\n2. A FORMULA that imitates the net (least squares on its opinion)\n");
const pieces: [string, (s: GameState, r: Row) => number][] = [
  ["store lead (yours minus theirs)", (_s, r) => sides(r).myStore - sides(r).theirStore],
  ["seeds on your side", (_s, r) => sides(r).mine.reduce((a, b) => a + b, 0)],
  ["seeds on their side", (_s, r) => sides(r).theirs.reduce((a, b) => a + b, 0)],
  ["your free turns set up", (s, r) => freeTurnsReady(s, r.toMove)],
  ["their free turns set up", (s, r) => freeTurnsReady(s, other(r.toMove))],
  ["your seeds exposed to capture", (s, r) => exposed(s, r.toMove)],
  ["their seeds exposed to capture", (s, r) => exposed(s, other(r.toMove))],
];
const N = 40000, F = pieces.length + 1;
const A: number[][] = [], y: number[] = [];
for (const r of rows.slice(0, N)) {
  const s = state(r.pits, r.toMove);
  A.push([1, ...pieces.map(([, f]) => f(s, r))]);
  y.push(logit(s));
}
// Normal equations, solved by Gaussian elimination.
const M = Array.from({ length: F }, (_, i) =>
  Array.from({ length: F + 1 }, (_, j) => {
    let t = 0;
    for (let k = 0; k < A.length; k++) t += A[k][i] * (j < F ? A[k][j] : y[k]);
    return t;
  }));
for (let c = 0; c < F; c++) {
  let p = c;
  for (let r = c + 1; r < F; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
  [M[c], M[p]] = [M[p], M[c]];
  for (let r = 0; r < F; r++) {
    if (r === c) continue;
    const f = M[r][c] / M[c][c];
    for (let j = c; j <= F; j++) M[r][j] -= f * M[c][j];
  }
}
const beta = M.map((row, i) => row[F] / row[i]);
const fit = A.map((x) => x.reduce((a, v, i) => a + v * beta[i], 0));
const mean = y.reduce((a, b) => a + b, 0) / y.length;
const r2 = 1 - y.reduce((a, v, k) => a + (v - fit[k]) ** 2, 0) / y.reduce((a, v) => a + (v - mean) ** 2, 0);
const lead = beta[1];
console.log(`  In units of one seed of store lead (so the lead's weight is 1):`);
pieces.forEach(([name], i) =>
  console.log(`    ${(beta[i + 1] / lead >= 0 ? "+" : "") + (beta[i + 1] / lead).toFixed(2)} × ${name}`)
);
console.log(
  `    ${
    (beta[0] / lead >= 0 ? "+" : "") + (beta[0] / lead).toFixed(2)
  } (a constant: the value of simply being the side to move)`,
);
const agree = A.reduce((a, _x, k) => a + (Math.sign(fit[k]) === Math.sign(y[k]) ? 1 : 0), 0);
console.log(
  `  It explains ${pct(r2)} of the net's opinion, and agrees with its verdict ${pct(agree / A.length)} of the time.`,
);

// --- 3. Rules ------------------------------------------------------------------------------------
console.log("\n3. RULES: a small decision tree imitating the net's verdict (winning or losing)\n");
type Feature = [string, (r: Row, s: GameState) => number];
const feats: Feature[] = [
  ["store lead", (r) => sides(r).myStore - sides(r).theirStore],
  ["your seeds on board", (r) => sides(r).mine.reduce((a, b) => a + b, 0)],
  ["their seeds on board", (r) => sides(r).theirs.reduce((a, b) => a + b, 0)],
  ["your store", (r) => sides(r).myStore],
  ["their store", (r) => sides(r).theirStore],
  ["your free turns set up", (r, s) => freeTurnsReady(s, r.toMove)],
  ["their free turns set up", (r, s) => freeTurnsReady(s, other(r.toMove))],
  ["your exposed seeds", (r, s) => exposed(s, r.toMove)],
  ["their exposed seeds", (r, s) => exposed(s, other(r.toMove))],
  ["captures you threaten", (r, s) => threats(s, r.toMove)],
];
const T = rows.slice(0, 60000).map((r) => {
  const s = state(r.pits, r.toMove);
  return {
    x: feats.map(([, f]) => f(r, s)),
    net: net.value(s) > 0 ? 1 : 0,
    mm: r.score > 0 ? 1 : r.score < 0 ? 0 : -1,
  };
});
type Node = { leaf: true; label: number; n: number; purity: number } | {
  leaf: false;
  f: number;
  t: number;
  lo: Node;
  hi: Node;
};
const gini = (a: number, n: number) => (n === 0 ? 0 : 1 - (a / n) ** 2 - ((n - a) / n) ** 2);
function grow(idx: number[], depth: number): Node {
  const wins = idx.reduce((a, i) => a + T[i].net, 0);
  const label = wins * 2 >= idx.length ? 1 : 0;
  const purity = Math.max(wins, idx.length - wins) / idx.length;
  if (depth === 0 || purity > 0.97 || idx.length < 400) return { leaf: true, label, n: idx.length, purity };
  let best = { g: gini(wins, idx.length), f: -1, t: 0 };
  for (let f = 0; f < feats.length; f++) {
    const vals = [...new Set(idx.map((i) => T[i].x[f]))].sort((a, b) => a - b);
    const step = Math.max(1, Math.floor(vals.length / 40));
    for (let v = 0; v < vals.length - 1; v += step) {
      const t = vals[v];
      let nl = 0, wl = 0;
      for (const i of idx) if (T[i].x[f] <= t) [nl, wl] = [nl + 1, wl + T[i].net];
      const nr = idx.length - nl, wr = wins - wl;
      if (nl < 100 || nr < 100) continue;
      const g = (nl * gini(wl, nl) + nr * gini(wr, nr)) / idx.length;
      if (g < best.g) best = { g, f, t };
    }
  }
  if (best.f < 0) return { leaf: true, label, n: idx.length, purity };
  return {
    leaf: false,
    f: best.f,
    t: best.t,
    lo: grow(idx.filter((i) => T[i].x[best.f] <= best.t), depth - 1),
    hi: grow(idx.filter((i) => T[i].x[best.f] > best.t), depth - 1),
  };
}
const tree = grow(T.map((_, i) => i), 4);
const verdict = (n: Node, x: number[]): number => (n.leaf ? n.label : verdict(x[n.f] <= n.t ? n.lo : n.hi, x));
function print(n: Node, pad: string) {
  if (n.leaf) {
    console.log(
      `${pad}→ ${n.label ? "WINNING" : "LOSING"} for the side to move (${n.n} positions, ${pct(n.purity)} sure)`,
    );
    return;
  }
  console.log(`${pad}if ${feats[n.f][0]} ≤ ${n.t}:`);
  print(n.lo, pad + "    ");
  console.log(`${pad}else (${feats[n.f][0]} > ${n.t}):`);
  print(n.hi, pad + "    ");
}
print(tree, "  ");
const withNet = T.reduce((a, r) => a + (verdict(tree, r.x) === r.net ? 1 : 0), 0);
const decided = T.filter((r) => r.mm >= 0);
const withMm = decided.reduce((a, r) => a + (verdict(tree, r.x) === r.mm ? 1 : 0), 0);
const netMm = decided.reduce((a, r) => a + (r.net === r.mm ? 1 : 0), 0);
console.log(
  `\n  The rules agree with the net ${pct(withNet / T.length)} of the time, and with Minimax ${
    pct(withMm / decided.length)
  }`,
);
console.log(`  (the net itself agrees with Minimax ${pct(netMm / decided.length)}).`);
