/**
 * The rating harness repeats: a pairing plays the same games however the work is split (1 worker
 * or 4, any order), and a tiny tournament matches its saved snapshot. So a speed-up that claims
 * "same results" is checked by a test, not by eye.
 *
 * When a bot's play changes on purpose, refresh the snapshot:
 *   UPDATE_SNAPSHOT=1 node --test tests/harness_test.ts
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { test } from "node:test";
import { assertEquals } from "./assert.ts";
import type { BotId } from "../src/bots/bots.ts";
import { type PairJob, type PairResult, playPair } from "../tools/tournament/play.ts";
import { Pool } from "../tools/tournament/pool.ts";

// Quick bots only: the test stays well under a second of play.
const BOTS: BotId[] = ["random", "greedy", "generous", "hoarder", "striker"];
const ROUNDS = 2;
const SNAPSHOT = new URL("./snapshots/harness.json", import.meta.url);

const jobs: PairJob[] = [];
for (let round = 0; round < ROUNDS; round++) {
  for (let i = 0; i < BOTS.length; i++) {
    for (let j = i + 1; j < BOTS.length; j++) {
      jobs.push({ round, i, j, a: BOTS[i], b: BOTS[j], opening: "random-moves", record: true });
    }
  }
}

/** A pairing's result without its timings, which are wall-clock and vary. */
const played = ({ thinkMs: _t, ...rest }: PairResult) => rest;

test("a pairing plays the same games on 1 worker, on 4, in any order, and as the snapshot", async () => {
  const direct = jobs.map(playPair).map(played);

  const one = new Pool(1);
  const four = new Pool(4);
  try {
    assertEquals((await one.run(jobs))!.map(played), direct, "1 worker differs from playing the pairings directly");
    const reversed = jobs.map((_, k) => jobs.length - 1 - k);
    assertEquals((await four.run(jobs, reversed))!.map(played), direct, "4 workers, in reverse order, differ");
  } finally {
    one.close();
    four.close();
  }

  const snapshot = direct.map(({ i, j, results }) => `${BOTS[i]}-${BOTS[j]}: ${results.join(" ")}`);
  if (process.env.UPDATE_SNAPSHOT) {
    await mkdir(new URL("./snapshots/", import.meta.url), { recursive: true });
    await writeFile(SNAPSHOT, JSON.stringify(snapshot, null, 2) + "\n");
  }
  assertEquals(snapshot, JSON.parse(await readFile(SNAPSHOT, "utf8")), "results differ from the snapshot");
});

test("the pool reports each pairing as it finishes, and stops when told", async () => {
  const pool = new Pool(1);
  const finished: number[] = [];
  try {
    const result = await pool.run(jobs, undefined, {
      done: (k, ms) => {
        assertEquals(typeof ms, "number");
        finished.push(k);
      },
      stop: () => finished.length > 0,
    });
    assertEquals(result, null, "a stopped run resolves null");
    assertEquals(finished, [0], "the pairing in flight finishes; no more are handed out");
  } finally {
    pool.close();
  }
});
