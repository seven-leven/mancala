/**
 * The rating dashboard's snapshot (tools/dashboard/snapshot.ts): what it shows before any game,
 * during a run, and at the end, where it must match the table the run prints.
 */
import { test } from "node:test";
import { assert, assertEquals } from "./assert.ts";
import { buildSnapshot, rangesDue, type SnapshotInput } from "../tools/dashboard/snapshot.ts";
import { fit, gapRange, rangesOf, resample } from "../tools/tournament/elo.ts";
import { seeded } from "../tools/match.ts";
import { playPair } from "../tools/tournament/play.ts";
import { replay } from "../src/game/notation.ts";
import { DEFAULT_RULES } from "../src/game/types.ts";

const bots = [
  { id: "random", label: "Random", level: "Easy" },
  { id: "greedy", label: "Greedy", level: "Average" },
  { id: "newbot", label: "New bot", level: "Keen" },
];
const empty = () => bots.map(() => bots.map(() => [] as number[]));

/** A run's input: three bots, with whatever results and samples a test gives. */
function input(over: Partial<SnapshotInput> = {}): SnapshotInput {
  return {
    bots,
    results: empty(),
    previous: [{ elo: 1000, low: 1000, high: 1000 }, { elo: 1300, low: 1280, high: 1320 }, null],
    think: [{ ms: 10, moves: 100 }, { ms: 0, moves: 0 }, { ms: 50, moves: 10 }],
    samples: null,
    samplesRating: null,
    samplesGames: 0,
    firstWon: 0,
    decided: 0,
    progress: {
      status: "running",
      done: 0,
      total: 20,
      unit: "rounds",
      games: 0,
      gamesPerSec: 0,
      elapsedMs: 0,
      etaMs: null,
      etaLowMs: null,
      etaHighMs: null,
    },
    run: { opening: "random-moves", workers: 4, adaptive: false, gamesPerPairing: 40 },
    planned: [[0, 40, 40], [40, 0, 40], [40, 40, 0]],
    history: { points: [{ games: 60, elo: [1000, 1100, 1200] }], ranges: [] },
    ...over,
  };
}

/** `pairs` matched pairs a pairing, where each bot beats the one before it 60% of the time, and the one before that 80%. */
function played(pairs: number): number[][][] {
  const res = empty();
  const rng = seeded(4);
  for (let i = 0; i < 3; i++) {
    for (let j = i + 1; j < 3; j++) {
      for (let k = 0; k < 2 * pairs; k++) {
        const x = rng() < 0.4 + 0.2 * (j - i) ? 0 : 1; // a 0 is a win for j, the stronger
        res[i][j].push(x);
        res[j][i].push(1 - x);
      }
    }
  }
  return res;
}

test("before any game: everyone level with the anchor, and nothing to show yet", () => {
  const s = buildSnapshot(input());
  assertEquals(s.rows.map((r) => [r.id, r.elo]), [["random", 1000], ["greedy", 1000], ["newbot", 1000]]);
  assertEquals(
    s.rows.map((r) => [r.low, r.high]),
    [[1000, 1000], [null, null], [null, null]],
    "only the anchor's is known",
  );
  assertEquals(s.rows.map((r) => r.change), [0, -300, null], "a bot new this run has no change");
  assertEquals(s.rows.map((r) => [r.score, r.above]), [[null, null], [null, null], [null, null]]);
  assertEquals(s.rows[0].gap, { elo: 0, low: null, high: null }, "a gap before any ranges has no range yet");
  assertEquals(s.rows.map((r) => r.msPerMove), [0.1, null, 5]);
  assertEquals([s.misfits, s.rangesGames, s.firstMoverWon], [[], null, null]);
  assertEquals(s.score[0][1], null);
  assertEquals(s.planned, input().planned);
  assertEquals(s.history, input().history, "the history goes through as the run kept it");
});

