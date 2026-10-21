/**
 * Solves one board on several cores (lazy SMP): every worker answers the same yes/no question of
 * MTD(f), with the shallowest moves in a different order, and they share one memo in a
 * SharedArrayBuffer, so each finds what the others proved. The first answer is taken and the rest
 * are stopped. A memo can be saved to disk and loaded again, so a board's budget adds up across runs.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { isMainThread, parentPort, Worker, workerData } from "node:worker_threads";
import { Aborted, type Board, Memo, OutOfBudget, rulesFor, type Solved, Solver } from "./solver.ts";

export interface ParallelOptions {
  /** Positions to search, across all workers. */
  budget?: number;
  workers?: number;
  /** The memo holds 2^bits entries of 8 bytes (shared by all workers). */
  bits?: number;
  /** A file to load the memo from (if it exists), and to save it to if the board stays unsolved. */
  file?: string;
}

type Question = { beta: number; generation: number };
type Answer = { generation: number; g?: number; budget?: true; aborted?: true };

/** The saved memo's first words: a mark, then the board's size, so a memo is only used for its own board. */
const header = (n: number, total: number, bits: number) => Uint32Array.of(0x6d656d6f, 1, n, total, bits);

export async function solveParallel(start: Board, opts: ParallelOptions = {}): Promise<Solved> {
  const { budget = Infinity, workers = 2, bits = 22, file } = opts;
  const rules = rulesFor(start.n, start.pits.reduce((a, b) => a + b, 0));
  const memo = new Memo(bits, true);
  const head = header(start.n, rules.total, bits);
  if (file && existsSync(file)) {
    const saved = new Uint32Array(new Uint8Array(readFileSync(file)).buffer);
    if (head.every((w, i) => saved[i] === w)) {
      memo.check.set(saved.subarray(5, 5 + memo.check.length));
      memo.value.set(saved.subarray(5 + memo.check.length));
    }
  }
  // [0]: the question being answered (changed to stop the workers); [1]: positions, in 1024s.
  const ctrl = new Int32Array(new SharedArrayBuffer(8));
  const pool = Array.from({ length: workers }, (_, id) =>
    new Worker(new URL(import.meta.url), {
      workerData: { solver: true, start, check: memo.check, value: memo.value, ctrl, budget, id },
    }));
  let generation = 0;
  const ask = (beta: number) =>
    new Promise<Answer>((resolve) => {
      generation++;
      Atomics.store(ctrl, 0, generation);
      let first: Answer | null = null, replies = 0;
      for (const w of pool) {
        w.once("message", (a: Answer) => {
          if (!first && !a.aborted) {
            first = a;
            Atomics.store(ctrl, 0, -generation); // the others can stop
          }
          if (++replies === pool.length) resolve(first!);
        });
        w.postMessage({ beta, generation } satisfies Question);
      }
    });
  // MTD(f), as in solver.ts, but each question goes to the workers.
  let lo = -rules.total, hi = rules.total, g = 1;
  while (lo < hi) {
    const beta = g === lo ? g + 1 : g;
    const a = await ask(beta);
    if (a.budget) break;
    g = a.g!;
    if (g < beta) hi = g;
    else lo = g;
  }
  await Promise.all(pool.map((w) => w.terminate()));
  const nodes = Atomics.load(ctrl, 1) * 1024;
  // Only an unsolved board's memo is worth keeping (256 MB at 25 bits); a solved one's goes.
  if (file && lo === hi && existsSync(file)) rmSync(file);
  if (file && lo < hi) {
    mkdirSync(dirname(file), { recursive: true });
    const out = new Uint32Array(5 + 2 * memo.check.length);
    out.set(head);
    out.set(memo.check, 5);
    out.set(memo.value, 5 + memo.check.length);
    writeFileSync(file, new Uint8Array(out.buffer));
  }
  if (lo < hi) return { lo, hi, move: null, nodes };
  // The value is known: its opening is found here, on the shared memo, with no budget.
  return { lo, hi, move: new Solver(rules, memo).opening(start, lo), nodes };
}

if (!isMainThread && workerData?.solver) {
  const { start, check, value, ctrl, budget, id } = workerData as {
    start: Board;
    check: Uint32Array;
    value: Uint32Array;
    ctrl: Int32Array;
    budget: number;
    id: number;
  };
  const rules = rulesFor(start.n, start.pits.reduce((a, b) => a + b, 0));
  const s = new Solver(rules, Memo.on(check, value), budget, ctrl, id);
  parentPort!.on("message", ({ beta, generation }: Question) => {
    s.generation = generation;
    try {
      parentPort!.postMessage({ generation, g: s.test(start, beta) } satisfies Answer);
    } catch (e) {
      if (e instanceof Aborted) parentPort!.postMessage({ generation, aborted: true } satisfies Answer);
      else if (e instanceof OutOfBudget) parentPort!.postMessage({ generation, budget: true } satisfies Answer);
      /* c8 ignore next: any other error is a bug, passed on */
      else throw e;
    }
  });
}
