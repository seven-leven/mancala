/**
 * The bots: the one list the game, the Web Worker, saved games and the tournament all read. Each
 * entry is a BotSpec (contracts.ts); BOTS.md has the rules every bot follows and how to add one.
 */
import type { Bot, BotContext, BotSpec } from "./contracts.ts";
import { FirstBot, RandomBot } from "./players/basic.ts";
import { DfsBot } from "./players/chain.ts";
import { MixedBot } from "./players/mixed.ts";
import { GenerousBot, GreedyBot, OneMoveBot, TurtleBot } from "./players/one-move.ts";
import { LookaheadBot, MinimaxBot, PushoverBot } from "./players/search.ts";

export type { Bot, BotContext, BotSpec };
export {
  DfsBot,
  FirstBot,
  GenerousBot,
  GreedyBot,
  LookaheadBot,
  MinimaxBot,
  MixedBot,
  OneMoveBot,
  PushoverBot,
  RandomBot,
  TurtleBot,
};

/**
 * The bots, weakest first; the menus list them in this order. `level` is the everyday name players
 * see ("Hard bot"); `label` is the algorithm behind it. Levels follow the Elo ratings from
 * `deno task tournament` (see the README). Keys are permanent: saved games refer to them.
 */
export const BOTS = {
  pushover: {
    label: "Pushover",
    level: "Hopeless",
    blurb: "Searches ahead like Minimax, but to lose by as much as it can.",
    family: "search",
    create: () => new PushoverBot(4),
  },
  generous: {
    label: "Generous",
    level: "Very easy",
    blurb: "Greedy's opposite: banks as little as it can, turning down free turns and captures.",
    family: "one-move",
    create: ({ rng }) => new GenerousBot(rng),
  },
  sometimesGenerous: {
    label: "Sometimes generous",
    level: "Gentle",
    blurb: "Plays Generous's move most of the time and any legal pit the rest.",
    family: "mixed",
    // q places it between Generous and Random; see BOTS.md, "Tunable on purpose".
    create: ({ rng }) => new MixedBot(new GenerousBot(rng), 0.75, rng),
  },
  random: {
    label: "Random",
    level: "Easy",
    blurb: "Plays any legal pit.",
    family: "basic",
    create: ({ rng }) => new RandomBot(rng),
  },
  first: {
    label: "First",
    level: "Casual",
    blurb: "Always plays its first pit with seeds, from its own left.",
    family: "basic",
    create: () => new FirstBot(),
  },
  sometimesGreedy: {
    label: "Sometimes greedy",
    level: "Relaxed",
    blurb: "Plays Greedy's move half the time and any legal pit the rest.",
    family: "mixed",
    // q places it between Random and Greedy.
    create: ({ rng }) => new MixedBot(new GreedyBot(), 0.5, rng),
  },
  turtle: {
    label: "Turtle",
    level: "Careful",
    blurb: "Banks what it can, but won't leave a loaded pit open to capture for it.",
    family: "one-move",
    // caution: what each exposed seed costs it, against a seed banked.
    create: ({ rng }) => new TurtleBot(0.5, rng),
  },
  greedy: {
    label: "Greedy",
    level: "Average",
    blurb: "Takes whatever banks the most seeds this turn.",
    family: "one-move",
    create: () => new GreedyBot(),
  },
  chainer: {
    label: "Chainer",
    level: "Keen",
    blurb: "Usually takes a free turn or two before banking what it can; otherwise plays like Greedy.",
    family: "chain",
    // Two moves in a row (DFS follows 8) with probability q, else Greedy's move: q places it
    // between Greedy and a full two-move chainer, which rates level with Lookahead.
    create: ({ rng }) => new MixedBot(new DfsBot(2), 0.5, rng, new GreedyBot()),
  },
  lookahead: {
    label: "Lookahead",
    level: "Tricky",
    blurb: "Looks two moves ahead and plays one of its better moves, not always the best.",
    family: "search",
    create: ({ rng }) => new LookaheadBot(2, 3, rng),
  },
  dfs: {
    label: "DFS",
    level: "Hard",
    blurb: "Chains free turns as far as they go. The original 2024 bot.",
    family: "chain",
    create: () => new DfsBot(8),
  },
  minimax: {
    label: "Minimax",
    level: "Expert",
    blurb: "Searches ahead with alpha-beta pruning, planning for your replies too.",
    family: "search",
    // Rated at a fixed depth; in the game it searches as deep as its time allows.
    create: ({ mode, timeMs }) => new MinimaxBot(mode === "rate" ? { depth: 6 } : { timeMs }),
  },
} as const satisfies Record<string, BotSpec>;

export type BotId = keyof typeof BOTS;
/** Who sits on a side: a person, or one of the bots. */
export type Seat = "human" | BotId;

export const isBotId = (x: unknown): x is BotId => typeof x === "string" && Object.hasOwn(BOTS, x);

/** A bot ready to play. In the game: Math.random and a 700 ms budget unless told otherwise. */
export function createBot(id: BotId, ctx: Partial<BotContext> = {}): Bot {
  return (BOTS[id] as BotSpec).create({
    rng: ctx.rng ?? Math.random,
    mode: ctx.mode ?? "play",
    timeMs: ctx.timeMs ?? 700,
  });
}
