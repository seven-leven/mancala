# Changelog

Versions are `MAJOR.MINOR.PATCH`, set by hand in `package.json`, and the live game shows the version in its footer. Each
release has a section here; work since the last one sits under _Unreleased_.

## v2.5.0 · 2026-10-20

- **A learned bot: Wise (Learned DFS) ties Minimax at about a quarter of its time.** DFS v2's search, judged by a small
  neural network (16 inputs, two layers of 16, 561 weights) trained on Minimax's scores for 200,000 positions. The net
  calls the winner right 91% of the time, against 71% for Minimax's own evaluation, and runs in plain TypeScript in
  about half a microsecond. Re-rated over 240 games a pairing with 21 bots: Learned DFS and Minimax level at 2074, 6.5
  ms a move against 23.3. A tie is the most any bot can get against Minimax under these rules. Training is two tools,
  `tools/learn/data.ts` and `tools/learn/train.ts`, seeded, a few minutes in all; bigger nets (32 and 64 wide) were no
  stronger.
- **Twenty bots: Very hard (DFS v2) and Lucky (Monte Carlo) join the ladder**, in the two gaps under Minimax. Re-rated
  over 240 games a pairing (45,600 games in 3 minutes 44): DFS v2 at 2064, between DFS and Minimax, and Monte Carlo at
  1848, between Lookahead and Shrewd. Every bot is above the next one down in at least 98% of resampled fits, and the
  widest 90% range is ±24. With close rungs added at the top it spread out: Minimax 2048 → 2092, DFS 1970 → 2005.
- **DFS v2**: DFS's own free-turn chains, then the opponent's best chain in answer, scored by Minimax's evaluation, with
  alpha-beta pruning (the same moves as a full search, about 60 times faster). It sees the captures DFS walks into, and
  beat DFS 56% over 400 matched-pair games (+42 Elo, 90% range +13 to +71) at about 3 ms a move. Planner's scoring
  pieces added nothing to it.
- **Minimax has no headroom under these rules.** A Minimax v2 was tried three ways (a sharper evaluation, depth 8, depth
  4) and every one split every matched pair 1–1 with Minimax: from these openings the seat decides the game, and Minimax
  already wins every won position. Symmetric deals are the same. Even depth 2 lost only 7 pairs in 100.
- **A Monte Carlo bot**: Monte Carlo tree search with random playouts, 10 ms a move in the game and 2000 playouts when
  rated. It filled the gap between Lookahead and Shrewd, but it isn't a stronger top: it scored 8% against Minimax, and
  DFS is stronger at a twentieth of the time. Random games are a poor guide in a game this tactical. A new family,
  `montecarlo`, in docs/BOTS.md.

## v2.4.0 · 2026-10-19

- **A better ETA, with an error range.** The rating run's ETA is its own module (`tools/tournament/eta.ts`), chosen and
  calibrated on the ETA logs: from the last run with the same settings when there is one (about 9% off), otherwise from
  the mean round leaving out the first (about 34% off; the old median ran 23% short). It now shows the range that held
  the real finish 80% of the time, as `ETA 02:10 (01:50–02:40)`, in the terminal and the dashboard.
  [docs/ETA.md](docs/ETA.md) has the numbers and the roadmap for ETA 2.0.
- **Minimax 1.75× faster, playing the same moves.** Positions are keyed by 64-bit Zobrist hashes in a typed-array table
  (no strings or objects per node), ties in the move order go to the pit with the better history, and big hands sow
  whole laps at once. 600 decisions on seeded positions: the same moves and scores in 5.9 s instead of 10.4 s. In the
  game it searches deeper in the same time; rating runs finish sooner.
- **The engine sows faster** for every bot: sowing is one function outside `turn()` instead of a new one made on every
  turn, with its own loop when no event log is wanted. Minimax 14% faster again, DFS 20%, the one-move bots up to 25%,
  every move the same. (Scoring leaves inside Minimax's loop, and looping over pits instead of calling `validMoves()`,
  were measured too: no real difference, so not kept.)
- **Every bot that looks ahead shares one way of trying moves**: `playOn()` plays a move on a reused board, one per
  depth, without the copy and event log `playTurn()` makes for the screen (`src/bots/search/moves.ts`). DFS is about 15%
  faster, Planner, Spoiler and Chainer about 10%, and every bot plays exactly the same moves as before (checked on 400
  positions for each of the 19). Rewriting the scoring pieces as plain loops was measured too, and made no difference,
  so they stayed as they were.
- **The gap to the next bot, with its 90% range**, in the rating table and the dashboard: how far apart two neighbours
  are, and how sure.
- **Openings, measured.** Sharing one opening a round across every pairing made the ranges wider, not narrower, and
  symmetric deals were no better than random moves at twice the time, so the default stays (docs/RATING.md).
