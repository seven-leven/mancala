/**
 * The rating harness repeats: a pairing plays the same games however the work is split (1 worker
 * or 4, any order), and a tiny tournament matches its saved snapshot. So a speed-up that claims
 * "same results" is checked by a test, not by eye.
 *
 * When a bot's play changes on purpose, refresh the snapshot:
 *   deno test --allow-read --allow-write=tests/snapshots tests/harness_test.ts -- --update
 */
import { assertEquals } from "@std/assert";
import type { BotId } from "../src/bots/bots.ts";
import { type PairJob, playPair } from "../tools/tournament/play.ts";
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

Deno.test("a pairing plays the same games on 1 worker, on 4, in any order, and as the snapshot", async () => {
  const direct = jobs.map(playPair);

  const one = new Pool(1);
  const four = new Pool(4);
  try {
    assertEquals(await one.run(jobs), direct, "1 worker differs from playing the pairings directly");
    const reversed = jobs.map((_, k) => jobs.length - 1 - k);
    assertEquals(await four.run(jobs, reversed), direct, "4 workers, in reverse order, differ");
  } finally {
    one.close();
    four.close();
  }

  const snapshot = direct.map(({ i, j, results }) => `${BOTS[i]}-${BOTS[j]}: ${results.join(" ")}`);
  if (Deno.args.includes("--update")) {
    await Deno.mkdir(new URL("./snapshots/", import.meta.url), { recursive: true });
    await Deno.writeTextFile(SNAPSHOT, JSON.stringify(snapshot, null, 2) + "\n");
  }
  assertEquals(snapshot, JSON.parse(await Deno.readTextFile(SNAPSHOT)), "results differ from the snapshot");
});
