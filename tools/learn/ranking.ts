/**
 * Recovering the net's logic where a search uses it: in comparisons between positions reachable
 * from the same one. For each root position, every line of one move and one reply gives a leaf;
 * the readable features and the net's opinion are both taken relative to the root's average leaf,
 * and the formula is fitted to those differences. Then: how often the formula picks the net's move.
 *
 *   node tools/learn/ranking.ts data/learn/positions.jsonl
 *   node tools/learn/ranking.ts data/learn/loser.jsonl     (the loser's net, from the loser's moves)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { exposed, freeTurnsReady } from "../../src/bots/search/evaluate.ts";
import { LOSER_WEIGHTS } from "../../src/bots/search/loser-weights.ts";
import { ValueNet } from "../../src/bots/search/net.ts";
import { WEIGHTS } from "../../src/bots/search/weights.ts";
import { other, playTurn, validMoves } from "../../src/game/engine.ts";
import { DEFAULT_RULES, type GameState, type Player } from "../../src/game/types.ts";

type Row = { pits: number[]; toMove: Player; score: number; q?: Player };
const all: Row[] = readFileSync(process.argv[2], "utf8").trim().split("\n").map((l) => JSON.parse(l));
/** A loser's positions: use the loser's net, at the loser's own moves. */
const LOSER = all[0].q !== undefined;
const roots = (LOSER ? all.filter((r) => r.toMove === r.q) : all).slice(0, 6000);
const net = new ValueNet(LOSER ? LOSER_WEIGHTS : WEIGHTS);
const state = (r: Row): GameState => ({ rules: DEFAULT_RULES, pits: r.pits, current: r.toMove, gameOver: false });
const side = (s: GameState, p: Player) => {
  const o = p === 1 ? 0 : 7;
  let n = 0;
  for (let i = 0; i < 7; i++) n += s.pits[o + i];
  return n;
};

/** Readable features of a leaf, from `me`'s side (the player choosing at the root). */
const FEATURES: [string, (s: GameState, me: Player) => number][] = [
  ["store lead", (s, me) => s.pits[me === 1 ? 14 : 15] - s.pits[me === 1 ? 15 : 14]],
  ["seeds on your side", (s, me) => side(s, me)],
  ["seeds on their side", (s, me) => side(s, other(me))],
  ["your free turns set up", (s, me) => freeTurnsReady(s, me)],
  ["their free turns set up", (s, me) => freeTurnsReady(s, other(me))],
  ["your seeds exposed", (s, me) => exposed(s, me)],
  ["their seeds exposed", (s, me) => exposed(s, other(me))],
  ["your empty pits", (s, me) => [0, 1, 2, 3, 4, 5, 6].filter((i) => s.pits[(me === 1 ? 0 : 7) + i] === 0).length],
  ["their empty pits", (s, me) => [0, 1, 2, 3, 4, 5, 6].filter((i) => s.pits[(me === 1 ? 7 : 0) + i] === 0).length],
  ["your banked over 40", (s, me) => Math.max(0, s.pits[me === 1 ? 14 : 15] - 40)],
  ["their banked over 40", (s, me) => Math.max(0, s.pits[me === 1 ? 15 : 14] - 40)],
  ["you are short of seeds (under 6)", (s, me) => Math.max(0, 6 - side(s, me))],
  ["they are short of seeds (under 6)", (s, me) => Math.max(0, 6 - side(s, other(me)))],
  [
    "your seeds in pits 5–7 (3 or fewer from your store)",
    (s, me) => [4, 5, 6].reduce((a, i) => a + s.pits[(me === 1 ? 0 : 7) + i], 0),
  ],
  ["their seeds in pits 5–7", (s, me) => [4, 5, 6].reduce((a, i) => a + s.pits[(me === 1 ? 7 : 0) + i], 0)],
];
/** The net's opinion of a leaf for `me`. */
const opinion = (s: GameState, me: Player) => {
  const clamp = (v: number) => Math.atanh(Math.max(-0.999999, Math.min(0.999999, v)));
  if (LOSER) return clamp(net.valueFor(s, me));
  const v = clamp(net.value(s));
  return s.current === me ? v : -v;
};

// Leaves: each of my moves, then each reply (a finished game is a leaf as it stands).
type Group = { moves: number[]; leaves: { move: number; x: number[]; y: number }[] };
const groups: Group[] = [];
for (const r of roots) {
  const s = state(r), me = s.current;
  const g: Group = { moves: validMoves(s), leaves: [] };
  for (const m of g.moves) {
    const a = playTurn(s, m, { record: false }).state;
    const replies = a.gameOver || a.current === me ? [null] : validMoves(a);
    for (const rep of replies) {
      const b = rep === null ? a : playTurn(a, rep, { record: false }).state;
      if (b.gameOver) continue;
      g.leaves.push({ move: m, x: FEATURES.map(([, f]) => f(b, me)), y: opinion(b, me) });
    }
  }
  if (g.leaves.length > 2) groups.push(g);
}

// Fit to differences from each root's average leaf.
const F = FEATURES.length;
const M = Array.from({ length: F }, () => new Array<number>(F + 1).fill(0));
for (const g of groups) {
  const mx = new Array<number>(F).fill(0);
  let my = 0;
  for (const l of g.leaves) {
    l.x.forEach((v, i) => (mx[i] += v / g.leaves.length));
    my += l.y / g.leaves.length;
  }
  for (const l of g.leaves) {
    const dx = l.x.map((v, i) => v - mx[i]), dy = l.y - my;
    for (let i = 0; i < F; i++) {
      for (let j = 0; j < F; j++) M[i][j] += dx[i] * dx[j];
      M[i][F] += dx[i] * dy;
    }
  }
}
for (let i = 0; i < F; i++) M[i][i] += 1e-6;
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
const w = M.map((row, i) => row[F] / row[i]);

// How often the formula picks the same move as the net (each move judged by its worst reply).
const pick = (g: Group, value: (l: Group["leaves"][number]) => number) => {
  let best = -1, bestV = -Infinity;
  for (const m of g.moves) {
    const ls = g.leaves.filter((l) => l.move === m);
    if (!ls.length) continue;
    const v = Math.min(...ls.map(value));
    if (v > bestV) [best, bestV] = [m, v];
  }
  return best;
};
const formula = (l: Group["leaves"][number]) => l.x.reduce((a, v, i) => a + v * w[i], 0);
const lead = (l: Group["leaves"][number]) => l.x[0] + 0.25 * (l.x[1] - l.x[2]);
let same = 0, sameLead = 0;
for (const g of groups) {
  const n = pick(g, (l) => l.y);
  if (pick(g, formula) === n) same++;
  if (pick(g, lead) === n) sameLead++;
}
const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
console.log(
  `${groups.length} positions, ${groups.reduce((a, g) => a + g.leaves.length, 0)} leaves (a move and a reply)\n`,
);
console.log(
  `Picks the net's move: Minimax's evaluation ${pct(sameLead / groups.length)}, the ranking formula ${
    pct(same / groups.length)
  }\n`,
);
console.log("The ranking formula, in seeds of store lead (what makes one reachable position better than another):");
FEATURES.forEach(([name], i) => console.log(`  ${(w[i] / w[0] >= 0 ? "+" : "") + (w[i] / w[0]).toFixed(2)} × ${name}`));
writeFileSync(
  LOSER ? "data/learn/loser-ranking-weights.json" : "data/learn/ranking-weights.json",
  JSON.stringify({ names: FEATURES.map(([n]) => n), w }),
);
