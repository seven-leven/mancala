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
  is for `deno task rate` and [RATING.md](RATING.md).
- **Same results.** A speed-up that claims to change nothing must keep `harness_test.ts` passing. If a bot's play
  changes on purpose, refresh its snapshot:
  `deno test --allow-read --allow-write=tests/snapshots tests/harness_test.ts -- --update`, and say why in the commit.

## What isn't covered

`deno task coverage` (October 2026): 98% of lines in the files the tests load, none below 93%. What no test loads:

- **The page.** `src/main.ts`, `src/app/game.ts` (the turn loop: undo, hint, which games are rated), `src/ui/` (the
  board, the picker, the stats dialog, sound) and `src/bots/client.ts` need a browser's DOM, so they're checked by hand
  in `deno task dev`. Testing them would take a DOM for the tests (deno-dom, or happy-dom under Node).

## Deno and Node

The game itself (`src/`) uses no Deno API: it runs in the browser. The tests are mostly portable too, but not yet
runnable under Node as they stand:

- **Every file** uses `Deno.test` and `@std/assert`. `@std/assert` installs under Node from JSR; `Deno.test` would
  become `node:test`'s `test` (one import per file, or a two-line wrapper both runtimes share).
- **Three files** use more of Deno: `docs_test.ts` reads files (`Deno.readDir`, `Deno.readTextFile`, `Deno.stat`: become
  `node:fs/promises`), `harness_test.ts` reads `Deno.args` and writes its snapshot, and starts the rating harness's Web
  Workers (`tools/tournament/pool.ts`: Node has `node:worker_threads` instead), and `storage_test.ts` uses
  `localStorage` (Node has it only behind a flag, so it would need a small in-memory stand-in).
- **The tools** (`tools/`) use Deno's file, process and worker APIs throughout, and `deno.json`'s tasks and permissions;
  they'd move with the rest of the migration.
