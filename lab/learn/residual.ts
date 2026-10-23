/**
 * Where a readable formula falls short of the learned net, and what recovers it. Builds a table of
 * readable features for each position (from the mover's side), fits the net's opinion (atanh of its
 * value) with a few nested sets of features, and fits a small regression tree to what the first
 * formula leaves over, printing the situations where it goes most wrong.
 *
 *   node lab/learn/residual.ts data/learn/positions.jsonl
 */
import { readFileSync, writeFileSync } from "node:fs";
import { exposed, freeTurnsReady } from "../../src/bots/search/evaluate.ts";
import { Boards, playOn } from "../../src/bots/search/moves.ts";
import { ValueNet } from "../../src/bots/search/net.ts";
import { WEIGHTS } from "../../src/bots/search/weights.ts";
import { FREE_TURN, other, validMoves } from "../../src/game/engine.ts";
import { DEFAULT_RULES, type GameState, type Player } from "../../src/game/types.ts";

type Row = { pits: number[]; toMove: Player; score: number };
const rows: Row[] = readFileSync(process.argv[2], "utf8").trim().split("\n").slice(0, 60000).map((l) => JSON.parse(l));
const net = new ValueNet(WEIGHTS);
const state = (pits: number[], current: Player): GameState => ({
  rules: DEFAULT_RULES,
  pits,
  current,
  gameOver: false,
});
const logit = (s: GameState) => Math.atanh(Math.max(-0.999999, Math.min(0.999999, net.value(s))));
const boards = new Boards();

/** The most `who` can bank with one move from `s` (a free turn adds the best follow-up, one deep). */
function bestGain(s: GameState, who: Player): number {
  const t = s.current === who ? s : { ...s, current: who };
  const store = who === 1 ? 14 : 15;
  let best = 0;
  for (const m of validMoves(t)) {
    const b = boards.at(0, t);
    const flags = playOn(b, t, m);
    let gain = b.pits[store] - t.pits[store];
    if (flags & FREE_TURN && !b.gameOver) {
      let more = 0;
      for (const m2 of validMoves(b)) {
        const c = boards.at(1, b);
        playOn(c, b, m2);
        more = Math.max(more, c.pits[store] - b.pits[store]);
      }
      gain += more;
    }
    best = Math.max(best, gain);
  }
  return best;
}

/** Readable features, from the mover's side. */
export const FEATURES: [string, (s: GameState) => number][] = [
  ["store lead", (s) => s.pits[s.current === 1 ? 14 : 15] - s.pits[s.current === 1 ? 15 : 14]],
  ["seeds still in play", (s) => 98 - s.pits[14] - s.pits[15]],
  ["your free turns set up", (s) => freeTurnsReady(s, s.current)],
  ["their free turns set up", (s) => freeTurnsReady(s, other(s.current))],
  ["your seeds exposed", (s) => exposed(s, s.current)],
  ["their seeds exposed", (s) => exposed(s, other(s.current))],
  // What the formula is missing, by hypothesis:
  ["their danger: banked over 40", (s) => Math.max(0, s.pits[s.current === 1 ? 15 : 14] - 40)],
  ["your strength: banked over 40", (s) => Math.max(0, s.pits[s.current === 1 ? 14 : 15] - 40)],
  [
    "lead × share of seeds banked",
    (s) => (s.pits[s.current === 1 ? 14 : 15] - s.pits[s.current === 1 ? 15 : 14]) * (s.pits[14] + s.pits[15]) / 98,
  ],
  ["your best gain this move", (s) => bestGain(s, s.current)],
  ["their best gain next move", (s) => bestGain(s, other(s.current))],
  [
    "your seeds on side",
    (s) => (s.current === 1 ? [0, 1, 2, 3, 4, 5, 6] : [7, 8, 9, 10, 11, 12, 13]).reduce((a, i) => a + s.pits[i], 0),
  ],
  [
    "you are short of seeds (under 6 on your side)",
    (s) =>
      Math.max(
        0,
        6 - (s.current === 1 ? [0, 1, 2, 3, 4, 5, 6] : [7, 8, 9, 10, 11, 12, 13]).reduce((a, i) => a + s.pits[i], 0),
      ),
  ],
  [
    "they are short of seeds (under 6 on their side)",
    (s) =>
      Math.max(
        0,
        6 - (s.current === 1 ? [7, 8, 9, 10, 11, 12, 13] : [0, 1, 2, 3, 4, 5, 6]).reduce((a, i) => a + s.pits[i], 0),
      ),
  ],
];

const X = rows.map((r) => FEATURES.map(([, f]) => f(state(r.pits, r.toMove))));
const y = rows.map((r) => logit(state(r.pits, r.toMove)));

/** Least squares on the chosen feature columns (plus a constant): weights, R², and verdicts matched. */
function fit(cols: number[]) {
  const F = cols.length + 1;
  const row = (k: number) => [1, ...cols.map((c) => X[k][c])];
  const M = Array.from({ length: F }, () => new Array<number>(F + 1).fill(0));
  for (let k = 0; k < X.length; k++) {
    const a = row(k);
    for (let i = 0; i < F; i++) {
      for (let j = 0; j < F; j++) M[i][j] += a[i] * a[j];
      M[i][F] += a[i] * y[k];
    }
  }
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
  const w = M.map((r, i) => r[F] / r[i]);
  const pred = X.map((_, k) => row(k).reduce((a, v, i) => a + v * w[i], 0));
  const mean = y.reduce((a, b) => a + b, 0) / y.length;
  const r2 = 1 - y.reduce((a, v, k) => a + (v - pred[k]) ** 2, 0) / y.reduce((a, v) => a + (v - mean) ** 2, 0);
  const agree = pred.reduce((a, p, k) => a + (Math.sign(p) === Math.sign(y[k]) ? 1 : 0), 0) / y.length;
  return { w, r2, agree, pred };
}

