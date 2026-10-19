/**
 * What the rating dashboard shows, as one JSON-ready object: built from a run's results so far,
 * on the run's main thread, at most once a second. Everything here is cheap (one fit is a few ms);
 * the 90% ranges come in as `samples`, resampled on a thread of their own (ranges-worker.ts).
 *
 * Samples lag the results by a few seconds, while the ratings are fitted fresh. So each bot's
 * samples are moved by how far its rating has moved since (`samplesRating` is the fit they were
 * drawn around): a range keeps its width and stays centred on the rating it belongs to. At the end
 * of a run the samples come from the same results, nothing moves, and the ranges match the table.
 */
import { aboveShare, fit, misfits, rangesOf, sum } from "../tournament/elo.ts";

export interface BotInfo {
  id: string;
  label: string;
  level: string;
}

/** A bot's rating before this run, from src/bots/ratings.ts. */
export interface Rating {
  elo: number;
  low: number;
  high: number;
}

export interface Progress {
  status: "running" | "stopping" | "done";
  /** Rounds (or, adaptive, matched pairs) done, of how many. */
  done: number;
  total: number;
  unit: "rounds" | "pairs";
  games: number;
  gamesPerSec: number;
  elapsedMs: number;
  etaMs: number | null;
}

export interface Run {
  opening: string;
  workers: number;
  adaptive: boolean;
  gamesPerPairing: number;
}

export interface SnapshotInput {
  bots: BotInfo[];
  /** results[i][j]: bot i's result in each game against bot j (1, ½ or 0). Bot 0 is the anchor. */
  results: number[][][];
  previous: (Rating | null)[];
  think: { ms: number; moves: number }[];
  /** Resampled fits (elo.ts resample()), the fit they were drawn around, and how many games they
   * were taken from; null before the first. */
  samples: number[][] | null;
  samplesRating: number[] | null;
  samplesGames: number;
  firstWon: number;
  decided: number;
  progress: Progress;
  run: Run;
  /** By bot index: the games planned for each pairing (adaptive runs plan more for close ones). */
  planned: number[][];
}

export interface BotRow {
  /** The bot's index in `bots` and in the matrix. */
  i: number;
  id: string;
  label: string;
  level: string;
  elo: number;
  /** The 90% range, from the latest samples; the anchor's is its rating. */
  low: number | null;
  high: number | null;
  previous: Rating | null;
  change: number | null;
  /** The share of resampled fits in which it rates above the next bot down. */
  above: number | null;
  games: number;
  /** Its average result, 0 to 1. */
  score: number | null;
  msPerMove: number | null;
}

export interface Snapshot {
  run: Run;
  progress: Progress;
  /** Strongest first. */
  rows: BotRow[];
  /** By bot index: i's average result against j (null before they've played), and the games. */
  score: (number | null)[][];
  games: number[][];
  planned: number[][];
  /** By bot index: the result the ratings predict for i against j. */
  expected: number[][];
  misfits: { i: number; j: number; observed: number; expected: number; z: number }[];
  /** Games behind the ranges shown, or null before the first ranges. */
  rangesGames: number | null;
  firstMoverWon: number | null;
}

const mean = (xs: number[]) => (xs.length ? sum(xs) / xs.length : null);

export function buildSnapshot(input: SnapshotInput): Snapshot {
  const { bots, results } = input;
  const played = sum(results.map((row) => sum(row.map((games) => games.length)))) / 2;
  // Before any game every bot is level with the anchor.
  const raw = played ? fit(results) : bots.map(() => 1000);
  const rating = raw.map(Math.round);
  const samples = input.samples && input.samplesRating
    ? input.samples.map((xs, i) => xs.map((x) => x + raw[i] - input.samplesRating![i]))
    : null;
  const range = samples ? rangesOf(samples) : null;
  const order = [...bots.keys()].sort((a, b) => rating[b] - rating[a] || a - b);
  const rows = order.map((i, k): BotRow => {
    const previous = input.previous[i];
    const next = order[k + 1];
    const all = results[i].flat();
    const t = input.think[i];
    return {
      i,
      ...bots[i],
      elo: rating[i],
      low: i === 0 ? rating[i] : range ? range[i][0] : null,
      high: i === 0 ? rating[i] : range ? range[i][1] : null,
      previous,
      change: previous ? rating[i] - previous.elo : null,
      above: samples && next !== undefined ? aboveShare(samples, i, next) : null,
      games: all.length,
      score: mean(all),
      msPerMove: t.moves ? t.ms / t.moves : null,
    };
  });
  const expected = rating.map((ri) => rating.map((rj) => 1 / (1 + 10 ** ((rj - ri) / 400))));
  return {
    run: input.run,
    progress: input.progress,
    rows,
    score: results.map((row) => row.map(mean)),
    games: results.map((row) => row.map((games) => games.length)),
    planned: input.planned,
    expected,
    misfits: played ? misfits(results, rating) : [],
    rangesGames: samples ? input.samplesGames : null,
    firstMoverWon: input.decided ? input.firstWon / input.decided : null,
  };
}

/** Whether to ask for new ranges: some new games, and at least `everyMs` since the last ask. */
export function rangesDue(games: number, samplesGames: number, sinceMs: number, everyMs = 10_000): boolean {
  return games > samplesGames && sinceMs >= everyMs;
}
