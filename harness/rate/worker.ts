/** A tournament worker (node:worker_threads): plays the pairings pool.ts sends it, one at a time. */
import { parentPort } from "node:worker_threads";
import { type PairJob, playPair } from "./play.ts";

parentPort!.on("message", (job: PairJob) => parentPort!.postMessage(playPair(job)));
