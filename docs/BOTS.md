# Bot standard

How a bot is built, named, rated and kept. Read this before adding or changing one. The types are in
[src/bots/contracts.ts](../src/bots/contracts.ts); this explains the rules behind them.

## The contract

```ts
interface Bot {
  choose(state: GameState): number | null; // a legal pit, or null only when there's no legal move
  note?(): string | null; // what the last choice was based on, for the move log
}

interface BotSpec {
  label: string; // the algorithm: "Minimax"
  level: string; // the everyday name: "Expert"
  blurb: string; // one plain sentence on how it plays
  family: "basic" | "one-move" | "chain" | "search" | "mixed";
  create(ctx: BotContext): Bot;
}

interface BotContext {
  rng: () => number; // all randomness
  mode: "play" | "rate"; // the game, or the tournament
  timeMs: number; // the time budget in "play" mode
}
```

Every bot is one entry in `BOTS` in [src/bots/bots.ts](../src/bots/bots.ts), and the registry is the only list there is.
The menus, the Web Worker, saved games and the tournament all read it.

## Rules every bot follows

1. **Ask the engine; never re-implement the rules.** A bot learns what it may play from `validMoves()`, and what a move
   does from the engine. To try many moves, play them with `playOn()` on a reused board (`Boards`, one per depth, in
   [src/bots/search/moves.ts](../src/bots/search/moves.ts)): it's the engine's own `turn()` without the copy and the
   event log `playTurn()` makes for the screen. Every bot that looks ahead does this, so speeding it up speeds them all.
2. **Always legal.** `choose` returns one of `validMoves(state)`, and returns null only when that's empty. The tests
   play every bot through whole games to check.
3. **Plays either side.** A bot plays for `state.current`, whichever player that is.
4. **No memory between moves.** The only state a bot may keep is what its last move was based on, for `note()`. A game
   can be undone, replayed or handed to a fresh bot at any point.
5. **All randomness from `ctx.rng`.** Never `Math.random()` inside a bot. The tournament seeds `rng`, so every run
   repeats exactly and a resumed run plays the same games.
6. **Fixed strength when rated.** In `"rate"` mode a bot uses no clock: search bots search to a fixed depth. In `"play"`
   mode they stop on `ctx.timeMs` (700 ms in the game), so a move never takes much longer than that.
7. **Cheap enough for a phone.** Bots run in a Web Worker, but a move should still take well under a second on a slow
   phone. (Dormant Grandmaster takes twice Minimax's time, one reason it's dormant.)

## Families and files

| Family     | How it decides                                         | File                           | Bots                                                                         |
| ---------- | ------------------------------------------------------ | ------------------------------ | ---------------------------------------------------------------------------- |
| `basic`    | Doesn't look at what a move does                       | `src/bots/players/basic.ts`    | Random, First                                                                |
| `one-move` | Plays each pit once and scores the position after      | `src/bots/players/one-move.ts` | Greedy, Generous, Turtle, Hoarder, Striker                                   |
| `chain`    | Follows its own free turns, ignores replies            | `src/bots/players/chain.ts`    | DFS, Chainer (mixed with Greedy)                                             |
| `search`   | Looks at the opponent's replies                        | `src/bots/players/search.ts`   | Minimax, Lookahead, Shrewd, Pushover; Planner and Spoiler (the two-move bot) |
| `mixed`    | Another bot's move some of the time, else a random one | `src/bots/players/mixed.ts`    | Sometimes greedy, Sometimes generous                                         |

Scoring pieces (store lead, seeds on your side, exposure, threats, free turns set up, mobility) live in
[src/bots/search/evaluate.ts](../src/bots/search/evaluate.ts) as `Evaluator`s, so one-move bots and the search share
them. A new idea is a new function there, not a copy inside a bot.

## Names

- **id** (the key in `BOTS`): camelCase, and **permanent**. Saved games and ratings refer to it; renaming one orphans a
  player's history. A retired bot's id is never reused.
- **label**: the algorithm, in a word or two ("Greedy", "Sometimes greedy").
- **level**: the everyday name players see ("Average bot is thinking"). Unique, and in Elo order: when a new rating
  reorders the ladder, the levels move with it so the names always read from weakest to strongest.
- **blurb**: one sentence in the folio's voice (see [DESIGN.md](DESIGN.md)): plain, no exclamation marks.

## Rating

Every bot in `BOTS` is rated against every other by the rating harness, `npm run rate`. How to run it, how many games,
how to read the ranges and where a new bot should land: [RATING.md](RATING.md).

**Tunable on purpose.** A bot meant to fill a gap should have one knob that moves its strength smoothly (a probability,
a depth, a weight), so it can be placed where the ladder needs it. Note the knob's value in the registry.

## Adding a bot

1. Write it in its family's file (or a new family, added to `Family` and to the table above).
2. Add it to `BOTS` with a label, a provisional level and a blurb. The order of `BOTS` is the menus' order: weakest
   first.
3. Give it a test of its character: a position where it must make (or refuse) its typical move.
4. Place it and rate it: [RATING.md](RATING.md#placing-a-new-bot), then [after `--write`](RATING.md#after---write).

A bot that lands on top of another adds nothing to the menu. Keep it out of `BOTS`, or retire it.

## Dormant bots

A bot that works but doesn't earn its place yet (it rates on top of another, or costs far more than it adds) can go
dormant: it moves from `BOTS` to `DORMANT` in `src/bots/bots.ts`. It's out of the menus and the default tournament, its
id stays reserved, and `npm run rate -- --bots random,minimax,grandmaster` still rates it, so it can come back when
something changes. Say why next to it.

Dormant now: Grandmaster (Minimax searching to depth 10; level with Minimax for five times the time), and First (always
its leftmost pit; level with Random, 999 against 1000 over 240 games, so it added no step to the ladder).

## Retiring a bot

Remove it from `BOTS`, keep its id listed below so it's never reused, and leave its rating in old saved games alone
(each game stores the rating from the day it was played).

Retired ids: none yet.
