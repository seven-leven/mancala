/**
 * The bots, and the one place the rest of the game gets them from. Each one is stateless and plays
 * for whoever's turn it is (`state.current`), so any bot can sit on either side. To add one, write
 * a class with `choose` in players/ and register it in BOTS below: the menus fill themselves from
 * that list.
 */
import type { Bot } from "./bot.ts";
import { FirstBot, RandomBot } from "./players/basic.ts";
import { DfsBot } from "./players/dfs.ts";
import { GenerousBot, GreedyBot } from "./players/greedy.ts";
import { LookaheadBot, MinimaxBot, PushoverBot } from "./players/searchers.ts";

export type { Bot };
export { DfsBot, FirstBot, GenerousBot, GreedyBot, LookaheadBot, MinimaxBot, PushoverBot, RandomBot };

/**
 * The bots, weakest first; the menus list them in this order. `level` is the everyday name players
 * see ("Hard bot"); `label` is the algorithm behind it. Levels follow the Elo ratings from
 * `deno task tournament` (see the README).
 */
export const BOTS = {
  pushover: {
    label: "Pushover",
    level: "Hopeless",
    blurb: "Searches ahead like Minimax, but to lose by as much as it can.",
    create: () => new PushoverBot(4),
  },
  generous: {
    label: "Generous",
    level: "Very easy",
    blurb: "Greedy's opposite: banks as little as it can, turning down free turns and captures.",
    create: () => new GenerousBot(),
  },
  random: { label: "Random", level: "Easy", blurb: "Plays any legal pit.", create: () => new RandomBot() },
  first: {
    label: "First",
    level: "Casual",
    blurb: "Always plays its first pit with seeds, from its own left.",
    create: () => new FirstBot(),
  },
  greedy: {
    label: "Greedy",
    level: "Average",
    blurb: "Takes whatever banks the most seeds this turn.",
    create: () => new GreedyBot(),
  },
  lookahead: {
    label: "Lookahead",
    level: "Tricky",
    blurb: "Looks two moves ahead and plays one of its better moves, not always the best.",
    create: () => new LookaheadBot(2, 3),
  },
  dfs: {
    label: "DFS",
    level: "Hard",
    blurb: "Chains free turns as far as they go. The original 2024 bot.",
    create: () => new DfsBot(8),
  },
  minimax: {
    label: "Minimax",
    level: "Expert",
    blurb: "Searches ahead with alpha-beta pruning, planning for your replies too.",
    create: (timeMs?: number) => new MinimaxBot({ timeMs: timeMs ?? 700 }),
  },
} as const;

export type BotId = keyof typeof BOTS;
/** Who sits on a side: a person, or one of the bots. */
export type Seat = "human" | BotId;

export const isBotId = (x: unknown): x is BotId => typeof x === "string" && x in BOTS;
export const createBot = (id: BotId, timeMs?: number): Bot =>
  id === "minimax" ? BOTS.minimax.create(timeMs) : BOTS[id].create();
