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
  decides: "nothing" | "one-move" | "chain" | "search" | "lose" | "sampling" | "mix"; // how it chooses
  judges: "nothing" | "rules" | "net" | "formula" | "playouts"; // what it judges positions by
  create(ctx: BotContext): Bot;
}

interface DormantSpec extends BotSpec { // DORMANT's entries
  status: "candidate" | "shelved"; // waiting for a rating, or works but earns no place yet
  why: string;
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

## How a bot decides, and what it judges by

Every bot sits on two axes, `decides` and `judges`, and [the bots by family](images/bot-families.svg) draws them as a
grid from the registry (`npm run diagrams`), with the gaps worth trying.

| `decides`  | How it chooses                                                    | Bots                                                            |
| ---------- | ----------------------------------------------------------------- | --------------------------------------------------------------- |
| `nothing`  | From the board as it is, without looking at what a move does      | Random; First, Intuition (dormant)                              |
| `one-move` | Plays each pit once and scores the position after                 | Greedy, Generous, Turtle, Hoarder, Striker; Rule list           |
| `chain`    | Follows its own free turns (DFS v2: and the opponent's in answer) | DFS, DFS v2, Learned DFS, Chainer                               |
| `search`   | Looks at the opponent's replies, to a set depth                   | Minimax, Shrewd, Lookahead, Planner, Spoiler; Grandmaster       |
| `lose`     | The same search, aiming for the worst result                      | Pushover, Learned pushover, Decompiled pushover                 |
| `sampling` | Plays random games from each move, keeps the move that wins most  | Monte Carlo                                                     |
| `mix`      | Another bot's move some of the time, else a random or other one   | Sometimes greedy, Sometimes generous, Sometimes planner, Fickle |

| `judges`   | What it judges positions by                                                                                 |
| ---------- | ----------------------------------------------------------------------------------------------------------- |
| `nothing`  | No judgement: Random and First                                                                              |
| `rules`    | Hand-written scoring: [src/bots/judges/evaluate.ts](../src/bots/judges/evaluate.ts) and the bots' own rules |
| `net`      | A trained network (value or policy) and its weights, in `src/bots/judges/`                                  |
| `formula`  | A network's logic decompiled into a readable formula or rules, in `src/bots/judges/`                        |
| `playouts` | Random games played to the end                                                                              |

**Files.** The bots' classes are in `src/bots/players/`, grouped by how they decide (`basic.ts`, `one-move.ts`,
`chain.ts`, `search.ts`, `mixed.ts`, `montecarlo.ts`). What they judge by is in `src/bots/judges/`: the scoring pieces
(store lead, seeds on your side, exposure, threats, free turns set up, mobility) as `Evaluator`s in `evaluate.ts`, the
networks and their generated weights, and the decompiled formulas and rules. A new idea is a new function there, not a
copy inside a bot. `src/bots/search/` holds only the Minimax search and the move helpers every looking-ahead bot uses.

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

1. Write it in `src/bots/players/` and give it its `decides` and `judges` (a new value goes in `contracts.ts` and the
   tables above).
2. Add it to `BOTS` with a label, a provisional level and a blurb. The order of `BOTS` is the menus' order: weakest
   first.
3. Give it a test of its character: a position where it must make (or refuse) its typical move.
4. Measure it: `npm run eval -- <id>` writes its report card to `lab/results/<id>.md` (speed, perfect moves against the
   solver, and a placement), and add an entry to [lab/LOG.md](../lab/LOG.md).
5. Place it and rate it: [RATING.md](RATING.md#placing-a-new-bot), then [after `--write`](RATING.md#after---write).

A bot that lands on top of another adds nothing to the menu. Keep it out of `BOTS`, or retire it.

## Dormant bots

A bot that works but doesn't earn its place yet goes in `DORMANT` in `src/bots/bots.ts` instead of `BOTS`, with a
`status` and the reason in `why`:

- `candidate`: new, waiting for a full rating to place it. Now: Intuition and Rule list.
- `shelved`: rated, but it lands on top of another bot or costs far more than it adds. Now: Grandmaster (Minimax
  searching to depth 10; level with Minimax for five times the time) and First (always its leftmost pit; level with
  Random, 999 against 1000 over 240 games).

Either way it's out of the menus and the default tournament, its id stays reserved, and `npm run rate -- --bots
random,minimax,grandmaster` still rates it, so it can come back when something changes.

## Retiring a bot

Remove it from `BOTS`, keep its id listed below so it's never reused, and leave its rating in old saved games alone
(each game stores the rating from the day it was played).

Retired ids: none yet.
