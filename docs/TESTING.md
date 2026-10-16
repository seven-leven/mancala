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

## How they run

`npm test` is Node's own test runner (`node --test`), which runs each test file in its own process, in parallel. Node
runs the `.ts` files directly by stripping the types, so there's no compile step; `npm run check` type-checks
separately, with the options that keep the code strippable (no parameter properties or enums). The assertions are
`assert`, `assertEquals` and `assertThrows` from `tests/assert.ts`, on `node:assert`. Node has no `localStorage`, so
`storage_test.ts` puts an in-memory one in its place.
