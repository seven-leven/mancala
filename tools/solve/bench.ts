/** Times the solver on a few hard boards: node tools/solve/bench.ts */
import { newBoard, solve } from "./solver.ts";
for (const [n, s] of [[7, 3], [6, 4], [8, 2], [6, 5], [5, 9]]) {
  const t = performance.now(), r = solve(newBoard(n, s), 30_000_000);
  console.log(`${n}×${s}: ${r.lo}..${r.hi}, ${r.nodes} positions, ${((performance.now() - t) / 1000).toFixed(1)} s`);
}
