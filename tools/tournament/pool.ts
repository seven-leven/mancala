/**
 * A pool of workers (worker.ts) that plays pairings in parallel. Each pairing has its own seed and
 * its own slot in the results, so the results don't depend on the pool's size or the order the
 * pairings are handed out in (tests/harness_test.ts checks that).
 */
import type { PairJob, PairResult } from "./play.ts";

export interface RunHooks {
  /** A pairing finished: its index in `jobs`, how long it took in ms, and its result. */
  done?(k: number, ms: number, result: PairResult): void;
  /** Checked before each pairing is handed out: true stops the run (pairings in flight finish). */
  stop?(): boolean;
}

export class Pool {
  private workers: Worker[];
  constructor(size: number) {
    this.workers = Array.from(
      { length: Math.max(1, Math.floor(size)) },
      () => new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }),
    );
  }

  /**
   * Plays `jobs` in the given `order` (indexes into `jobs`, default as listed). Resolves with the
   * results by job index, or null if `hooks.stop` stopped it.
   */
  run(jobs: PairJob[], order = jobs.map((_, k) => k), hooks: RunHooks = {}): Promise<PairResult[] | null> {
    const out: PairResult[] = new Array(jobs.length);
    let next = 0, busy = 0;
    return new Promise((resolve, reject) => {
      const feed = (w: Worker) => {
        const stopped = hooks.stop?.() ?? false;
        if (stopped || next >= order.length) {
          if (busy === 0) resolve(stopped ? null : out);
          return;
        }
        const k = order[next++];
        const sent = performance.now();
        busy++;
        w.onmessage = (e: MessageEvent<PairResult>) => {
          out[k] = e.data;
          busy--;
          hooks.done?.(k, performance.now() - sent, e.data);
          feed(w);
        };
        w.onerror = (e) => reject(e.error ?? new Error(e.message));
        w.postMessage(jobs[k]);
      };
      this.workers.forEach(feed);
    });
  }

  close(): void {
    this.workers.forEach((w) => w.terminate());
  }
}
