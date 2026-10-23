# Experiment log

One entry per experiment, newest first: the question, how it was tested, what came out, and what was decided. An
experiment that shipped is also in the [CHANGELOG](../CHANGELOG.md); open follow-ups are in [TODO.md](../TODO.md). Dates
are when the work was done (or, for older entries, the release that carried it). Add new entries at the top.

A new bot's numbers come from `npm run eval -- <bot>`, whose report card goes in [results/](results/).

## 2026-10-23 · The rest of the speed list

- **Question:** do the open items in TODO's Speed list pay, still without changing a move?
- **Setup:** CPU profiles of Minimax (600 decisions) and Monte Carlo (200), each item built and checked move for move,
  then `npm run speed` against a baseline recorded first.
- **Result:** Minimax's time is the engine 40%, generating moves 24%, the search 22%, hashing 4.8%, the table 4.6%. Keys
  updated move by move could save at most that 4.8%, and a relay move changes most slots anyway: not built. Checking
  children's remembered bounds first found 0.1% fewer positions and was slower overall: dropped. Bounds from forced
  results would change Minimax's moves (it scores the depth limit by evaluation, not outcome): moved to v2.4. Monte
  Carlo's tree is 1.6% of its time, so no flat tree; its playout loop, tidied, is about 9% faster.
- **Decision:** kept the Monte Carlo loop; every bot plays the same moves. The engine itself is already lean: what's
  left in it is the work of sowing.

## 2026-10-23 · Engine and bot speed-ups

- **Question:** where does the time go, and what can be made faster without changing a single move?
- **Setup:** `npm run speed` (new): the engine's turns a second, and every bot's time and moves on 300 fixed positions,
  checked against a recorded baseline; `npm run bench` for Minimax; CPU profiles.
- **Result:** the engine was already lean (about 110 ns a turn); Minimax's time is a third the engine, a third its own
  search and hashing, a fifth generating moves. Kept, every bot playing the same moves: no move lists made in hot loops,
  and a next-slot table per player (Planner about 40% faster, DFS and DFS v2 about 15%, Monte Carlo about 10%, the
  engine about 5%). Dropped: byte arrays for the bots' boards (10–25% slower, as `turn()` then sees two kinds of board)
  and the remembered move searched on its own first (no gain).
- **Decision:** kept what helped; the rest is in TODO.md, Speed.

## 2026-10-23 · Quiescence search (#13)

- **Question:** does searching past the depth limit, through captures and free turns until the board is quiet, fix the
  search's mistakes? Would a shallow search with it make a cheap Expert?
- **Setup:** a `quiescence` option in `src/bots/search/minimax.ts`, with stand-pat. It was measured on positions the
  solver can check ([harness/accuracy.ts](../harness/accuracy.ts)): 100 and 200 positions on the standard board, 300
  with 4 seeds a pit. Depth 3 with quiescence was also placed against Minimax and its neighbours, 120 games a pairing.
- **Result:** on the standard board it adds almost nothing past depth 1. The free-turn extension already follows the
  noise that matters. Captures alone were slightly worse than nothing. It costs 66–130 ms a move early in the game,
  against Minimax's 8–16. With 4 seeds a pit it helps clearly (depth 3: 88% → 93% perfect moves). Depth 3 with it tied
  Minimax, as every strong bot does, at ten times the time.
- **Decision:** the option stays, off by default; no bot. #13 closed.

## 2026-10-21 to 23 · The game solved on small boards

- **Question:** who wins with best play, and by how much, as the board grows (1–10 pits a side, 1–10 seeds a pit)? Where
  do forced wins start and end?
- **Setup:** an exact solver ([lab/solve/](solve/solver.ts)): MTD(f) over fail-soft alpha-beta, every position
  remembered, checked seed for seed against the engine and against plain minimax. It was made faster in steps:
  - free turns and game-enders tried first;
  - bounds from the stores (ten times fewer positions);
  - children's bounds checked before searching them;
  - keys updated seed by seed;
  - a fixed 8-byte-an-entry memo that replaces its cheapest entries;
  - several workers sharing one memo.
- **Result:** 75 of 100 boards solved exactly, and 89 with the winner proved
  ([the heat map](../docs/images/solved-boards.svg), [the data](results/solved-boards.json)). **The standard game is a
  first-player win, 96–2**, two seeds more than Minimax against itself. Second-player wins sit on a narrow band (1×4,
  3×5, 3×6, 4×7 to 4×9, 5×9, 5×10, 6×10), and 1×1 and 3×7 are draws. The 11 unknowns are 8–10 pits with 3–9 seeds.
- **Decision:** kept as a tool. Next, if wanted: endgame databases or proof-number search for the unknowns.

## 2026-10-21 · Intuition and Rule list

- **Question:** how much of Minimax is pattern rather than calculation? A policy network that names a move with no
  search; and that network written out as if/then rules a person could follow.
