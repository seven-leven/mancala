# To do

What's next, in order, and what was decided. Each version below is a release and a
[GitHub milestone](https://github.com/seven-leven/mancala/milestones), with an issue per item; work them top to bottom.
Done items stay ticked for a release or two, then go.

## Roadmap

| Milestone                                                                          | Goal                                                       | Done when                                                       |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------- |
| **[v2.2 · Fairer ratings](https://github.com/seven-leven/mancala/milestone/1)**    | Ratings that measure play, not the first-move edge         | The tournament plays matched pairs and can pause and resume     |
| **[v2.3 · Bots in the gap](https://github.com/seven-leven/mancala/milestone/2)**   | Fill the Average (1383) → Tricky (1677) gap with real bots | Two or more new bots land in the gap; ranges there narrow       |
| **[v2.4 · A stronger Expert](https://github.com/seven-leven/mancala/milestone/3)** | A better evaluation and search at the top                  | New Minimax beats v2.3's Minimax over a matched-pair tournament |
| **v2.5 · Faster**                                                                  | Tournaments and searches that cost less time               | A 60-game rating run of every bot in BOTS runs under 3 minutes  |
| **Research** (no release)                                                          | Questions about the game itself                            | Each answer is written up in the README or on the folio         |
| **Parked**                                                                         | Ideas that don't pay for themselves yet                    | Revisit only when the trigger listed next to them happens       |

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
- [ ] [#7](https://github.com/seven-leven/mancala/issues/7) Strength checks in the test harness, in their own file
      (`tests/strength_test.ts`, so `--parallel` runs them beside the rest), kept under 20 s: Lookahead beats Random,
      Greedy beats Pushover, Minimax beats Pushover. (Minimax beats Random and Greedy is already there, in
      `tests/bots_test.ts`; move it over.)
- [x] [#8](https://github.com/seven-leven/mancala/issues/8) Re-run `deno task rate --write`, and update the README table
      and its "how the ratings are made" paragraph. Rated with all twelve bots (see v2.3).

Later, if runs get long: pair bots mainly with their neighbours on the ladder (games near 50% tell the most) instead of
everyone with everyone.

## [v2.3 · Bots in the gap](https://github.com/seven-leven/mancala/milestone/2)

Every bot follows [BOTS.md](BOTS.md): the contract in `src/bots/contracts.ts`, one entry in `BOTS`, a family file in
`src/bots/players/`.

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
- [x] **Game notation (MGN).** [NOTATION.md](NOTATION.md): games as text, checked against the engine both ways.
      `deno task rate --record` saves every game, and `deno task positions` turns them into training data for #15.
- [x] **Six more bots** (eighteen in all): Hoarder, Striker, Spoiler, Planner, Shrewd and Grandmaster, each placed in a
      gap with a quick rating script before the full run. Grandmaster rated level with Minimax for five times the time,
      so it's dormant (see v2.5).
- [x] **A new How to play popup**: steps, three rule cards, a strategy tip, and the house rules kept live.
- [ ] **Four more bots for the two widest gaps left** (place each with a quick rating against a few rated bots, then the
      full run):
  - [ ] two between Casual (First, 1012) and Bold (Striker, 1154), about 1060 and 1110: say Striker mixed with Random,
        or Sometimes greedy with a lower q;
  - [ ] two between Gentle (Sometimes generous, 776) and Thrifty (Hoarder, 951), about 830 and 890: say Hoarder mixed
        with Random, or Sometimes generous with a lower q.
- [ ] Let players export their saved games as MGN from Your games (today the backup is JSON).

## [v2.4 · A stronger Expert](https://github.com/seven-leven/mancala/milestone/3)

- [ ] [#13](https://github.com/seven-leven/mancala/issues/13) Capture extension: like the free-turn extension (12 in a
      row today), keep searching past the depth limit after a capture, so the search doesn't stop just before the reply.
- [ ] [#14](https://github.com/seven-leven/mancala/issues/14) Faster table keys: the transposition table keys positions
      by a 17-character string; a number (Zobrist hashing) should be cheaper. Measure with `deno task bench` before
      keeping it.
- [ ] [#15](https://github.com/seven-leven/mancala/issues/15) Tune the evaluation weights from self-play (Texel's
      method: fit the weights so the evaluation predicts game results). Keep a weight set only if it wins a matched-pair
      match against the old one.
- [ ] [#16](https://github.com/seven-leven/mancala/issues/16) Try an MCTS bot (UCB1, random playouts). If it rates above
      Minimax, it becomes the new top level.
- [ ] [#17](https://github.com/seven-leven/mancala/issues/17) A **pie rule** house rule: after the first move, the
      second player may swap sides. A real answer to the first-move edge for human games, beside choosing who goes
      first.

## v2.5 · Faster

What a tournament round spends its time on, from `deno task profile` (one round of 18 bots, 306 games) and per-bot
timing, October 2026: Grandmaster 78% of the time, Minimax 14%, Pushover 7%, the other fifteen bots under 1% together.
Inside the searches: the alpha-beta loop 31%, sowing and playing turns about 29%, the garbage collector 9%, fitting the
ratings 18% of that short run (a fixed ~2 s). Ordered by what each should save. Measure before and after each one with
`deno task profile` and `deno task bench`; keep a change only if the tournament still prints the same results.

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
      (was ±40), three neighbouring pairs too close to call (was five). `deno task rate 4`: 37 s → 10 s (16 cores);
      bench 1220k → 1769k positions/s; rating fit 55 s → 0.7 s. Next: Pushover below.
- [ ] **A truthful ETA.** The progress line divides games left by the average speed so far, but pairings differ hugely
      in cost (two quick bots finish in milliseconds; anything with Minimax takes seconds), and each round plays the
      quick ones and the slow ones in a fixed order, so the ETA swings and reads far too short early on. Every round
      plays the same pairings: time each pairing in the first round and estimate from those (or from the last complete
      round), and count the work left, not the games left.
- [ ] **Pushover: prune or cap.** It's 7% of the time because a search that wants to lose can't prune. A smaller depth
      or a time cap would do; it's the weakest bot either way.
- [ ] **Grandmaster, dormant until it pays.** Depth 10 gained 7 Elo over Minimax's depth 6 for 5× the time, and some
      moves took 9 s. Bring it back with something that makes depth count (a better evaluation, #15; a capture
      extension, #13), or a time cap, and keep it only if it rates clearly above Minimax.
- [ ] Re-rank [#14](https://github.com/seven-leven/mancala/issues/14) (Zobrist keys): building keys is only 1.5% of the
      time, so it's the least of these.
- [ ] **WebAssembly**, still parked (see Parked): every item above is cheaper and comes first.

## Research

None of these ship in the game; each ends as a note in the README or on the folio.

- [x] Does the first player win by force? Yes: pit 1 opens a free-turn chain that clinches (see the README).
- [ ] Opening statistics: average chain length, seeds per relay, game length; each opening pit's result.
- [ ] Rule balance: over a few thousand games, which best cancels the first-move edge: the pie rule, no relays on turn
      one, or a simultaneous start (as in traditional congkak)?
- [ ] Solve small boards completely (3 pits × 3 seeds, 4 × 4), backwards from the end, and compare with Minimax.
- [ ] A perfect-play endgame table for the real board. This is the one place WebAssembly would earn its keep (see
      Parked).

## Parked

- **A Rust core compiled to WebAssembly.** Revisit only for the endgame table above, or if `deno task bench` shows the
  engine itself (not the search) is the limit.
- **WebGPU.** Fast for many random or MCTS playouts at once, poor for alpha-beta. Revisit only if the MCTS bot needs far
  more playouts than the CPU gives.
- **Numeric bot IDs (`TT.DD.HH`) and a registry/factory.** Eight to a dozen bots fit in `BOTS` with readable names.
  Revisit past about twenty.
- **A new directory layout and npm scripts.** The project is Deno with `deno task`; the layout in the README stays.
- **Cycle detection in relays.** Not needed: every lap banks a seed, `engine.ts` stops after 100,000 drops anyway, and
  the tournament stops a game at 1,000 moves.

## Decided

- **Keep esbuild; not Rollup or Rolldown.** Rollup needs a plugin even to read TypeScript. Rolldown is fast and handles
  TypeScript itself, but ships as native npm binaries, while esbuild runs here as WebAssembly with no npm at all. For a
  21 kB app with two entry points that builds in half a second, neither would change anything you can see. Worth
  revisiting only if the game moves to Vite, which now uses Rolldown.
- **No WebAssembly engine.** Minimax already solves most positions in a fraction of a second; a transposition table gave
  the speed-up WASM would have (see `deno task bench`).
- **Elo, read with care.** 100% pairings don't say how much stronger a bot is, so the tournament reports 90% ranges and
  the README says to read the ratings as a ladder.

## Done in v2.1.1

- [x] A LICENSE: all rights reserved, like the folio.
- [x] The folio's story page for this project: seven-leven.github.io/folio/code-mancala.html (a Coding entry page, with
      the bots' Elo ladder and the first-move result).

## Done in v2.1.0

- [x] Rewrite the README (now README.md), and add a CHANGELOG.md written from the git history.
- [x] Seed spacing scales with the count; fresh full-page screenshots, light and dark; the design sheet re-rendered.
- [x] deno.lock trimmed (Deno dropped the folio's packages itself).
- [x] Weaker levels so Expert isn't the only search bot: Lookahead (Tricky), plus Generous, Pushover and First.
- [x] The first-move edge, in the rules dialog and the README.
- [x] A stronger Minimax: a transposition table (21 → 25 of 30 benchmark positions solved in 300 ms).
- [x] Elo for the bots (`deno task rate`, with ranges), and for you, from games saved in the browser.
- [x] The bots' thinking in the move log; Replay; sound (off by default).
- [x] Everyday level names for the bots (Hopeless … Expert).
- [x] Saved games survive: the browser is asked to keep its storage, and Your games can save and load a backup.
- [x] Repo description, website and topics on GitHub; CI caches Deno modules and esbuild.

## Done in v2.0.1

- [x] Captures bank only the pit opposite; the landing seed stays put.

## The folio (done alongside v2.1.0, in the folio repo)

- [x] Link the Aug 2024 entry to the game and the repo.
- [x] The folio's mancala animation follows the game's rules.
- [x] The entry mentions the TypeScript rewrite.
