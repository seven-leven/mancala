/**
 * A tournament's results so far, saved after every round, so a long run can stop (on a time
 * budget, or Ctrl+C) and carry on later with --resume. Git-ignored.
 */
import type { Opening } from "./openings.ts";

export interface Checkpoint {
  /** What was played; a run only resumes a checkpoint made the same way. */
  opening: Opening;
  bots: string[];
  /** Complete rounds: each round is one matched pair (two games) for every pairing. */
  rounds: number;
  /** results[i][j]: i's result in each game against j (1 a win, ½ a draw, 0 a loss), legs in order. */
  results: number[][][];
  firstWon: number;
  decided: number;
  /** --adaptive only: matched pairs planned for each pairing, and the pairs done, by "i j round". */
  plan?: number[][];
  done?: Record<string, [number, number, number, number]>;
}

export const CHECKPOINT = new URL("./checkpoint.json", import.meta.url);

export async function load(): Promise<Checkpoint | null> {
  try {
    return JSON.parse(await Deno.readTextFile(CHECKPOINT));
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) return null;
    throw e;
  }
}

/** Writes to a temporary file first, so a crash mid-save never leaves half a checkpoint. */
export async function save(c: Checkpoint): Promise<void> {
  const tmp = new URL("./checkpoint.json.tmp", import.meta.url);
  await Deno.writeTextFile(tmp, JSON.stringify(c));
  await Deno.rename(tmp, CHECKPOINT);
}
