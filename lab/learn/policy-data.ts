/**
 * Training data for Intuition, the policy net (src/bots/search/policy.ts): the positions data.ts
 * made, each with the move Minimax plays there, so the net can learn which move to play.
 *
 *   node lab/learn/policy-data.ts data/learn/positions.jsonl [positions, default 40000] [depth, default 5] [workers, default 4] > data/learn/policy.jsonl
 *
 * A line: {"pits":[...16],"toMove":1,"move":3}: the move as 0–6, the mover's pits in sowing order
 * (their first pit first). Only the best move is searched for, not every move's exact score, so
 * alpha-beta prunes as usual. Light on the machine: a few workers at low priority, and the search's
 * table shrunk back after every position so one big search doesn't hold its memory.
 */
import { readFileSync } from "node:fs";
import { constants, setPriority } from "node:os";
import { isMainThread, parentPort, Worker, workerData } from "node:worker_threads";
import { search, shrinkTable } from "../../src/bots/search/minimax.ts";
import { pitsOf } from "../../src/game/engine.ts";
import { DEFAULT_RULES, type GameState, type Player } from "../../src/game/types.ts";

type Row = { pits: number[]; toMove: Player };

if (isMainThread) {
  const [file, countArg, depthArg, workersArg] = process.argv.slice(2);
  const rows = readFileSync(file, "utf8").trim().split("\n").slice(0, Number(countArg ?? 40_000));
  const depth = Number(depthArg ?? 5), workers = Number(workersArg ?? 4);
  setPriority(constants.priority.PRIORITY_BELOW_NORMAL);
  const started = performance.now();
  let done = 0;
  await Promise.all(Array.from({ length: workers }, (_, k) =>
    new Promise<void>((resolve, reject) => {
      const mine = rows.filter((_, i) => i % workers === k);
      const w = new Worker(new URL(import.meta.url), { workerData: { rows: mine, depth } });
      w.on("message", (lines: string) => {
        process.stdout.write(lines);
        done += lines.split("\n").length - 1;
        const secs = (performance.now() - started) / 1000;
        process.stderr.write(`\r${done} of ${rows.length} positions, ${secs.toFixed(0)} s`);
      });
      w.once("error", reject);
      w.once("exit", () => resolve());
    })));
  process.stderr.write(`\n${done} positions in ${((performance.now() - started) / 1000).toFixed(0)} s\n`);
} else {
  const { rows, depth } = workerData as { rows: string[]; depth: number };
  let batch: string[] = [];
  for (const line of rows) {
    const { pits, toMove } = JSON.parse(line) as Row;
    const s: GameState = { rules: DEFAULT_RULES, pits, current: toMove, gameOver: false };
    const { move } = search(s, { depth });
    shrinkTable();
    batch.push(JSON.stringify({ pits, toMove, move: pitsOf(toMove).indexOf(move!) }));
    if (batch.length === 100) {
      parentPort!.postMessage(batch.join("\n") + "\n");
      batch = [];
    }
  }
  if (batch.length) parentPort!.postMessage(batch.join("\n") + "\n");
}
