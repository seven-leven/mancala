/**
 * Elo from a table of results. `res[i][j]` holds bot i's result in each game against bot j
 * (1 a win, ½ a draw, 0 a loss); bot 0 is the anchor, pinned at 1000.
 */

export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** Elo ratings from a table of results: Bradley–Terry by minorisation–maximisation. */
export function fit(res: number[][][]): number[] {
  const n = res.length;
  // Each pairing's score and game count, once: they don't change between steps. One virtual
  // draw per pairing keeps 100% pairings finite.
  const won = res.map((row) => row.map((games) => sum(games) + 0.5));
  const played = res.map((row) => row.map((games) => games.length + 1));
  const gamma = new Array<number>(n).fill(1);
  for (let it = 0; it < 1000; it++) {
    for (let i = 0; i < n; i++) {
      let wins = 0, denom = 0;
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        wins += won[i][j];
        denom += played[i][j] / (gamma[i] + gamma[j]);
      }
      gamma[i] = wins / denom;
    }
  }
  const elo = gamma.map((g) => 400 * Math.log10(g));
  return elo.map((e) => e - elo[0] + 1000);
}

/**
 * 90% ranges: re-fit 300 times, each time resampling every pairing's games with replacement. Games
 * are drawn `block` at a time (2 for matched pairs), since the two legs of a pair go together.
 */
export function ranges(results: number[][][], rng: () => number, block = 1): [number, number][] {
  return rangesOf(resample(results, rng, block));
}

/** 90% ranges from resampled fits (resample()): the 5th and 95th percentile of each bot's ratings. */
export function rangesOf(samples: number[][]): [number, number][] {
  return samples.map((xs) => {
    const s = [...xs].sort((a, b) => a - b);
    return [Math.round(s[Math.floor(s.length * 0.05)]), Math.round(s[Math.floor(s.length * 0.95)])];
  });
}

/**
 * Re-fits 300 times, each time resampling every pairing's games with replacement, `block` at a time
 * (2 for matched pairs, whose legs go together). samples[i][k] is bot i's rating in resample k.
 */
export function resample(results: number[][][], rng: () => number, block = 1): number[][] {
  const n = results.length;
  const samples: number[][] = results.map(() => []);
  for (let b = 0; b < 300; b++) {
    const res = results.map((row) => row.map(() => [] as number[]));
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const blocks = results[i][j].length / block;
        for (let k = 0; k < blocks; k++) {
          const at = Math.floor(rng() * blocks) * block;
          for (const x of results[i][j].slice(at, at + block)) {
            res[i][j].push(x);
            res[j][i].push(1 - x);
          }
        }
      }
    }
    fit(res).forEach((r, i) => samples[i].push(r));
  }
  return samples;
}

/** "Is a stronger than b?": the share of resamples in which a rates above b. */
export const aboveShare = (samples: number[][], a: number, b: number) =>
  samples[a].filter((r, k) => r > samples[b][k]).length / samples[a].length;

export interface Misfit {
  i: number;
  j: number;
  /** i's score against j, as a share of their games, and what the ratings predict. */
  observed: number;
  expected: number;
  /** How many standard errors apart. */
  z: number;
}

/**
 * Does the model fit? For each pairing, i's score against j next to what the ratings predict,
 * flagged when they're more than `limit` standard errors apart. A bot that isn't transitive (beats
 * strong bots, loses to weak ones) shows up here. The error counts matched pairs, not games: the
 * two legs of a pair go together.
 */
export function misfits(results: number[][][], rating: number[], limit = 3): Misfit[] {
  const out: Misfit[] = [];
  for (let i = 0; i < results.length; i++) {
    for (let j = i + 1; j < results.length; j++) {
      const games = results[i][j];
      if (!games.length) continue;
      const expected = 1 / (1 + 10 ** ((rating[j] - rating[i]) / 400));
      const pairs = games.length / 2;
      const pairScores = Array.from({ length: pairs }, (_, k) => (games[2 * k] + games[2 * k + 1]) / 2);
      const observed = sum(pairScores) / pairs;
      // A pair's score varies at most like one game's: p(1 − p), floored so a 100% pairing still has some.
      const p = Math.min(0.99, Math.max(0.01, expected));
      const z = (observed - expected) / Math.sqrt((p * (1 - p)) / pairs);
      if (Math.abs(z) > limit) out.push({ i, j, observed, expected, z });
    }
  }
  return out;
}
