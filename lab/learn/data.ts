/**
 * Training data for the learned bot (TODO.md, "A learned bot"): positions from varied games, each
 * labelled with Minimax's score for the player to move. The net learns to predict that score.
 *
 *   node lab/learn/data.ts [positions, default 200000] > data/learn/positions.jsonl
 *
 * Games: DFS v2 on both sides, playing a random legal move some of the time (a different share
 * each game, 10–50%), from the rating harness's openings, so the positions cover strong and
 * scrappy play. Every position with a real choice (two or more moves) gets a line:
 * {"pits":[...16],"toMove":1,"score":12.25}, where score is Minimax's at depth 6 for the player to
 * move (at or past ±10000 is a forced win or loss). Seeded: the same count gives the same file.
 */
import { availableParallelism } from "node:os";
import { isMainThread, parentPort, Worker, workerData } from "node:worker_threads";
import { DfsReplyBot } from "../../src/bots/players/chain.ts";
import { search } from "../../src/bots/search/minimax.ts";
import { playTurn, validMoves } from "../../src/game/engine.ts";
import { P1, P2 } from "../../src/game/types.ts";
import { seeded } from "../../harness/match.ts";
import { opening } from "../../harness/rate/openings.ts";

const DEPTH = 6;

if (isMainThread) {
  const total = Number(process.argv[2] ?? 200_000);
  const workers = availableParallelism();
  const started = performance.now();
  let done = 0;
  await Promise.all(Array.from({ length: workers }, (_, k) =>
    new Promise<void>((resolve, reject) => {
      const share = Math.floor(total / workers) + (k < total % workers ? 1 : 0);
      const w = new Worker(new URL(import.meta.url), { workerData: { seed: 1000 + k, count: share } });
      w.on("message", (lines: string) => {
        process.stdout.write(lines);
        done += lines.split("\n").length - 1;
        process.stderr.write(`\r${done} of ${total} positions, ${((performance.now() - started) / 1000).toFixed(0)} s`);
      });
      w.once("error", reject);
      w.once("exit", () => resolve());
    })));
  process.stderr.write(`\n${done} positions in ${((performance.now() - started) / 1000).toFixed(0)} s\n`);
} else {
  const { seed, count } = workerData as { seed: number; count: number };
  const rng = seeded(seed);
  const bot = new DfsReplyBot(8);
  let made = 0;
  let batch: string[] = [];
  while (made < count) {
    const noise = 0.1 + 0.4 * rng();
    let s = opening("random-moves", rng() < 0.5 ? P1 : P2, rng).state;
    for (let ply = 0; ply < 400 && !s.gameOver && made < count; ply++) {
      const moves = validMoves(s);
      if (moves.length >= 2) {
        const { score } = search(s, { depth: DEPTH });
        batch.push(JSON.stringify({ pits: s.pits, toMove: s.current, score }));
        made++;
        if (batch.length === 500) {
          parentPort!.postMessage(batch.join("\n") + "\n");
          batch = [];
        }
      }
      const move = rng() < noise ? moves[Math.floor(rng() * moves.length)] : bot.choose(s)!;
      s = playTurn(s, move, { record: false }).state;
    }
  }
  if (batch.length) parentPort!.postMessage(batch.join("\n") + "\n");
}
