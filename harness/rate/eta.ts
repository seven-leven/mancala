/**
 * How long a rating run has left. Tested against the ETA logs (data/eta/, one per run): see
 * docs/RATING.md, "The ETA".
 *
 * Runs are seeded, so a run with the same settings as an earlier one plays the very same games,
 * and its slow and quick stretches fall in the same places. So the best guess is the last such
 * run's own timeline, scaled by how fast this one is going: about 9% off on average, against the
 * logs. Without one, the mean round so far, leaving out the first (slow: the workers start and
 * nothing is warmed up yet), about 34% off; the median the ETA used before ran 23% short, since a
 * few slow rounds pull the mean well above the median.
 */
import { readdir, readFile } from "node:fs/promises";

/** An ETA with its error: the time left, a range that holds the real finish 80% of the time, and how. */
export interface Eta {
  ms: number;
  low: number;
  high: number;
  from: Method;
}
export type Method = "history" | "rounds" | "costs";

/**
 * Each method's 80% range, as the share of its ETA a run really took: the 10th and 90th percentile
 * over the ETA logs (October 2026; 359 predictions from history, 637 from rounds). Adaptive runs
 * without history ("costs") have no logs to go on yet, so they take the wider of the two.
 */
export const BANDS: Record<Method, [number, number]> = {
  history: [0.85, 1.12],
  rounds: [0.69, 1.33],
  costs: [0.69, 1.33],
};

/** An ETA with its 80% range, in whole ms, none of it past `capMs` (a --time budget). */
export function withBand(ms: number, from: Method, capMs = Infinity): Eta {
  const [lo, hi] = BANDS[from];
  const cap = (x: number) => Math.round(Math.max(0, Math.min(x, capMs)));
  return { ms: cap(ms), low: cap(ms * lo), high: cap(ms * hi), from };
}

/** A finished run's progress over time: games played (this run) at each logged moment. */
export interface Timeline {
  games: number[];
  elapsedMs: number[];
  finishedMs: number;
}

/** What a run is, as far as its games go: two runs with the same key play the same games. */
export const runKey = (r: { games: number; bots: string[]; opening: string; adaptive: boolean }) =>
  JSON.stringify([r.games, r.bots, r.opening, r.adaptive]);

/**
 * A finished run's timeline from its ETA log, if it was a complete run from the start (not resumed,
 * not stopped early) of the run with this key; otherwise null.
 */
export function readTimeline(log: string, key: string): Timeline | null {
  const lines = log.trim().split("\n").map((l) => JSON.parse(l));
  const run = lines[0]?.run, end = lines.at(-1);
  if (!run || run.resumedFrom || runKey(run) !== key || !end?.finishedMs || !end.complete) return null;
  const points = lines.filter((l) => typeof l.elapsedMs === "number");
  return {
    games: [0, ...points.map((l) => l.games), end.games],
    elapsedMs: [0, ...points.map((l) => l.elapsedMs), end.finishedMs],
    finishedMs: end.finishedMs,
  };
}

/** The newest finished run with this key in `dir` (the ETA logs), or null. */
export async function lastTimeline(dir: URL, key: string): Promise<Timeline | null> {
  try {
    const names = (await readdir(dir)).filter((n) => n.endsWith(".jsonl")).sort().reverse();
    for (const name of names) {
      const timeline = readTimeline(await readFile(new URL(name, dir), "utf8"), key);
      if (timeline) return timeline;
    }
  } catch { /* no logs yet */ }
  return null;
}

/** When `t` had played `games` games, between its logged moments. */
export function timeAt(t: Timeline, games: number): number {
  for (let i = 1; i < t.games.length; i++) {
    if (t.games[i] >= games) {
      const span = t.games[i] - t.games[i - 1];
      const f = span ? (games - t.games[i - 1]) / span : 1;
      return t.elapsedMs[i - 1] + f * (t.elapsedMs[i] - t.elapsedMs[i - 1]);
    }
  }
  return t.finishedMs;
}

/** What's left, from the last run like this one: its time still to go, at this run's pace. */
export function fromHistory(t: Timeline, games: number, elapsedMs: number): number | null {
  const then = timeAt(t, games);
  if (!games || then <= 0) return null;
  return Math.max(0, (t.finishedMs - then) * (elapsedMs / then));
}

/**
 * What's left of a run in rounds, from this run's own rounds: the mean round after the first, for
 * every round still to start, and what the current round has left of one.
 * `roundEnds`: when each finished round ended (ms since the start). Null before the first ends.
 */
export function fromRounds(roundEnds: number[], roundsLeft: number, elapsedMs: number): number | null {
  if (!roundEnds.length) return null;
  const durations = roundEnds.map((t, k) => t - (k ? roundEnds[k - 1] : 0));
  const later = durations.slice(1);
  // With only the first round done, half of it: it's the slowest, for warming up.
  const round = later.length ? later.reduce((a, b) => a + b, 0) / later.length : durations[0] / 2;
  const inRound = elapsedMs - roundEnds.at(-1)!;
  return Math.max(0, (roundsLeft - 1) * round + Math.max(0, round - inRound));
}
