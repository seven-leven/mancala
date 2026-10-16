# Testing

What the tests check, how to run them, and what belongs elsewhere. `npm test` runs everything in `tests/`, in parallel,
in about 5 seconds; CI runs the same on every push.

## Commands

| Command                              | What it does                                                                                                             |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `npm test`                           | Every test, in parallel, each file in its own process                                                                    |
| `npm run coverage`                   | The tests with coverage: a table of what they reach in `src/` and `tools/`, and a page per file in `coverage/index.html` |
| `node --test tests/strength_test.ts` | One file                                                                                                                 |

## The files

| File                 | Checks                                                                                                                                                                              |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `engine_test.ts`     | The rules, on hand-made positions: sowing, relays, free turns, captures, the end, house rules                                                                                       |
| `invariants_test.ts` | The rules over 3000 random games: no seed created or lost, the input never changed, the event log replays, every game ends                                                          |
| `bots_test.ts`       | Each bot's character (Greedy takes the capture, Turtle won't leave a pit open…), and that every bot in `BOTS` plays legal moves                                                     |
| `strength_test.ts`   | The wide gaps that must always hold (Lookahead beats Random, Minimax beats Greedy…), in matched pairs                                                                               |
| `harness_test.ts`    | The rating harness repeats: 1 worker, 4 workers and any order give the same games, and a saved snapshot                                                                             |
| `tournament_test.ts` | Openings, symmetric boards and the Elo fit                                                                                                                                          |
| `notation_test.ts`   | MGN: a game survives formatting and parsing, and bad marks or moves are refused                                                                                                     |
| `history_test.ts`    | Your rating from saved games, and saved games as MGN                                                                                                                                |
| `storage_test.ts`    | What the browser keeps: saved games (rated or not and why, backup export and import, the 500-game cap, corrupt storage) and settings (defaults, bad values falling back one by one) |
| `docs_test.ts`       | Every relative link and `#anchor` in the Markdown docs resolves                                                                                                                     |

## Rules of thumb

- **20 seconds.** The whole suite stays well under it. A slow test goes in its own file, so `--parallel` runs it beside
  the rest (that's why the strength checks have one).
- **Seeded.** Anything random takes a seeded generator (`seeded()` in `tools/match.ts`), so a failure repeats.
- **Strength is the harness's job.** Tests check only gaps so wide they can't fail by chance. Who is 50 Elo above whom
  is for `npm run rate` and [RATING.md](RATING.md).
- **Same results.** A speed-up that claims to change nothing must keep `harness_test.ts` passing. If a bot's play
  changes on purpose, refresh its snapshot: `UPDATE_SNAPSHOT=1 node --test tests/harness_test.ts`, and say why in the
  commit.

## What isn't covered

`npm run coverage` (October 2026, Node 24): 94% of branches and 99.9% of lines in the files the tests load. It runs the
tests under [c8](https://github.com/bcoe/c8), which reads Node's own coverage data. Open `coverage/index.html` to see
each file with the lines and branches no test reaches marked in red. What no test loads:

- **The page.** `src/main.ts`, `src/app/game.ts` (the turn loop: undo, hint, which games are rated), `src/ui/` (the
  board, the picker, the stats dialog, sound) and `src/bots/client.ts` need a browser's DOM, so they're checked by hand
  in `npm run dev`. Testing them would take a DOM for the tests (such as happy-dom).

In the files the tests do load, these are the 37 branches (and 3 functions) no test takes yet. Each could get a test;
the last group can't, and would get a `/* c8 ignore */` with its reason instead.

- **Storage that throws** (`src/app/history.ts`, `src/app/settings.ts`): the `catch` in saving games, clearing games and
  saving settings. A test needs a `localStorage` whose `setItem` and `removeItem` throw.
- **Saved games** (`src/app/history.ts`):
  - `gamesToMgn`: an unrated game with no reason given (`?? "unrated"`), and a game that won't replay, which is skipped.
  - `playerStats`: a game with no person in it, a game where the person is Player 2, and a game against a bot id that no
    longer exists.
  - `seatName`: a person, a current bot, and an unknown id.
- **Making bots** (`src/bots/bots.ts`): `createBot` for a dormant bot (First, Grandmaster), both of Grandmaster's
  `create` (play and rate), and `createBot` with no context (the `Math.random` and `"play"` defaults).
- **Bot notes** (`src/bots/players/search.ts`): "sees a forced loss", "saw 1 move ahead", and a lead of 0 or less.
- **First bot with no moves** (`src/bots/players/basic.ts`): `choose` on a finished game returns null.
- **New game** (`src/game/engine.ts`): `newGame` without `first`, which picks a side at random (both outcomes).
- **Notation** (`src/game/notation.ts`): writing `clinch=off`; reading a `Rules` tag with no `seeds` or with
  `capture=any`; a `Start` tag without 7 pits a side; `replay` of a game with an illegal move.
- **Tournament** (`tools/tournament/`):
  - `elo.ts`: `misfits` with a pairing that has no games.
  - `openings.ts`: `isOpening` is never called by a test.
  - `play.ts`: `game` with a bot that returns null, and one that plays an illegal move.
  - `pool.ts`: `run` with `hooks` (`done`, and `stop` returning true, which resolves null).
- **Can't happen** (guards that keep the types narrow): `if (r.invalid)` after a move taken from `validMoves`, in
  `players/chain.ts`, `players/one-move.ts`, `players/search.ts` (`TwoMoveBot`) and at the root of `search/minimax.ts`;
  the `-1e9` for an invalid move in minimax's move ordering (only legal moves get there); and minimax rethrowing an
  error that isn't `OutOfTime` (only a bug reaches it).

## How they run

`npm test` is Node's own test runner (`node --test`), which runs each test file in its own process, in parallel. Node
runs the `.ts` files directly by stripping the types, so there's no compile step; `npm run check` type-checks
separately, with the options that keep the code strippable (no parameter properties or enums). The assertions are
`assert`, `assertEquals` and `assertThrows` from `tests/assert.ts`, on `node:assert`. Node has no `localStorage`, so
`storage_test.ts` puts an in-memory one in its place.