const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
const base = fit([0, 1, 2, 3, 4, 5]);
console.log(
  `The first formula (lead, seeds in play, free turns, exposed): explains ${pct(base.r2)}, verdicts ${
    pct(base.agree)
  }\n`,
);

// --- Where it goes wrong: a regression tree on what it leaves over -------------------------------------
const resid = y.map((v, k) => v - base.pred[k]);
type Node = { leaf: true; mean: number; n: number } | { leaf: false; f: number; t: number; lo: Node; hi: Node };
function grow(idx: number[], depth: number): Node {
  const mean = idx.reduce((a, i) => a + resid[i], 0) / idx.length;
  if (depth === 0 || idx.length < 1500) return { leaf: true, mean, n: idx.length };
  let best = { gain: 0, f: -1, t: 0 };
  const total = idx.reduce((a, i) => a + resid[i], 0);
  for (let f = 0; f < FEATURES.length; f++) {
    const vals = [...new Set(idx.map((i) => X[i][f]))].sort((a, b) => a - b);
    const step = Math.max(1, Math.floor(vals.length / 30));
    for (let v = 0; v < vals.length - 1; v += step) {
      let nl = 0, sl = 0;
      for (const i of idx) if (X[i][f] <= vals[v]) [nl, sl] = [nl + 1, sl + resid[i]];
      const nr = idx.length - nl;
      if (nl < 700 || nr < 700) continue;
      const gain = sl * sl / nl + (total - sl) ** 2 / nr - total * total / idx.length;
      if (gain > best.gain) best = { gain, f, t: vals[v] };
    }
  }
  if (best.f < 0) return { leaf: true, mean, n: idx.length };
  return {
    leaf: false,
    f: best.f,
    t: best.t,
    lo: grow(idx.filter((i) => X[i][best.f] <= best.t), depth - 1),
    hi: grow(idx.filter((i) => X[i][best.f] > best.t), depth - 1),
  };
}
const scale = base.w[1]; // the lead's weight: residuals in seeds of store lead
function show(n: Node, pad: string) {
  if (n.leaf) {
    const v = n.mean / scale;
    console.log(
      `${pad}→ the net is ${v >= 0 ? "more" : "less"} hopeful by ${Math.abs(v).toFixed(1)} seeds (${n.n} positions)`,
    );
    return;
  }
  console.log(`${pad}if ${FEATURES[n.f][0]} ≤ ${n.t}:`);
  show(n.lo, pad + "    ");
  console.log(`${pad}else:`);
  show(n.hi, pad + "    ");
}
console.log("Where the first formula goes wrong (the net minus the formula, in seeds of store lead):");
show(grow(X.map((_, i) => i), 3), "  ");

// --- What recovers it ------------------------------------------------------------------------------------
const steps: [string, number[]][] = [
  ["+ the clinch line (banked over 40)", [0, 1, 2, 3, 4, 5, 6, 7]],
  ["+ the lead counting more late", [0, 1, 2, 3, 4, 5, 6, 7, 8]],
  ["+ gains available now (yours, then theirs)", [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]],
  ["+ running short of seeds", [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]],
];
console.log("\nAdding pieces, one group at a time:");
let last = base;
for (const [name, cols] of steps) {
  last = fit(cols);
  console.log(`  ${name.padEnd(46)} explains ${pct(last.r2)}, verdicts ${pct(last.agree)}`);
}
const all = steps.at(-1)![1];
console.log("\nThe richest formula, in seeds of store lead:");
all.forEach((c, i) =>
  console.log(
    `  ${(last.w[i + 1] / last.w[1] >= 0 ? "+" : "") + (last.w[i + 1] / last.w[1]).toFixed(3)} × ${FEATURES[c][0]}`,
  )
);
console.log(`  ${(last.w[0] / last.w[1] >= 0 ? "+" : "") + (last.w[0] / last.w[1]).toFixed(3)} (constant)`);
writeFileSync("data/learn/rich-weights.json", JSON.stringify({ cols: all, w: last.w.map((v) => v / last.w[1]) }));

// Without the gains, which cost a search's worth of moves to compute and add almost nothing.
const cheap = [0, 1, 2, 3, 4, 5, 6, 7, 8, 11, 12, 13];
const c = fit(cheap);
console.log(`\nWithout the gains (cheap enough for a search): explains ${pct(c.r2)}, verdicts ${pct(c.agree)}`);
cheap.forEach((col, i) =>
  console.log(`  ${(c.w[i + 1] >= 0 ? "+" : "") + c.w[i + 1].toFixed(4)} × ${FEATURES[col][0]}`)
);
console.log(`  ${(c.w[0] >= 0 ? "+" : "") + c.w[0].toFixed(4)} (constant)`);
writeFileSync("data/learn/cheap-weights.json", JSON.stringify({ cols: cheap, w: c.w }));
