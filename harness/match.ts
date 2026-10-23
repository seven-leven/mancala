/**
 * Seeded random numbers, for the tests, the tournament and the tools: the same seed always gives
 * the same sequence, so a run or a failure repeats. (Bot-against-bot games are in
 * harness/rate/play.ts.)
 */

/** Deterministic random numbers (mulberry32), so results can be repeated. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
