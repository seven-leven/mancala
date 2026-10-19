# To do

What's next, in order, and what was decided. Each version below is a release and a
[GitHub milestone](https://github.com/seven-leven/mancala/milestones), with an issue per item; work them top to bottom.
Done items stay ticked for a release or two, then go.

## Roadmap

| Milestone                                                                          | Goal                                                | Done when                                                      |
| ---------------------------------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------- |
| **[v2.2 · Fairer ratings](https://github.com/seven-leven/mancala/milestone/1)**    | Ratings that measure play, not the first-move edge  | The tournament plays matched pairs and can pause and resume    |
| **[v2.3 · Bots in the gap](https://github.com/seven-leven/mancala/milestone/2)**   | Fill the two widest gaps that matter with real bots | A bot near 1580 and one near 850; no gap over 175 Elo          |
| **[v2.4 · A stronger Expert](https://github.com/seven-leven/mancala/milestone/3)** | A better evaluation and search at the top           | New Minimax beats v2.3's Minimax in an SPRT over matched pairs |
| **v2.5 · Faster**                                                                  | Tournaments and searches that cost less time        | A 60-game rating run of every bot in BOTS runs under 3 minutes |
| **Research** (no release)                                                          | Questions about the game itself                     | Each answer is written up in the README or on the folio        |
| **Parked**                                                                         | Ideas that don't pay for themselves yet             | Revisit only when the trigger listed next to them happens      |

Why this order: v2.3 and v2.4 both need ratings you can trust to tell whether a change helped, so the tournament comes
first. v2.3's bots are built from the evaluation pieces v2.4 then tunes.

## [v2.2 · Fairer ratings](https://github.com/seven-leven/mancala/milestone/1)

Before v2.2 the tournament played a round robin where every game had its own opening (two random moves), so a lucky
opening counted for whoever had it. It now plays matched pairs.

- [x] [#18](https://github.com/seven-leven/mancala/issues/18) **Reorganise, move only.** Bots split into
      `src/bots/players/` and `src/bots/search/` (`bots.ts` stays the one entry point), and the tournament into
      `tools/tournament/` (`main.ts`, `elo.ts`). The tournament prints exactly what it did before.
- [x] [#2](https://github.com/seven-leven/mancala/issues/2) **Matched pairs.** Play each opening twice, the bots
      swapping sides on the second game; score the pair, not the game. A board that simply favours the first player then
      comes out 1–1.
- [x] [#3](https://github.com/seven-leven/mancala/issues/3) **Symmetric random starts** as a second opening mode: 49
      seeds a side, 3–10 per pit, the same on both sides, stores empty. Needs a way to start `newGame()` from a given
      layout (the rules stay in `src/game/engine.ts`). Test that both sides always hold the same seeds. Mirrored by
      seat: Player 1's pit i matches Player 2's pit 13 − i.
- [x] [#4](https://github.com/seven-leven/mancala/issues/4) `--openings random-moves|symmetric|standard` on the
      tournament (keep the two random moves as the default until the symmetric mode is proven).
- [x] [#5](https://github.com/seven-leven/mancala/issues/5) `--time 10m` / `--games N` budgets, and a checkpoint file
      (git-ignored) saved after every round of pairs, so a long run can stop and resume without losing games. `--resume`
      replays exactly what a straight run would.
- [x] [#6](https://github.com/seven-leven/mancala/issues/6) A live progress line: elapsed, games, games a second, ETA.
- [x] [#7](https://github.com/seven-leven/mancala/issues/7) Strength checks in the test harness, in their own file
      (`tests/strength_test.ts`, so the runner runs them beside the rest), kept under 20 s: Lookahead beats Random,
      Greedy beats Pushover, Minimax beats Pushover. (Minimax beats Random and Greedy is already there, in
      `tests/bots_test.ts`; move it over.)
- [x] [#8](https://github.com/seven-leven/mancala/issues/8) Re-run `npm run rate -- --write`, and update the README
      table and its "how the ratings are made" paragraph. Rated with all twelve bots (see v2.3).

Later: give close pairings more games than lopsided ones. Now planned as adaptive allocation, in v2.5.

## [v2.3 · Bots in the gap](https://github.com/seven-leven/mancala/milestone/2)

Every bot follows [BOTS.md](docs/BOTS.md): the contract in `src/bots/contracts.ts`, one entry in `BOTS`, a family file
in `src/bots/players/`.

- [x] **A bot standard.** BOTS.md, TypeScript contracts (`Bot`, `BotSpec`, `BotContext`, `Evaluator`), and the eight
      existing bots rewritten against them (they play exactly as before: the tournament repeats game for game). The
      tournament now rates whatever is in `BOTS`.
- [x] [#9](https://github.com/seven-leven/mancala/issues/9) **Evaluation pieces** in `src/bots/search/evaluate.ts`, each
      a small function so bots can weigh them differently:
  - [x] store lead and seeds on your side (`banked`, `onSide`);
  - [x] exposure: loaded pits opposite an empty pit (`exposed`; Turtle uses it);
  - [x] free turns ready: pits whose seeds land exactly in your store (`freeTurnsReady`);
  - [x] threats: your empty pits opposite their loaded ones (`threats`; Striker uses it);
  - [x] mobility: few legal moves left is bad (`mobility`). All five together (`planned`) are worth about 75 Elo over
        the store lead alone in the same two-move search: Planner.
- [x] [#10](https://github.com/seven-leven/mancala/issues/10) New bots, placed by where they'd firm up the ratings most
      (games near 50% carry the most information; see BOTS.md, "Where a new bot should land"): **Sometimes generous**
      (Gentle, 731), **Sometimes greedy** (Relaxed, 1203), **Turtle** (Careful, 1288) and **Chainer** (Keen, 1462). Each
      has one knob that places it. Striker and Denier (as Spoiler) followed with the six below.
- [x] [#11](https://github.com/seven-leven/mancala/issues/11) Rated and kept: the widest gap went from 422 to 269 Elo,
      and every rating's 90% range is 25–35% narrower.
- [x] [#12](https://github.com/seven-leven/mancala/issues/12) README table, CHANGELOG.
- [x] **Game notation (MGN).** [NOTATION.md](docs/NOTATION.md): games as text, checked against the engine both ways.
      `npm run rate -- --record` saves every game, and `npm run positions` turns them into training data for #15.
- [x] **Six more bots** (eighteen in all): Hoarder, Striker, Spoiler, Planner, Shrewd and Grandmaster, each placed in a
      gap with a quick rating script before the full run. Grandmaster rated level with Minimax for five times the time,
      so it's dormant (see v2.5).
- [x] **A new How to play popup**: steps, three rule cards, a strategy tip, and the house rules kept live.
- [x] **Two more bots for the two widest gaps that matter** Done: Clever (Sometimes planner, 1566) and Mild (Fickle,
      831), placed with a quick rating, then the full run. Was: (see RATING.md, "The ladder's shape"; place each with a
      quick rating against its neighbours, then the full run):
  - [x] one between Thoughtful (Planner, 1685) and Keen (Chainer, 1477), about 1580: the middle of the ladder, where
        players climb. Say Planner mixed with Greedy, or Lookahead with a lower pick of its better moves;
  - [x] one between Gentle (Sometimes generous, 757) and Thrifty (Hoarder, 943), about 850: say Hoarder mixed with
        Random, or Sometimes generous with a lower q.
  - Dropped: the two planned between Casual (First) and Bold (Striker). After the 240-game run that gap is 148 Elo, fine
    as it is.
- [x] Let players export their saved games as MGN. Done: Your games has "Save as MGN" (`gamesToMgn` in
      `src/app/history.ts`, with a test). Was: Let players export their saved games as MGN from Your games (today the
      backup is JSON).

## [v2.4 · A stronger Expert](https://github.com/seven-leven/mancala/milestone/3)

- [ ] [#13](https://github.com/seven-leven/mancala/issues/13) Capture extension: like the free-turn extension (12 in a
      row today), keep searching past the depth limit after a capture, so the search doesn't stop just before the reply.
- [ ] [#15](https://github.com/seven-leven/mancala/issues/15) Tune the evaluation weights from self-play (Texel's
      method: fit the weights so the evaluation predicts game results). Keep a weight set only if it wins a matched-pair
      match against the old one.
- [ ] [#16](https://github.com/seven-leven/mancala/issues/16) Try an MCTS bot (UCB1, random playouts). If it rates above
      Minimax, it becomes the new top level.
- [ ] **A sequential test (SPRT) for "does the new version beat the old one?"** For #15 and #16: play matched pairs
      until the evidence is strong enough either way, then stop, as chess engines are tested. A clear yes or no in the
      fewest games, instead of guessing that 240 is enough. Its formulas go in RATING.md's maths.
- [ ] [#17](https://github.com/seven-leven/mancala/issues/17) A **pie rule** house rule: after the first move, the
      second player may swap sides. A real answer to the first-move edge for human games, beside choosing who goes
      first.
- [ ] [#14](https://github.com/seven-leven/mancala/issues/14) Last in v2.4 (the profile: building keys is 1.5% of the
      time). Faster table keys: the transposition table keys positions by a 17-character string; a number (Zobrist
      hashing) should be cheaper. Measure with `npm run bench` before keeping it.

## v2.5 · Faster

What a tournament round spends its time on, from `npm run profile` (one round of 18 bots, 306 games) and per-bot timing,
October 2026: Grandmaster 78% of the time, Minimax 14%, Pushover 7%, the other fifteen bots under 1% together. Inside
the searches: the alpha-beta loop 31%, sowing and playing turns about 29%, the garbage collector 9%, fitting the ratings
18% of that short run (a fixed ~2 s). Ordered by what each should save. Measure before and after each one with `npm run
profile` and `npm run bench`; keep a change only if the tournament still prints the same results.

- [x] **Play pairings in parallel.** Each pairing's games are independent: hand them to Web Workers (one per CPU core)
      and merge the results by round, so checkpoints and seeds stay exactly as they are. The biggest win on a long run:
      roughly ×(cores) of wall-clock time.
- [x] **Fit the ratings once per result, not once per step.** `fit()` re-adds every pairing's results on each of its
      1000 steps, and the 90% ranges call it 300 times. Sum each pairing's wins and games once, then iterate on the
      sums: the ~2 s fixed cost drops to a few ms.
- [x] **Sow without the Map.** `sow` looks up the next pit in a `Map` on every seed: a 16-entry array (or a little
      arithmetic) is cheaper. Skip building the event log entirely when `record` is false, rather than calling an empty
      `log`.
- [x] **Copy less while searching.** Every child position is a full copy (`cloneState`, a new 16-number array), which is
      most of the garbage collection. Play and undo moves on one board inside the search, or reuse a pool of boards.
- [x] **Order moves without sorting objects.** `children()` builds an object per move, plays each move to score it, then
      sorts: keep the played positions, and use a small insertion sort on parallel arrays instead.
- [x] **Re-rated after the speed-ups**, with 240 games a pairing (4× as many) in 5 minutes: every 90% range within ±25
      (was ±40), three neighbouring pairs too close to call (was five). `npm run rate -- 4`: 37 s → 10 s (16 cores);
      bench 1220k → 1769k positions/s; rating fit 55 s → 0.7 s. Next: Pushover below.
- [x] **A truthful ETA.** It counts rounds, not games: the median of the last five round times, plus what's left of this
      round weighted by each pairing's last time. Pairings also run slowest first, so a round no longer ends with one
      long Minimax pairing while the other cores wait. Same results.
- [x] **Adaptive allocation** (`--adaptive`). Done, with the virtual draw scaled to each pairing's games: from 480, ±27
      in 49 s against a plain 240-game run's ±22 in 220 s, 16 of 18 bots inside its ranges (docs/RATING.md, "Adaptive
      allocation"). Kept for quick re-rates; plain runs still write the menu ratings. Was: Lopsided pairings carry
      almost no information (a game is worth p(1−p), close to 0 at 98–100%), and the slow searchers at the top make them
      the costliest games. Give each pairing `max(10, round(G × 4p(1−p)))` games, p from the current ratings. Rules: fix
      the allocation before the run (from `ratings.ts` or a short pilot), never from results as they come in, which
      would bias the fit and the ranges; keep the floor of 10 so a non-transitive bot still shows; keep every bot well
      linked to Random. Play it as one queue, slowest pairing first, with no round boundaries, and checkpoint every so
      many finished pairs. Show games played in the Won and head-to-head tables, and add it to RATING.md. Keep it only
      if it gives today's ±25 ranges in clearly less time than a plain 240-game run, with ratings inside those ranges.
- [x] **Pushover: prune or cap.** Done: depth 3, 5.5× faster (1.0 ms a move against 5.6), and just as hopeless (0.5 of
      80 games against Random, 36 against Generous; depth 4: 1 and 38). Was: It's 7% of the time because a search that
      wants to lose can't prune. A smaller depth or a time cap would do; it's the weakest bot either way.
- [ ] **Grandmaster, dormant until it pays.** Depth 10 gained 7 Elo over Minimax's depth 6 for 5× the time, and some
      moves took 9 s. Bring it back with something that makes depth count (a better evaluation, #15; a capture
      extension, #13), or a time cap, and keep it only if it rates clearly above Minimax.
- [x] Re-rank [#14](https://github.com/seven-leven/mancala/issues/14) (Zobrist keys): moved to the end of v2.4.:
      building keys is only 1.5% of the time, so it's the least of these.
- [ ] **WebAssembly**, still parked (see Parked): every item above is cheaper and comes first.

## Test harness

Done (October 2026) but for the page tests: see [docs/TESTING.md](docs/TESTING.md). They were worked before v2.3's new
bots and v2.5's adaptive allocation, which both lean on them. The strength checks are
[#7](https://github.com/seven-leven/mancala/issues/7), under v2.2.

- [x] **Random-game invariants for the engine.** Play a few thousand random games from random seeds and openings, and
      check after every turn: no seed created or lost, the game always ends, the event log replays to the final
      position, `playTurn` never changes its input. Today these are checked on a handful of hand-made positions.
- [x] **Repeatability of the rating harness.** A tiny run (Random, Greedy, First, 4 games) prints the same table with 1
      worker as with 4, and matches a saved snapshot. Turns "same results" from a check by hand into a test, for
      adaptive allocation and every speed-up after it.
- [x] **A docs link check.** Every relative link and `#anchor` in the `.md` files resolves, so RATING.md, BOTS.md and
      the README can't drift apart when a heading changes.
- [x] **Coverage, at 100%.** `npm run coverage` runs the tests under c8: a table, a page per file in
      `coverage/index.html`, and a failure under 100% of lines, branches or functions. CI runs the tests this way, so a
      PR that leaves new code untested fails. Five guards that can't run are marked `/* c8 ignore */` with the reason.
- [x] **A testing guide** ([docs/TESTING.md](docs/TESTING.md)): running the tests and the checks to run before a push,
      what each file covers, the conventions for writing a test, and the coverage rule.
- [ ] **Tests for the page.** `src/main.ts`, `src/app/game.ts` (undo, hint, which games are rated), `src/ui/` and
      `src/bots/client.ts` need a DOM, so nothing tests them and coverage doesn't count them. A DOM for the tests (such
      as happy-dom) would bring them in; start with `game.ts`, which decides which games are rated.

## Rating statistics

Small additions to the rating harness's output, each an hour or so. Document each in RATING.md's maths when it lands.

- [x] **"Is A stronger than B?" as a probability.** The 300 resampled fits are already there: report the share where
      each bot ranks above its neighbour ("Chainer above Spoiler in 81% of resamples"), in place of overlapping ranges
      alone, and use it for the ladder chart's red marks.
- [x] **A check that the model fits.** Compare each pairing's win rate with what the ratings predict, and flag pairings
      that miss by more than chance: a bot that isn't transitive (beats strong bots, loses to weak ones) shows up here.
      A safeguard for adaptive allocation, which plays fewer lopsided games.

## Interface

- [x] **One icon set, written into DESIGN.md.** Done: `public/svg/icons.svg` (with the favicon in `public/svg/`),
      `src/ui/icons.ts`, DESIGN.md's Icons section; the CSS chevrons are icons now. The sheet is docs/images/icons.png
      (`npm run icon-sheet`), shown in DESIGN.md and on the design guide page. Was: Today the site mixes three styles:
      outline icons with a 2 px stroke on the masthead buttons (stats, settings, how to play), filled icons on the close
      button and the four rule cards in How to play, and CSS-drawn chevrons with a 1.5 px line on the opponent picker
      and the selects. Pick one style (outline, 24 px grid, one stroke width, round caps and joins, `currentColor`),
      redraw the odd ones out, and keep them in one place (a sprite or `src/ui/icons.ts`) instead of pasted into
      `index.html`. Then add an Icons section to DESIGN.md: the grid and stroke, sizes (16 px in buttons, larger in
      cards), colour, the `aria-label` rule for icon-only buttons, and a sheet of every icon with its name and use, also
      shown on the design guide page.
- [x] **Site icons beyond the SVG favicon.** Done: `public/png/favicon-32.png` and `apple-touch-icon.png`, rendered by
      `npm run icon-sheet`, in DESIGN.md's Icons section. Was: A PNG fallback and an Apple touch icon (180 px), in the
      same mark, so the site looks right as a bookmark and on a phone's home screen. Add them to DESIGN.md's Icons
      section.

## Dashboard 2.0

Ideas for the rating dashboard (`npm run rate -- --ui`, `tools/dashboard/`), roughly by how much each would help. Each
one must keep the rule the first version kept: a run plays and prints the same with the page open or closed, at no
measurable cost.

- [ ] **Ratings converging.** Each bot's rating and range over the games played, narrowing as the run goes. It answers
      "is this run long enough?" by eye, and shows a bot still moving when the run ends.
- [ ] **A game viewer.** Click a head-to-head cell to replay that pairing's games on the game's own board, move by move
      from the MGN. Most useful for pairings the model check flags: see _why_ Striker scores against DFS.
- [ ] **Run history.** Save each run's results (`data/runs/<date>.json`) and compare any two: which bots moved, and was
      it more than their ranges? Today "before" only means the ratings in `src/bots/ratings.ts`.
- [ ] **Controls on the page.** Stop after this round (what Ctrl+C does), and, once a run is done, "Write these ratings"
      (`--write`) after reading them. Writes the same files the terminal would; asks first.
- [ ] **Start a run from the page.** Pick the bots, games, openings, adaptive or not, and go: the dashboard as a small
      local lab (`npm run lab`), not only a view of a run started in the terminal.
- [ ] **Placing a new bot.** With `--bots`, show the new bot's live rating between its neighbours and how sure its place
      is, to settle "where does it land?" without reading tables (RATING.md, "Placing a new bot").
- [ ] **SPRT matches.** For v2.4's "does the new version beat the old one?": the live log-likelihood ratio between its
      two bounds, and a verdict the moment it crosses one.
- [ ] **Elo against time per move.** The chart `data/elo-time.json` is written for, live: which bots buy strength with
      time, and which waste it (Grandmaster).
- [ ] **The workers.** What each worker is playing now and for how long, and how busy the pool is: shows a slow pairing
      holding up the end of a round.
- [ ] **The game itself.** Live statistics from the recorded games: first-move edge by opening, game length, and the
      research measures (progress, entropy, relays; research/PLAN.md) by bot strength.
- [ ] **Export.** The ladder and tables as SVG or PNG, ready for a research post or the README.

## The folio page

[seven-leven.github.io/folio/code-mancala.html](https://seven-leven.github.io/folio/code-mancala.html), in the folio
repo. It still describes v2.1: eight bots, 40 games a pairing, the first Elo ladder.

- [ ] **Bring it up to date.** Status and version; the number of bots, Hopeless to Expert; "every bot played every other
      240 times, in matched pairs" and today's ladder with its ranges (from `src/bots/ratings.ts`, or the
      [ladder chart](docs/images/ladder.svg)). Expert and Hard no longer overlap (Minimax won 57% of 240). Fix "a bot
      that always plays its leftmost pit beats one that plays at random three times in four": with matched pairs First
      and Random came out level (999 against 1000), and First is now dormant. Mention the new opponent picker and the
      faster rating harness, in a sentence each.
- [ ] **A short section on the bots.** One line each, in the folio's voice, grouped as the picker groups them (Strong,
      Club, Learner, Starter): what each one does and roughly how strong it is, from the `blurb` in `src/bots/bots.ts`.
      End with the dormant ones (Grandmaster, First) and why they're resting.

## Research

None of these ship in the game; each ends as a post in [research/](research/README.md), which has the plan
([research/PLAN.md](research/PLAN.md)) and a list of post ideas.

- [x] Does the first player win by force? Yes: pit 1 opens a free-turn chain that clinches (see the README).
- [ ] Opening statistics: average chain length, seeds per relay, game length; each opening pit's result.
- [ ] Rule balance: over a few thousand games, which best cancels the first-move edge: the pie rule, no relays on turn
      one, or a simultaneous start (as in traditional congkak)?
- [ ] Solve small boards completely (3 pits × 3 seeds, 4 × 4), backwards from the end, and compare with Minimax.
- [ ] A perfect-play endgame table for the real board. This is the one place WebAssembly would earn its keep (see
      Parked).

## Parked

- **A Rust core compiled to WebAssembly.** Revisit only for the endgame table above, or if `npm run bench` shows the
  engine itself (not the search) is the limit.
- **WebGPU.** Fast for many random or MCTS playouts at once, poor for alpha-beta. Revisit only if the MCTS bot needs far
  more playouts than the CPU gives.
- **Numeric bot IDs (`TT.DD.HH`) and a registry/factory.** Eight to a dozen bots fit in `BOTS` with readable names.
  Revisit past about twenty.
- **A new directory layout.** The layout in the README stays (the move to Node kept it).
- **Cycle detection in relays.** Not needed: every lap banks a seed, `engine.ts` stops after 100,000 drops anyway, and
  the tournament stops a game at 1,000 moves.

- **Glicko-2 for the player's rating.** It would track an uncertainty per player ("1240 ± 180 after 5 games") in place
  of K = 32's swings. Revisit when the stats dialog gets attention; it doesn't help the bots.
- **Fitting on score margins, or Bayesian and multi-dimensional rating models.** More information per game, but they
  change what Elo means, and they're more than 17 bots need. Revisit only if the model-fit check finds bots Elo can't
  place.

## Decided

- **Keep esbuild; not Rollup or Rolldown.** Rollup needs a plugin even to read TypeScript. Rolldown is fast and handles
  TypeScript itself, but for a 40 kB app with two entry points that esbuild builds in a tenth of a second, neither would
  change anything you can see. Worth revisiting only if the game moves to Vite, which now uses Rolldown.
- **Node, not Deno** (October 2026). Node 24 runs the TypeScript directly by stripping the types, so the move kept every
  tool and test as TypeScript with no compile step. The rating harness plays exactly the same games.
- **No WebAssembly engine.** Minimax already solves most positions in a fraction of a second; a transposition table gave
  the speed-up WASM would have (see `npm run bench`).
- **Elo, read with care.** 100% pairings don't say how much stronger a bot is, so the tournament reports 90% ranges and
  the README says to read the ratings as a ladder.
