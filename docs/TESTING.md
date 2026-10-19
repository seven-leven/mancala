# Testing

How to run the tests, how to write one, and the coverage rule. `npm test` runs everything in `tests/` in about 5
seconds; CI runs the same checks on every push, and main only takes a PR whose checks pass.

## Running them

| Command                                                        | What it does                                                                                                          |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `npm test`                                                     | Every test, each file in its own process, in parallel                                                                 |
| `node --test tests/engine_test.ts`                             | One file                                                                                                              |
| `node --test --test-name-pattern=capture "tests/**/*_test.ts"` | Only the tests whose name matches                                                                                     |
| `node --test --watch tests/engine_test.ts`                     | One file, again on every save                                                                                         |
| `npm run coverage`                                             | The tests with coverage: a table, a page per file in `coverage/index.html`, and a failure if any figure is under 100% |
| `UPDATE_SNAPSHOT=1 node --test tests/harness_test.ts`          | Rewrite the harness snapshot (only when a bot's play changes on purpose)                                              |

### Before you push

CI's "Check" runs these, in this order, and stops at the first failure. Run them the same way:

```bash
npm run fmt:check && npm run lint && npm run check && npm run coverage && npm run build
```

`npm run fmt` fixes formatting; the others say what to fix. CI runs the tests under coverage, so a PR that leaves new
code untested fails even when every test passes. While you work, `npm test` is the quick run (coverage slows the search
tests down).

## The files

One file per area. A new test goes in the file for the code it tests.

- **`engine_test.ts`**: the rules, on hand-made positions: sowing, relays, free turns, captures, the end, house rules,
  and a random first player when none is given.
- **`invariants_test.ts`**: the rules over 3000 random games: no seed created or lost, the input never changed, the
  event log replays, every game ends.
- **`bots_test.ts`**: each bot's character (Greedy takes the capture, Turtle won't leave a pit open…), legal moves from
  every bot in `BOTS`, the search bots' notes for the move log, and `createBot` for dormant bots and with no context.
- **`strength_test.ts`**: the wide gaps that must always hold (Lookahead beats Random, Minimax beats Greedy…), in
  matched pairs. Slow, so it has a file of its own.
- **`harness_test.ts`**: the rating harness repeats: 1 worker, 4 workers and any order give the same games as the saved
  snapshot; the pool reports each pairing and stops when told.
- **`tournament_test.ts`**: openings, symmetric boards, the Elo fit and its model check, and a game that stops when a
  bot has no move and refuses an illegal one.
- **`notation_test.ts`**: MGN: a game survives formatting and parsing, house rules and start boards are kept, and bad
  marks, boards or moves are refused.
- **`history_test.ts`**: your rating from saved games, which games count in your record, seat names, and saved games as
  MGN.
- **`storage_test.ts`**: what the browser keeps: saved games (rated or not and why, backup and restore, the 500-game
  cap, corrupt storage, storage that refuses to write) and settings (defaults, bad values falling back one by one).
- **`dashboard_test.ts`**: the rating dashboard's snapshot: before any game, during a run, at the end (where it must
  match the printed table), and ranges moved to the latest ratings.
- **`docs_test.ts`**: every relative link and `#anchor` in the Markdown docs resolves.

A new file is for a new area (`tests/<area>_test.ts`, which `npm test` picks up by its `_test.ts` ending) or for a test
slow enough to hold up the rest.

## Writing a test

**The name says what holds**, as a plain sentence: `"greedy takes the capture"`, `"seeds are never created or lost"`.
Not `"test greedy"`, not "should". A failure then reads as the rule that broke.

**One shape for every file:**

```ts
import { test } from "node:test";
import { assert, assertEquals, assertThrows } from "./assert.ts";
import { newGame, playTurn } from "../src/game/engine.ts";

test("last seed in your own store: a free turn", () => {
  // …
});
```

- `test` from `node:test`, and only the three assertions in `tests/assert.ts`: `assert` (truthy), `assertEquals` (deep
  and strict) and `assertThrows` (optionally an error class and text the message contains). Give `assert` a message when
  its condition alone won't say what went wrong.
- Import the code under test by relative path, with the `.ts` ending.
- Helpers that build test data (`position()`, `game()`, `finished()`) sit at the top of the file with a one-line
  comment. Move one to `tests/` only when a second file needs it.

**Positions are drawn, not described.** Put the pit numbers above the array, so the board can be read at a glance:

```ts
//                  0  1  2  3  4  5  6  7  8  9 10 11 12 13  M1  M2
const win = position([1, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 0, 49, 41]);
```

and say in a comment why the position matters ("either move makes 50 of 98, a clinched majority").

**Nothing left to chance.**

- Randomness comes from `seeded()` in `tools/match.ts`, so a failure repeats. Never `Math.random`.
- When the code itself reaches for something global (`Math.random`, `localStorage`, `document`), replace it in the test
  and put it back in a `finally`, so one test can't leak into the next.
- No wall-clock assertions: timings vary from machine to machine. Check a time limit loosely (it stopped), never
  exactly.

**Strength is the harness's job.** A test checks only gaps so wide they can't fail by chance, and plays matched pairs
(each bot from each seat). Who is 50 Elo above whom is for `npm run rate` and [RATING.md](RATING.md).

**Same results.** A speed-up that claims to change nothing must keep `harness_test.ts` passing as it is. If a bot's play
changes on purpose, refresh the snapshot and say why in the commit.

**Fast.** The whole suite stays well under 20 seconds. Test the smallest thing that shows the rule: a hand-made position
over a whole game, a depth-2 search over a timed one.

## Coverage

`npm run coverage` (October 2026, Node 24): **100%** of lines, branches and functions in the files the tests load, and
it fails if any figure drops below. It runs the tests under [c8](https://github.com/bcoe/c8), which reads Node's own
coverage data; open `coverage/index.html` to see each file, with anything no test reaches marked in red.

New code comes with the tests that keep it at 100%. The one exception is code that can't run: mark it `/* c8 ignore next
*/` (or `start` … `stop` for a block) with the reason on the same line. Two guards are marked today: Minimax's `if
(r.invalid)` on a root move it already knows is legal (it only narrows the type), and Minimax passing on an error that
isn't `OutOfTime` (only a bug reaches it). If a test could reach it, it gets a test, not an ignore; better still, code
that can't run is written away (the bots that look ahead play moves with `playOn`, which has no such case).

What no test loads, and so isn't counted:

- **The page.** `src/main.ts`, `src/app/game.ts` (the turn loop: undo, hint, which games are rated), `src/ui/` (the
  board, the picker, the stats dialog, sound) and `src/bots/client.ts` need a browser's DOM, so they're checked by hand
  in `npm run dev`. Testing them would take a DOM for the tests (such as happy-dom).
- **The rating dashboard's server and page** (`tools/dashboard/server.ts`, `app.ts`): checked by hand with `npm run
  rate -- 40 --ui`. What they show comes from `snapshot.ts`, which is tested.

## How they run

`npm test` is Node's own test runner (`node --test`), which runs each test file in its own process, in parallel. Node
runs the `.ts` files directly by stripping the types, so there's no compile step; `npm run check` type-checks
separately, with the options that keep the code strippable (no parameter properties or enums). Node has no
`localStorage`, so `storage_test.ts` puts an in-memory one in its place.
