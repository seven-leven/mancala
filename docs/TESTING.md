# Testing

What the tests check, how to run them, and what belongs elsewhere. `deno task test` runs everything in `tests/`, in
parallel, in about 5 seconds; CI runs the same on every push.

## Commands

| Command                                         | What it does                                                                                             |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `deno task test`                                | Every test, in parallel (`--allow-read`: the harness test starts workers, the link check reads the docs) |
| `deno task coverage`                            | The tests with coverage, then a table of what each file's tests reach (into `data/coverage/`)            |
| `deno test --allow-read tests/strength_test.ts` | One file                                                                                                 |

## The files

| File                 | Checks                                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `engine_test.ts`     | The rules, on hand-made positions: sowing, relays, free turns, captures, the end, house rules                                   |
| `invariants_test.ts` | The rules over 3000 random games: no seed created or lost, the input never changed, the event log replays, every game ends      |
| `bots_test.ts`       | Each bot's character (Greedy takes the capture, Turtle won't leave a pit open…), and that every bot in `BOTS` plays legal moves |
| `strength_test.ts`   | The wide gaps that must always hold (Lookahead beats Random, Minimax beats Greedy…), in matched pairs                           |
| `harness_test.ts`    | The rating harness repeats: 1 worker, 4 workers and any order give the same games, and a saved snapshot                         |
| `tournament_test.ts` | Openings, symmetric boards and the Elo fit                                                                                      |
| `notation_test.ts`   | MGN: a game survives formatting and parsing, and bad marks or moves are refused                                                 |
| `history_test.ts`    | Saved games and your rating                                                                                                     |
| `docs_test.ts`       | Every relative link and `#anchor` in the Markdown docs resolves                                                                 |

## Rules of thumb

- **20 seconds.** The whole suite stays well under it. A slow test goes in its own file, so `--parallel` runs it beside
  the rest (that's why the strength checks have one).
- **Seeded.** Anything random takes a seeded generator (`seeded()` in `tools/match.ts`), so a failure repeats.
- **Strength is the harness's job.** Tests check only gaps so wide they can't fail by chance. Who is 50 Elo above whom
  is for `deno task rate` and [RATING.md](RATING.md).
- **Same results.** A speed-up that claims to change nothing must keep `harness_test.ts` passing. If a bot's play
  changes on purpose, refresh its snapshot:
  `deno test --allow-read --allow-write=tests/snapshots tests/harness_test.ts -- --update`, and say why in the commit.

## What isn't covered

`deno task coverage` (October 2026): 91% of lines in the files the tests load. The gaps worth knowing:

- **The page.** `src/main.ts`, `src/app/game.ts`, `src/ui/` need a browser, so no test loads them: undo, hint, which
  games are rated, the picker and the stats dialog are checked by hand in `deno task dev`.
- `src/app/history.ts`: about 40% of lines, mostly the import and export of saved games.
- `src/bots/players/search.ts`: about 80%; the search bots' notes for the move log.
