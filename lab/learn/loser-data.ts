/**
 * Training data for a loser's net: games of a loser (Pushover, playing a random legal move 15% of
 * the time for variety) against bots that play to win, from Random to DFS v2. Every position gets a
 * line with the loser's side and the final store lead from that side, which is what its net learns
 * to predict, at either side's move.
 *
 *   node lab/learn/loser-data.ts [positions, default 200000] > data/learn/loser.jsonl
 *
 * Each line: {"pits":[...16],"toMove":1,"q":2,"lead":-31}. Seeded: the same count gives the same file.
 */
import { availableParallelism } from "node:os";
import { isMainThread, parentPort, Worker, workerData } from "node:worker_threads";
import { createBot } from "../../src/bots/bots.ts";
import { playTurn, validMoves } from "../../src/game/engine.ts";
import { P1, P2, type Player } from "../../src/game/types.ts";
import { seeded } from "../../harness/match.ts";
import { opening } from "../../harness/rate/openings.ts";

const OPPONENTS = ["random", "sometimesGenerous", "hoarder", "greedy", "spoiler", "planner", "dfs2"] as const;

if (isMainThread) {
  const total = Number(process.argv[2] ?? 200_000);
  const workers = availableParallelism();
  const started = performance.now();
  let done = 0;
  await Promise.all(Array.from({ length: workers }, (_, k) =>
    new Promise<void>((resolve, reject) => {
      const share = Math.floor(total / workers) + (k < total % workers ? 1 : 0);
      const w = new Worker(new URL(import.meta.url), { workerData: { seed: 5000 + k, count: share } });
      w.on("message", (lines: string) => {
        process.stdout.write(lines);
        done += lines.split("\n").length - 1;
      });
      w.once("error", reject);
      w.once("exit", () => resolve());
    })));
  process.stderr.write(`${done} positions in ${((performance.now() - started) / 1000).toFixed(0)} s\n`);
} else {
  const { seed, count } = workerData as { seed: number; count: number };
  const rng = seeded(seed);
  let made = 0;
  while (made < count) {
    const q: Player = rng() < 0.5 ? P1 : P2;
    const loser = createBot("pushover", { rng, mode: "rate" });
    const winner = createBot(OPPONENTS[Math.floor(rng() * OPPONENTS.length)], { rng, mode: "rate" });
    let s = opening("random-moves", rng() < 0.5 ? P1 : P2, rng).state;
    const seen: { pits: number[]; toMove: Player }[] = [];
    for (let ply = 0; ply < 400 && !s.gameOver; ply++) {
      const moves = validMoves(s);
      if (moves.length >= 2) seen.push({ pits: [...s.pits], toMove: s.current });
      const move = s.current === q
        ? (rng() < 0.15 ? moves[Math.floor(rng() * moves.length)] : loser.choose(s)!)
        : winner.choose(s)!;
      s = playTurn(s, move, { record: false }).state;
    }
    const lead = q === 1 ? s.pits[14] - s.pits[15] : s.pits[15] - s.pits[14];
    const lines = seen.slice(0, count - made).map((p) => JSON.stringify({ ...p, q, lead }));
    made += lines.length;
    if (lines.length) parentPort!.postMessage(lines.join("\n") + "\n");
  }
}
