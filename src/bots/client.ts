/**
 * Asks a bot for a move. Runs it in a Web Worker when it can (dist/worker.js, next to the app),
 * and on the main thread if workers aren't available.
 */
import type { GameState } from "../game/types.ts";
import { type BotId, createBot } from "./bots.ts";

export interface BotRequest {
  id: number;
  bot: BotId;
  state: GameState;
  timeMs?: number;
}
export interface BotResponse {
  id: number;
  move: number | null;
  /** What a search bot based the move on, for the log. */
  note: string | null;
}
export type BotAnswer = Omit<BotResponse, "id">;

/** The build stamp (tools/build.ts), so the worker is always the one built with this page. */
declare const __BUILD__: string;
const build = typeof __BUILD__ === "string" ? __BUILD__ : "dev";

let worker: Worker | null = null;
try {
  worker = new Worker(new URL(`./worker.js?v=${build}`, import.meta.url), { type: "module" });
} catch {
  worker = null;
}

let nextId = 0;
const pending = new Map<number, { req: BotRequest; resolve: (answer: BotAnswer) => void }>();
function onMainThread({ bot, state, timeMs }: BotRequest): BotAnswer {
  const b = createBot(bot, { timeMs });
  const move = b.choose(state);
  return { move, note: b.note?.() ?? null };
}

worker?.addEventListener("message", (e: MessageEvent<BotResponse>) => {
  pending.get(e.data.id)?.resolve({ move: e.data.move, note: e.data.note });
  pending.delete(e.data.id);
});
worker?.addEventListener("error", () => {
  // The worker failed to load (say, the page was opened from a file): answer everything here.
  worker = null;
  for (const { req, resolve } of pending.values()) resolve(onMainThread(req));
  pending.clear();
});

export function askBot(bot: BotId, state: GameState, timeMs?: number): Promise<BotAnswer> {
  const req: BotRequest = { id: nextId++, bot, state, timeMs };
  if (!worker) return Promise.resolve(onMainThread(req));
  return new Promise((resolve) => {
    pending.set(req.id, { req, resolve });
    worker!.postMessage(req);
  });
}
