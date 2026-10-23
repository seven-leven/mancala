/**
 * The rating run's ETA (harness/rate/eta.ts): reading an earlier run's timeline from its log,
 * the two ways of estimating what's left, and the 80% range around them.
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import { assert, assertEquals } from "./assert.ts";
import {
  BANDS,
  fromHistory,
  fromRounds,
  lastTimeline,
  readTimeline,
  runKey,
  timeAt,
  withBand,
} from "../harness/rate/eta.ts";

const run = { games: 40, bots: ["random", "greedy"], workers: 4, adaptive: false, opening: "random-moves" };
const key = runKey(run);
/** An ETA log as a run writes it: the run, a line a second, and the total. */
const log = (over: object = {}, end: object = { finishedMs: 10_000, games: 40, complete: true }) =>
  [
    { run: { ...run, resumedFrom: 0, ...over } },
    { elapsedMs: 2_000, etaMs: null, done: 0, total: 20, unit: "rounds", games: 10 },
    { elapsedMs: 6_000, etaMs: 4_000, done: 10, total: 20, unit: "rounds", games: 20 },
    end,
  ].map((l) => JSON.stringify(l)).join("\n") + "\n";

test("a finished run's log gives its timeline; a resumed, stopped or different run's doesn't", () => {
  assertEquals(readTimeline(log(), key), {
    games: [0, 10, 20, 40],
    elapsedMs: [0, 2_000, 6_000, 10_000],
    finishedMs: 10_000,
  });
  assertEquals(readTimeline(log({ resumedFrom: 5 }), key), null, "resumed: its games count from the middle");
  assertEquals(readTimeline(log({}, { finishedMs: 8_000, games: 30, complete: false }), key), null, "stopped early");
  assertEquals(readTimeline(log({ games: 80 }), key), null, "other settings, other games");
  assertEquals(readTimeline(log().split("\n").slice(0, 2).join("\n"), key), null, "still running");
});

test("the newest matching log in the folder is the one used", async () => {
  const dir = await mkdtemp(join(tmpdir(), "eta-"));
  try {
    const url = pathToFileURL(dir + "/");
    assertEquals(await lastTimeline(url, key), null, "no logs yet");
    await writeFile(join(dir, "2026-10-01.jsonl"), log());
    await writeFile(join(dir, "2026-10-02.jsonl"), log({}, { finishedMs: 12_000, games: 40, complete: true }));
    await writeFile(join(dir, "2026-10-03.jsonl"), log({ games: 80 }));
    assertEquals((await lastTimeline(url, key))?.finishedMs, 12_000);
    assertEquals(await lastTimeline(new URL("./missing/", url), key), null, "no folder at all");
  } finally {
    await rm(dir, { recursive: true });
  }
});

test("from history: the earlier run's time still to go, at this run's pace", () => {
  const t = readTimeline(log(), key)!;
  assertEquals(timeAt(t, 15), 4_000, "between two logged moments");
  assertEquals(timeAt(t, 50), 10_000, "past the end");
  // Two moments with the same count (no game finished in between): the later one.
  assertEquals(timeAt({ games: [0, 0, 10], elapsedMs: [0, 1_500, 4_000], finishedMs: 4_000 }, 0), 1_500);
  // 20 games in, the earlier run had 4 s to go; this one got there in 3 s, a third faster.
  assertEquals(fromHistory(t, 20, 3_000), 2_000);
  assertEquals(fromHistory(t, 0, 500), null, "no games yet: nothing to scale by");
});

test("from rounds: the mean round after the first, for every round still to start and the one on", () => {
  assertEquals(fromRounds([], 20, 1_000), null, "no round done yet");
  // One round, the slow first: half of it a round. 10 rounds left, 1 s into the 2nd round.
  assertEquals(fromRounds([4_000], 10, 5_000), 9 * 2_000 + 1_000);
  // Rounds after the first take 1 s and 3 s: 2 s a round. 5 left, the current one 0.5 s in.
  assertEquals(fromRounds([5_000, 6_000, 9_000], 5, 9_500), 4 * 2_000 + 1_500);
  // A current round already longer than a typical one counts as nearly done, not as negative.
  assertEquals(fromRounds([5_000, 6_000, 9_000], 1, 20_000), 0);
});

test("the 80% range: each method's band around its ETA, and none of it past a --time budget", () => {
  assertEquals(withBand(100_000, "history"), { ms: 100_000, low: 85_000, high: 112_000, from: "history" });
  const e = withBand(100_000, "rounds", 120_000);
  assertEquals([e.ms, e.low, e.high], [100_000, 69_000, 120_000], "the top is cut at the budget");
  assert(BANDS.costs[0] <= BANDS.history[0] && BANDS.costs[1] >= BANDS.history[1], "no history: a wider band");
});