test("during a run: ratings fitted fresh, strongest first, with each pairing's score and games", () => {
  const results = played(20);
  const s = buildSnapshot(input({ results, firstWon: 30, decided: 60 }));
  const rating = fit(results).map(Math.round);
  assertEquals(s.rows.map((r) => r.elo), [...rating].sort((a, b) => b - a));
  assertEquals(s.rows[0].id, "newbot");
  assertEquals(s.games[0][1], 40);
  assertEquals(s.score[1][0]! + s.score[0][1]!, 1, "a pairing's two scores add up to 1");
  assert(Math.abs(s.expected[2][0] + s.expected[0][2] - 1) < 1e-9);
  assertEquals(s.firstMoverWon, 0.5);
  assertEquals(s.rows.find((r) => r.id === "random")!.elo, 1000);
});

test("at the end: the ranges and 'above next' are exactly the printed table's", () => {
  const results = played(20);
  const samples = resample(results, seeded(711), 2);
  const s = buildSnapshot(input({ results, samples, samplesRating: fit(results), samplesGames: 120 }));
  const range = rangesOf(samples);
  for (const r of s.rows.filter((row) => row.i !== 0)) assertEquals([r.low, r.high], range[r.i]);
  for (const [k, r] of s.rows.slice(0, -1).entries()) {
    const next = s.rows[k + 1];
    assertEquals(r.gap, {
      elo: r.elo - next.elo,
      low: gapRange(samples, r.i, next.i)[0],
      high: gapRange(samples, r.i, next.i)[1],
    });
  }
  assertEquals(s.rows.at(-1)!.gap, null);
  assertEquals(s.rangesGames, 120);
  assert(s.rows.slice(0, -1).every((r) => r.above !== null && r.above >= 0 && r.above <= 1));
  assertEquals(s.rows.at(-1)!.above, null, "the weakest has no next one down");
});

test("older samples are moved to the latest ratings, so each range stays around its own bot", () => {
  const results = played(20);
  const samples = resample(results, seeded(711), 2);
  const rating = fit(results);
  // Samples drawn around ratings 100 lower for every bot: the ranges come out the same as fresh ones.
  const older = buildSnapshot(input({
    results,
    samples: samples.map((xs) => xs.map((x) => x - 100)),
    samplesRating: rating.map((r) => r - 100),
    samplesGames: 60,
  }));
  const fresh = buildSnapshot(input({ results, samples, samplesRating: rating, samplesGames: 60 }));
  assertEquals(older.rows.map((r) => [r.low, r.high]), fresh.rows.map((r) => [r.low, r.high]));
  // Samples without the ratings they were drawn around aren't used.
  assertEquals(buildSnapshot(input({ results, samples })).rows[1].low, null);
});

test("new ranges are asked for when there are new games and the last ask is old enough", () => {
  assert(rangesDue(100, 0, Infinity), "the first ask");
  assert(!rangesDue(100, 100, 60_000), "no new games");
  assert(!rangesDue(120, 100, 5_000), "asked too recently");
  assert(rangesDue(120, 100, 10_000));
});

test("a pair kept for the game viewer replays to the same results, from the same opening", () => {
  const job = { round: 1, i: 0, j: 1, a: "random", b: "greedy", opening: "random-moves", record: false } as const;
  const plain = playPair(job);
  const kept = playPair({ ...job, keep: true });
  assertEquals(plain.kept, [], "nothing kept unless asked");
  assertEquals(kept.results, plain.results, "keeping the games changes nothing played");
  assertEquals(kept.kept.map((g) => g.seats), [[0, 1], [1, 0]], "the seats swap within the pair");
  for (const [k, g] of kept.kept.entries()) {
    const end = replay({ tags: {}, rules: { ...DEFAULT_RULES }, first: g.first, moves: g.moves }).states.at(-1)!;
    assert(end.gameOver);
    const winner = end.pits[14] === end.pits[15] ? null : end.pits[14] > end.pits[15] ? 1 : 2;
    assertEquals(winner, g.winner);
    // Bot i's result in game k: a win when the winner's seat holds bot 0.
    assertEquals(kept.results[k], winner === null ? 0.5 : g.seats[winner - 1] === 0 ? 1 : 0);
  }
  assertEquals(kept.kept[0].moves.slice(0, 2), kept.kept[1].moves.slice(0, 2), "one opening for both games");
});
