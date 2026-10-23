/**
 * Resamples a run's results for the dashboard's 90% ranges, off the main thread: 300 fits take
 * about a second, which would otherwise hold up handing pairings to the game workers. Same seed
 * and blocks as the final table, so the last ranges match it exactly.
 */
import { parentPort } from "node:worker_threads";
import { seeded } from "../match.ts";
import { fit, resample } from "../rate/elo.ts";

// The fit goes back with the samples: the dashboard centres each range on the bot's latest rating.
parentPort!.on(
  "message",
  (results: number[][][]) =>
    parentPort!.postMessage({ samples: resample(results, seeded(711), 2), rating: fit(results) }),
);
