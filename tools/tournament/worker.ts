/** A tournament worker: plays the pairings main.ts sends it, one at a time. */
import { type PairJob, type PairResult, playPair } from "./play.ts";

// Declared here because this file's global is a worker's, not the window the DOM types describe.
declare const self: {
  onmessage: ((e: MessageEvent<PairJob>) => void) | null;
  postMessage(message: PairResult): void;
};

self.onmessage = ({ data }) => self.postMessage(playPair(data));