- **The dashboard, two more views.** _Converging_ draws every bot's rating over the games played and how wide the ranges
  still are, so you can see when a run has played enough. _Watch the games_ replays any pairing's games on the game's
  own board: click a cell in the head-to-head table. The run keeps each pairing's first 20 games for it, and only with
  `--ui`.
- **An ETA log.** Every rating run writes its ETA predictions, about once a second, and its actual total time to
  `data/eta/`, so the ETA can be checked against what really happened and calibrated.
- **Watch a rating run live**: `npm run rate -- 240 --ui` serves a dashboard at http://localhost:8020/, in the game's
  own design. It shows the ladder with each bot's 90% range over its rating before the run, with pairs too close to call
  in red; each bot's results against the others, next to what the ratings predict; the head-to-head table, by score or
  by games against the plan, so adaptive allocation can be seen at work; and the model check. It costs the run nothing
  measurable: the ranges are resampled on a thread of their own. [RATING.md](docs/RATING.md) has it, and a new
  step-by-step account of what happens in every run, round, matched pair and game.
- **Node instead of Deno.** Node 24 runs the TypeScript as it is (it strips the types), so nothing gained a compile
  step. `npm install` once, then `npm run dev`, `npm test`, `npm run rate -- 240 --write` and so on; README has the
  list. Tests run on Node's test runner, the rating harness on `worker_threads`, and esbuild comes from npm (a build
  takes a tenth of a second). Formatting is dprint (what `deno fmt` was built on) and linting ESLint. The rating harness
  plays exactly the same games as before, and the game in the browser hasn't changed.
- **Tests at 100% coverage**, of lines, branches and functions in everything the tests load (the page itself needs a
  browser and is checked by hand). `npm run coverage` draws a page per file in `coverage/index.html`, and CI runs the
  tests this way, so a change that leaves new code untested fails its check. The new tests cover storage that refuses to
  write, saved-game edge cases, the dormant bots, the bots' notes, notation edge cases and the tournament's pool.
- **A testing guide**: [docs/TESTING.md](docs/TESTING.md) now says how to run the tests, what to run before a push, and
  how to write a test (names, assertions, positions, seeds), beside what each file covers.
- **The docs have an index**, [docs/README.md](docs/README.md), grouped by what you're about to do, and their images
  moved to `docs/images/`.

## v2.3.0 · 2026-10-15