- **Setup:** Minimax's move (depth 5) labelled on 100,000 positions; a 16-64-64-7 policy net trained on them; eight
  rules mined from the net's choices ([lab/learn/](learn/train-policy.ts)).
- **Result:** the net plays Minimax's move 42% of the time (random: 22%) and rates about 1150–1200. The rules copy the
  net only 36% of the time but play Minimax's move 54% of the time, and rate about 1660–1680. Knowing what a move does,
  and the opponent's best answer to it, beats reading the board. Report cards: [Intuition](results/intuition.md),
  [Rule list](results/ruleList.md).
- **Also learned:** labelling every move's exact score at depth 6 took about 0.8 CPU-seconds a position and swamped the
  machine. Labelling only the best move, at depth 5, on 4 low-priority workers took 4 minutes for 100,000.
- **Decision:** both dormant as candidates, waiting for a full rating.

## 2026-10-20 · Bots that lose harder than Pushover

- **Question:** can a learned or decompiled judgement make Pushover, which searches to lose, lose harder?
- **Setup:** Pushover's search, judged by a network trained on how 200,000 positions from Pushover's games actually
  ended (17 inputs), or by that network written out as a weighted sum. Also tried: the winning net turned upside down.
- **Result:** Learned pushover 456, below Pushover's 489; Decompiled pushover 480, too close to call. The upside-down
  winning net lost no harder than Pushover: losing has to be learned on its own.
- **Decision:** both shipped in v2.6.0 (Doomed, Helpless).

## 2026-10-20 · Decompiling the value net

- **Question:** can the learned value net's judgement be written out as readable logic, and does that logic play as
  well?
- **Setup:** least-squares fits of readable features (store lead, seeds on each side, free turns set up, exposure, empty
  pits, the clinch line) to the net's values, residual trees, and a fit to the net's preferences between positions
  reachable from the same one ([lab/learn/](learn/ranking.ts)).
- **Result:** fitting the net's overall values loses its strength. Fitting its comparisons within one position's moves
  keeps most of it: the formula plays at DFS v2's level, a little short of the net.
- **Decision:** the formula is kept in `src/bots/judges/decompiled.ts`. A "Decompiled DFS" bot is a gap worth trying.

## By v2.5.0 (2026-10-20) · A learned value net (Learned DFS)

- **Question:** can a small network learn Minimax's judgement, and match it for less search?
- **Setup:** DFS v2's search, judged by a 16-16-16-1 value net trained on Minimax's depth-6 scores for 200,000
  positions.
- **Result:** the net calls the winner right 91% of the time, against 71% for Minimax's own evaluation. The bot rated
  level with Minimax at about a quarter of its time. Nets 32 and 64 wide were no stronger.
- **Decision:** shipped as Wise (Learned DFS).

## By v2.5.0 (2026-10-20) · A stronger Minimax, DFS v2, Monte Carlo

- **Minimax v2.** Tried three ways: a sharper evaluation, depth 8, and depth 4. Every one split every matched pair 1–1
  with Minimax. From these openings the seat decides the game, and Minimax already wins every won position. **There is
  no headroom above Minimax until the pie rule (#17).**
- **DFS v2:** DFS's chains, then the opponent's best chain in answer. It beat DFS 56% over 400 games (+42 Elo, range +13
  to +71) at about 3 ms a move. Shipped.
- **Monte Carlo** (MCTS, random playouts, 10 ms a move): it filled the gap between Lookahead and Shrewd but scored 8%
  against Minimax. DFS is stronger at a twentieth of the time, because random games are a poor guide in a game this
  tactical. Shipped as Lucky.

## By v2.4.0 (2026-10-19) · How to deal openings

- **Question:** which openings give the tightest ratings for the time?
- **Result:** sharing one opening a round across every pairing made the ranges wider, not narrower. Symmetric deals were
  no better than two random moves, at twice the time.
- **Decision:** the default stays: the standard board after two random moves, in matched pairs.

## By v2.3.0 (2026-10-15) · Adaptive allocation

- **Question:** can the same accuracy come from fewer games, by giving close pairings more games and lopsided ones
  fewer?
- **Result:** built (`npm run rate -- 240 --adaptive`), planned from the current ratings, with a floor of 10 games. Not
  yet the default: it needs to show today's ±25 ranges in clearly less time (TODO.md, Rating statistics).

## By v2.2.0–v2.2.3 (2026-10-15) · Bots that add nothing

- **Grandmaster** (Minimax to depth 10) rated level with Minimax for five times the time: depth 10 adds almost nothing
  to depth 6 here. Shelved.
- **First** (always its leftmost pit) rated level with Random once games were matched pairs, 999 against 1000 over 240
  games. Shelved.
- **Pushover** searching 3 deep instead of 4 is just as hopeless, 5.5× quicker. Kept at 3.
