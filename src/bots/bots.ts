/**
 * The bots: the one list the game, the Web Worker, saved games and the tournament all read. Each
 * entry is a BotSpec (contracts.ts); docs/BOTS.md has the rules every bot follows and how to add one.
 */
import type { Bot, BotContext, BotSpec } from "./contracts.ts";
import { FirstBot, RandomBot } from "./players/basic.ts";
import { DfsBot, DfsReplyBot } from "./players/chain.ts";
import { MixedBot } from "./players/mixed.ts";
import { MonteCarloBot } from "./players/montecarlo.ts";
import { GenerousBot, GreedyBot, HoarderBot, OneMoveBot, StrikerBot, TurtleBot } from "./players/one-move.ts";
import { LookaheadBot, MinimaxBot, PushoverBot, TwoMoveBot } from "./players/search.ts";
import { lead, planned } from "./search/evaluate.ts";

export type { Bot, BotContext, BotSpec };
export {
  DfsBot,
  DfsReplyBot,
  FirstBot,
  GenerousBot,
  GreedyBot,
  HoarderBot,
  LookaheadBot,
  MinimaxBot,
  MixedBot,
  OneMoveBot,
  PushoverBot,
  RandomBot,
  StrikerBot,
  TurtleBot,
  TwoMoveBot,
};

/**
 * The bots, weakest first; the menus list them in this order. `level` is the everyday name players
 * see ("Hard bot"); `label` is the algorithm behind it. Levels follow the Elo ratings from
 * `npm run rate` (see the README). Keys are permanent: saved games refer to them.
 */