- **A tidier toolbar** in three groups: New game and the opponent; Undo, Hint and Skip as icon buttons (Replay takes
  Skip's place when a game is over); and Sound, Your games, Settings and How to play. Every icon button names its key in
  a tooltip. The opponent button names the bot without its Elo, which stays in the list. On a phone it's two rows, not
  three.
- **Re-rated with eighteen bots** over 240 games a pairing: every bot is above the next one down in at least 91% of
  resampled fits. Elo against time per move is in `data/elo-time.json` after a run.
- The Elo fit's virtual draw scales with each pairing's games, so adaptive runs don't squeeze the ends of the ladder;
  plain runs fit exactly as before.
- **Two more bots** in the ladder's widest gaps: Mild (Fickle: Hoarder or Generous) and Clever (Sometimes planner).
- **Save as MGN** in Your games: your games as text, in the notation the tournament uses.
- **Site icons**: a PNG favicon and an Apple touch icon, so the site looks right as a bookmark and on a home screen.
- **Adaptive allocation** (`deno task rate 240 --adaptive`): close pairings get many games, lopsided ones as few as 10,
  planned from the current ratings, played from one queue. See docs/RATING.md.
- The rating run times every bot's moves: a "ms a move" column, and `data/elo-time.json` for a chart.
- Pushover searches 3 moves deep instead of 4: just as hopeless, 5.5× quicker.
- **The rating run reports two more things:** "Above next", how sure each bot is of its place over the next one down
  (saved as `above` in the ratings; the ladder chart marks pairs under 90%), and a model check that flags any pairing
  the ratings don't explain.
- **More tests**, and a guide to them ([docs/TESTING.md](docs/TESTING.md)): the engine over 3000 random games, the
  rating harness (same games on any number of workers, and a snapshot), strength checks in their own file, and a check
  that every link in the docs resolves. `deno task coverage` shows what nothing tests.
- The docs (BOTS, DESIGN, NOTATION, RATING, TESTING) moved into `docs/`, so the root holds only the README, the
  changelog, the licence and the to-do list.
- **Sound is a button in the toolbar**, off until you press it (and remembered); Settings no longer has the Sound box.
- **A new visitor plays Random** (Easy) to start with, not Lookahead.
- **One icon set.** Every icon is an outline on a 24px grid with a 2px line, from one sprite (`public/svg/icons.svg`,
  beside the favicon in `public/svg/`); the filled rule-card icons and the CSS-drawn chevrons were redrawn to match.
  DESIGN.md has an Icons section, and `deno task icon-sheet` draws them all to
  [docs/images/icons.png](docs/images/icons.png).

## v2.2.3 · 2026-10-15

- **First is dormant.** It always played its leftmost pit, and with matched pairs it rated level with Random (999
  against 1000), so it added no step to the ladder. It's out of the menus but kept in the code; games you played against
  it still count toward your rating and still show in Your games. Re-rated without it over 240 games a pairing: every
  90% range within ±26, and two neighbouring pairs too close to call.
- **RATING.md**, one guide to rating the bots: when to re-rate, how many games, the commands, how to read the ranges,
  where a new bot should land and what to update after. Two diagrams go with it: a rating session in five steps, and how
  to read a rating. The README and BOTS.md now link to it instead of repeating it.
- **A truthful ETA** during a rating run: it counts rounds rather than games, so it no longer reads far too short early
  on. Pairings now run slowest first, so the cores stay busy to the end of each round. Results are unchanged.

## v2.2.2 · 2026-10-15

- **A new opponent picker.** The long dropdown is now a list grouped by strength (Strong, Club, Learner, Starter), each
  bot with its level, its algorithm, its Elo and a bar for where it sits on the ladder; a friend on the same screen is
  at the top. Keyboard and screen readers work as with a native list.
- **Faster ratings.** The rating harness plays pairings in parallel, one per CPU core, and the Elo fit, sowing and
  search all do less work, with the same results. A 4-game run went from 37 s to 10 s on 16 cores.
- **Re-rated with 240 games a pairing**, four times as many, in 5 minutes. Every 90% range is now within ±25 (it was
  ±40), and only three neighbouring pairs are too close to call. Each pairing now has its own seed, so every number
  moved a little; the ends of the ladder spread out (Minimax 2064, Pushover 494).
- `deno task tournament` is now `deno task rate`, so "test" means only the test harness (`deno task test`) and rating
  the bots has its own name. The test harness runs its files in parallel (`--parallel`).

## v2.2.1 · 2026-10-15

- **No more broken page after a release.** A browser that visited before could load the new page with its old cached
  script (GitHub Pages lets browsers keep files for 10 minutes) and stop at "Setting up". The build now stamps the
  page's script, stylesheet and bot worker with a hash of the sources (`app.js?v=…`), so a page only ever loads the
  files built with it.

## v2.2.0 · 2026-10-15

- A roadmap: TODO.md now lists the next three releases, each a
  [GitHub milestone](https://github.com/seven-leven/mancala/milestones) with an issue per item.
- The bots and the tournament are split into folders (`src/bots/players/`, `src/bots/search/`, `tools/tournament/`).
  Nothing plays differently: the tournament prints exactly what it did before.
- **Seventeen bots.** Nine new ones, each placed in a gap in the ladder, since games between bots close in strength tell
  you the most: Gentle (Sometimes generous), Thrifty (Hoarder), Bold (Striker), Relaxed (Sometimes greedy), Careful
  (Turtle), Crafty (Spoiler), Keen (Chainer), Thoughtful (Planner) and Sharp (Shrewd). Rated over 60 games a pairing,
  every 90% range is within ±40. A Grandmaster is built but dormant: it rated level with Minimax for five times the
  time.
- **New scoring pieces** for the bots: free turns set up, capture threats, exposed seeds, mobility. Together, in a
  two-move search, they're worth about 75 Elo over the store lead alone (Planner).
- **A new How to play popup**: the turn in three steps, the three rules as cards, a word of strategy and how to win,
  with the house rules kept live.
- **The ladder as a chart**: `deno task ladder` draws [docs/images/ladder.svg](docs/images/ladder.svg) from the ratings,
  marking neighbours too close to call; the README shows it.
- `deno task profile` shows where a tournament round spends its time; TODO.md's v2.5 lists what to speed up.
- **Fairer ratings.** The tournament plays matched pairs (each opening once from each seat), can deal symmetric random
  boards (`--openings symmetric`), stops on a time budget (`--time 10m`), saves after every round and resumes
  (`--resume`), and shows its progress on one line that fits the terminal. All the ratings changed; see the README.
- **A bot standard.** [BOTS.md](docs/BOTS.md) and TypeScript contracts every bot follows; the existing bots were
  rewritten against them and play exactly as before.
- **Game notation.** [NOTATION.md](docs/NOTATION.md): a game as text, like chess's PGN. The tournament can record every
  game (`--record`), and `deno task positions` turns them into training data for the evaluation.
- `main` is protected: only pull requests whose checks pass. `deno task release` now ships `dev` through a pull request
  instead of pushing to `main`.
- Seeds per pit (a house rule) is now a slider from 3 to 15; 7 is still the standard.
- The player menus in Settings no longer stick out of the dialog with long bot names.

## v2.1.3 · 2026-10-15

- The version has its own place in the footer, beside "Source on GitHub", and links to this changelog. The build writes
  it into the page, so it shows even before the script loads (and you can tell at a glance which version your browser
  has).

## v2.1.2 · 2026-10-15

- **Games against a newly picked opponent are rated again.** Choosing an opponent before the first move just switches
  bots; choosing one after moves have been played starts a new game, instead of quietly marking the game "players
  changed midway". (Spotted while testing: two wins came out unrated.)
- If you change opponent while a bot is thinking, the new one takes over instead of the game stalling.
- Your games says why a game wasn't rated, under the game, so it can be read on a phone.

## v2.1.1 · 2026-10-15

- A LICENSE (all rights reserved, like the folio), and the README links the
  [full story](https://seven-leven.github.io/folio/code-mancala.html) on the folio.

## v2.1.0 · 2026-10-15

- **Eight bots on an Elo ladder.** New, weakest first: Pushover (searches ahead to lose by as much as it can), Generous
  (Greedy's opposite), First (always its leftmost pit) and Lookahead (a short search that varies its play). Players see
  everyday names (Hopeless, Very easy, Easy, Casual, Average, Tricky, Hard, Expert); the algorithm and its Elo follow in
  the menus.
- **Ratings with honest error bars.** `deno task tournament` plays every pairing, fits Elo to all the results at once,
  and gives each a 90% range by resampling, since a 100% pairing only shows "much stronger". `--write` saves the ratings
  for the menus (`src/bots/ratings.ts`).
- **A stronger Minimax.** A transposition table: on the same 300 ms it solves 25 of 30 benchmark positions instead of
  21, and searches 7.6 moves deep on the rest instead of 5.0 (`deno task bench`).
- **Your games and rating.** Finished games are saved in the browser, each with the bot's rating at the time, so new
  bots never rewrite old results. Your own Elo is replayed from them; a game is rated when it's you against one bot,
  standard rules, no Undo or Hint. A "Your games" dialog shows the rating, its trend, your record against each bot and
  recent games. "Save a copy" and "Load a copy" keep a backup, and the game asks the browser to keep its storage.
- Replay a finished game; search bots say what they saw in the move log ("saw 9 moves ahead, +12"); optional sound; the
  rules explain the first-move edge.
- The README, this changelog, and fresh screenshots.

## v2.0.1 · 2026-10-15

- **Captures fixed.** Only the pit opposite goes to the store; the seed that ended the turn stays where it landed. Every
  version since the first had banked that seed too. (Spotted while testing the live game.)
- Line endings pinned to LF, so `deno fmt` and Git agree on Windows.

## v2.0.0 · 2026-10-14

A rewrite in TypeScript.

- The rules in one pure engine (`src/game/engine.ts`) with tests, and house rules for seeds per pit, which side
  captures, and the early finish.
- Bots in a Web Worker, so the page never freezes; a new alpha-beta Minimax that follows free-turn chains without using
  up depth.
- A new interface built to [DESIGN.md](docs/DESIGN.md), which borrows the
  [folio](https://seven-leven.github.io/folio/)'s design language: paper and ink themes, a wooden board with drawn
  seeds, who plays each side and who goes first, undo, hint, skip, a move log, keyboard play and a phone layout.
- Built with esbuild (as WebAssembly) by Deno; CI checks every push and deploys `main` to the `gh-pages` branch; `deno
  task release` ships `dev` to `main`.

## v1.1 · 2026-07-03

- The rules in one place: `playTurn()` records an event log and the animation replays it, so the screen can't disagree
  with the rules.
- A bot registry with a new Greedy bot; the opponent menu fills itself from it.
- A turn banner, a Skip button, a "How to play" popup, and the game ends early once a store holds more than half the
  seeds.

## v1.0 · 2025-08-28

The first web version, built in a day: plain JavaScript modules, no build step.

- Player against player, or against a Random or DFS bot, with stone-by-stone animation.
- The same day it was split up: the board state, the rules, the bots, the animation and the screen each got their own
  module (`state.js`, `logic.js`, `bots.js`, `animation-handler.js`, `ui.js`, `game-controller.js`). Captures were
  limited to your own side.

## Before this repo

- **December 2022:** a command-line ohvalhugondi in Python, written to build a bot that could beat my grandmother. The
  bot didn't come until later.
- **August 2024:** the DFS bot, worked out without AI help in Google Colab: it follows chains of free turns to the
  fullest store. It's the DFS bot here.
