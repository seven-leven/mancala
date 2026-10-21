/**
 * Solves the game for every board from 1 to 10 pits a side and 1 to 10 seeds a pit (the standard
 * game is 7 and 7): the first player's margin with best play by both, or the bounds proved when a
 * board is too big for the budget. Results go to data/solve/grid.json as they come, and a rerun
 * skips boards already done at that budget or more. docs/images/solved-boards.svg draws them.
 *
 *   node tools/solve/grid.ts [--budget 25000000] [--workers 4] [--bits 25] [--boards 10x2,8x6] [--save]
 *
 * One board at a time, on all the workers (parallel.ts), at low priority. The memo is 2^bits
 * entries of 8 bytes (25: 256 MB), shared. --save keeps each unsolved board's memo in
 * data/solve/memo/, so the next run carries on from it instead of starting over.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { constants, setPriority } from "node:os";
import { solveParallel } from "./parallel.ts";
import { newBoard } from "./solver.ts";

export interface Cell {
  pits: number;
  seeds: number;
  lo: number;
  hi: number;
  move: number | null;
  nodes: number;
  budget: number;
  ms: number;
}

const OUT = "data/solve/grid.json";
const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i < 0 ? undefined : args[i + 1];
};
const budget = Number(flag("budget") ?? 25_000_000);
const workers = Number(flag("workers") ?? 4);
const bits = Number(flag("bits") ?? 25);
const save = args.includes("--save");
const only = flag("boards")?.split(",").map((b) => b.split("x").map(Number));

setPriority(constants.priority.PRIORITY_BELOW_NORMAL);
mkdirSync("data/solve", { recursive: true });
const cells: Cell[] = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : [];
const done = (p: number, s: number) =>
  cells.some((c) => c.pits === p && c.seeds === s && (c.lo === c.hi || c.budget >= budget));
// Smallest boards first: they're quick, and the big ones fill in as the budget allows.
const queue: [number, number][] = [];
for (let p = 1; p <= 10; p++) {
  for (let s = 1; s <= 10; s++) {
    if (only ? only.some(([a, b]) => a === p && b === s) : !done(p, s)) queue.push([p, s]);
  }
}
queue.sort((a, b) => a[0] * a[1] - b[0] * b[1] || a[0] - b[0]);
const started = performance.now();
for (const [pits, seeds] of queue) {
  const t = performance.now();
  const file = save ? `data/solve/memo/${pits}x${seeds}.bin` : undefined;
  const r = await solveParallel(newBoard(pits, seeds), { budget, workers, bits, file });
  const c: Cell = { pits, seeds, ...r, budget, ms: Math.round(performance.now() - t) };
  const old = cells.findIndex((x) => x.pits === pits && x.seeds === seeds);
  // A rerun never loses ground: keep the tighter of the two results' bounds.
  if (old >= 0) {
    c.lo = Math.max(c.lo, cells[old].lo);
    c.hi = Math.min(c.hi, cells[old].hi);
    if (c.lo === c.hi) c.move ??= cells[old].move;
    cells[old] = c;
  } else cells.push(c);
  cells.sort((a, b) => a.pits - b.pits || a.seeds - b.seeds);
  writeFileSync(OUT, JSON.stringify(cells, null, 1));
  const what = c.lo === c.hi ? `margin ${c.lo}` : `between ${c.lo} and ${c.hi}`;
  const secs = ((performance.now() - started) / 1000).toFixed(0);
  console.log(`${pits} pits, ${seeds} seeds: ${what} (${c.nodes} positions, ${c.ms} ms) [${secs} s]`);
}