export const BOTS = {
  pushover: {
    label: "Pushover",
    level: "Hopeless",
    blurb: "Searches ahead like Minimax, but to lose by as much as it can.",
    family: "search",
    // Depth 3: as hopeless as depth 4 (both lose about 99% to Random) at a fifth of the time.
    create: () => new PushoverBot(3),
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
    // q places it between Generous and Random; see docs/BOTS.md, "Tunable on purpose".
    create: ({ rng }) => new MixedBot(new GenerousBot(rng), 0.75, rng),
  },
  fickle: {
    label: "Fickle",
    level: "Mild",
    blurb: "Sometimes keeps its seeds at home like Hoarder; more often gives them away like Generous.",
    family: "mixed",
    // Hoarder's move with probability q, else Generous's: q places it between Generous and Hoarder
    // (0.5 rates about 880; 0.4 aims for 850, between Gentle and Thrifty).
    create: ({ rng }) => new MixedBot(new HoarderBot(0.3, rng), 0.4, rng, new GenerousBot(rng)),
  },
  hoarder: {
    label: "Hoarder",
    level: "Thrifty",
    blurb: "Keeps its seeds on its own side, banking only a little.",
    family: "one-move",
    // thrift: what a banked seed is worth against one kept at home.
    create: ({ rng }) => new HoarderBot(0.3, rng),
  },
  random: {
    label: "Random",
    level: "Easy",
    blurb: "Plays any legal pit.",
    family: "basic",
    create: ({ rng }) => new RandomBot(rng),
  },
  striker: {
    label: "Striker",
    level: "Bold",
    blurb: "Banks what it can, but would rather line up a capture for next turn.",
    family: "one-move",
    // aggression: what a seed it threatens to capture is worth against one banked. The keener it
    // is, the weaker it plays: 0.5 rates level with Greedy, 1.0 about 100 below.
    create: ({ rng }) => new StrikerBot(1.0, rng),
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
  spoiler: {
    label: "Spoiler",
    level: "Crafty",
    blurb: "Often plays the move that leaves your best reply weakest; otherwise plays like Greedy.",
    family: "search",
    // The two-move search (alone it rates level with Lookahead) with probability q, else Greedy.
    create: ({ rng }) => new MixedBot(new TwoMoveBot(lead), 0.5, rng, new GreedyBot()),
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
  sometimesPlanner: {
    label: "Sometimes planner",
    level: "Clever",
    blurb: "Plans like Planner most of the time; otherwise plays like Greedy.",
    family: "mixed",
    // Planner's move with probability q, else Greedy's: 0.7 rates about 1560, 1 is Planner (1685);
    // 0.75 aims for 1580, between Keen and Thoughtful.
    create: ({ rng }) => new MixedBot(new TwoMoveBot(planned()), 0.75, rng, new GreedyBot()),
  },
  planner: {
    label: "Planner",
    level: "Thoughtful",
    blurb: "Looks at your best reply, and weighs everything: free turns set up, captures threatened, pits left open.",
    family: "search",
    create: () => new TwoMoveBot(planned()),
  },
  lookahead: {
    label: "Lookahead",
    level: "Tricky",
    blurb: "Looks two moves ahead and plays one of its better moves, not always the best.",
    family: "search",
    create: ({ rng }) => new LookaheadBot(2, 3, rng),
  },
  shrewd: {
    label: "Shrewd",
    level: "Sharp",
    blurb: "Lookahead's method, three moves deep instead of two.",
    family: "search",
    // depth and slack, as for Lookahead (2, 3).
    create: ({ rng }) => new LookaheadBot(3, 2, rng),
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

/**
 * Dormant bots: kept in the code, out of the menus and the default tournament. Their ids are
 * reserved. The tournament still rates one when it's named: `npm run rate -- --bots ...`.
 * See docs/BOTS.md, "Dormant bots".
 */
export const DORMANT = {
  // DFS v2: DFS's own chains, then the opponent's best chain in answer, with alpha-beta and
  // Minimax's evaluation. Beat DFS 56% over 400 games (+42 Elo, 90%: +13 to +71) at about 3 ms a
  // move. Dormant until a full rating places it (between DFS and Minimax, if it holds).
  dfs2: {
    label: "DFS v2",
    level: "Hard v2",
    blurb: "Chains free turns like DFS, then checks your best chain in answer before it commits.",
    family: "chain",
    create: () => new DfsReplyBot(8),
  },
  // Monte Carlo tree search with random playouts (TODO, #16): 10 ms a move in the game, and in
  // rating the 2000 playouts that 10 ms buys from the opening. Dormant until it's placed on the
  // ladder (docs/RATING.md, "Placing a new bot").
  montecarlo: {
    label: "Monte Carlo",
    level: "Lucky",
    blurb: "Plays thousands of random games from each move and picks the one that won most.",
    family: "montecarlo",
    create: ({ mode, rng }) => new MonteCarloBot(mode === "rate" ? { playouts: 2000 } : { timeMs: 10 }, rng),
  },
  // Rated level with Random (999 against 1000 over 240 games, too close to call), so it adds no
  // step to the ladder, and a player can't tell the two apart. Kept as the simplest fixed
  // strategy for tests and research.
  first: {
    label: "First",
    level: "Casual",
    blurb: "Always plays its first pit with seeds, from its own left.",
    family: "basic",
    create: () => new FirstBot(),
  },
  // Rated level with Minimax (1992 against 1985 over 60 games) for five times the search time:
  // depth 10 adds almost nothing to depth 6 here. Waits for a better evaluation (v2.4) or a
  // capture extension (#13) to make deeper search pay. See TODO.md, v2.5.
  grandmaster: {
    label: "Grandmaster",
    level: "Master",
    blurb: "Minimax with more time: it searches deeper before it moves.",
    family: "search",
    // Rated at depth 10 (Minimax: 6); in the game, twice Minimax's time.
    create: ({ mode, timeMs }) => new MinimaxBot(mode === "rate" ? { depth: 10 } : { timeMs: 2 * timeMs }),
  },
} as const satisfies Record<string, BotSpec>;
export type DormantId = keyof typeof DORMANT;
export const isDormantId = (x: unknown): x is DormantId => typeof x === "string" && Object.hasOwn(DORMANT, x);

export type BotId = keyof typeof BOTS;
/** Who sits on a side: a person, or one of the bots. */
export type Seat = "human" | BotId;

export const isBotId = (x: unknown): x is BotId => typeof x === "string" && Object.hasOwn(BOTS, x);

/** A bot ready to play. In the game: Math.random and a 700 ms budget unless told otherwise. */
export function createBot(id: BotId | DormantId, ctx: Partial<BotContext> = {}): Bot {
  const spec: BotSpec = isDormantId(id) ? DORMANT[id] : BOTS[id];
  return spec.create({
    rng: ctx.rng ?? Math.random,
    mode: ctx.mode ?? "play",
    timeMs: ctx.timeMs ?? 700,
  });
}
