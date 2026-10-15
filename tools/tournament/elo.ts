/**
 * Elo from a table of results. `res[i][j]` holds bot i's result in each game against bot j
 * (1 a win, ½ a draw, 0 a loss); bot 0 is the anchor, pinned at 1000.
 */

export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** Elo ratings from a table of results: Bradley–Terry by minorisation–maximisation. */
export function fit(res: number[][][]): number[] {
  const n = res.length;
  const gamma = new Array<number>(n).fill(1);
  for (let it = 0; it < 1000; it++) {
    for (let i = 0; i < n; i++) {
      let wins = 0, denom = 0;
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        wins += sum(res[i][j]) + 0.5; // plus one virtual draw
        denom += (res[i][j].length + 1) / (gamma[i] + gamma[j]);
      }
      gamma[i] = wins / denom;
    }
  }
  const elo = gamma.map((g) => 400 * Math.log10(g));
  return elo.map((e) => e - elo[0] + 1000);
}

/** 90% ranges: re-fit 300 times, each time resampling every pairing's games with replacement. */
export function ranges(results: number[][][], rng: () => number): [number, number][] {
  const n = results.length;
  const samples: number[][] = results.map(() => []);
  for (let b = 0; b < 300; b++) {
    const res = results.map((row) => row.map(() => [] as number[]));
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        for (let k = 0; k < results[i][j].length; k++) {
          const x = results[i][j][Math.floor(rng() * results[i][j].length)];
          res[i][j].push(x);
          res[j][i].push(1 - x);
        }
      }
    }
    fit(res).forEach((r, i) => samples[i].push(r));
  }
  return samples.map((xs) => {
    const s = [...xs].sort((a, b) => a - b);
    return [Math.round(s[Math.floor(s.length * 0.05)]), Math.round(s[Math.floor(s.length * 0.95)])];
  });
}
