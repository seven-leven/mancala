/**
 * Runs a bot off the main thread, so a long Minimax search never freezes the page.
 * Built to dist/worker.js; see client.ts for the other end.
 */
import { createBot, isBotId } from "./bots.ts";
import type { BotRequest, BotResponse } from "./client.ts";

// Declared here because this file's global is a worker's, not the window the DOM types describe.
declare const self: {
  onmessage: ((e: MessageEvent<BotRequest>) => void) | null;
  postMessage(message: BotResponse): void;
};

self.onmessage = ({ data }) => {
  if (!isBotId(data.bot)) return self.postMessage({ id: data.id, move: null, note: null });
  const bot = createBot(data.bot, data.timeMs);
  const move = bot.choose(data.state);
  self.postMessage({ id: data.id, move, note: bot.note?.() ?? null });
};
