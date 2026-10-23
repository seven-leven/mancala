# Research

Notes on the game itself: what the numbers say about ohvalhugondi, published as findings come in. The plan behind them,
and what's still to do, is in [PLAN.md](PLAN.md).

## Posts

Newest first.

- _None yet._ The first is planned: what progress and entropy look like over a game.

Earlier finding, from the README: [the first player wins by force](../README.md), opening with pit 1.

## Post ideas

Not written yet. Take one, write it, move it to the list above. Add new ideas at the end of their group.

### How the bots and the ratings work

Explainers: they need writing, not new measurements.

- **Meet the bots.** All eighteen, from Pushover to Minimax, plus the dormant First and Grandmaster. Group them by
  family (one-move, mixed, chain, search) and give each one's idea in a line, its rating, and a game it wins or loses in
  its own style. From `src/bots/bots.ts` and [BOTS.md](../docs/BOTS.md).
- **How the tournament works.** Every bot plays every other in matched pairs, ratings come from a maximum-likelihood
  fit, and adaptive allocation gives close pairings more games and lopsided ones fewer. Why each piece is there: matched
  pairs cancel the first-move edge, and a 100–0 pairing says almost nothing. From [RATING.md](../docs/RATING.md).
- **What an evaluation function is, and why a bot needs one.** A search can't see to the end of the game, so it has to
  score the positions where it stops. Build it up piece by piece (store lead, free turns ready, threats, exposure,
  mobility) and show how the same search plays differently with each.
- **Minimax and alpha-beta, on a mancala board.** Search a real position by hand for two moves, then show what pruning
  skips, why free turns need an extension, and what the transposition table saves.
- **How sure is a rating?** The 90% ranges from resampling, "above next" as a probability, and the model check that
  catches a rock-paper-scissors bot. Why a rating is a range, not a single number.
- **Two bots that didn't make the cut.** First rated level with Random (999 against 1000), and Grandmaster gained 7 Elo
  over Minimax for five times the time. What a dormant bot is, and why keeping a bot that adds nothing makes the ladder
  worse.
- **Your rating.** How the game rates you from your games against the bots (Elo, K = 32), which games count and why undo
  and hints don't.

### What the numbers say about the game

Findings: each needs a measurement first (see [PLAN.md](PLAN.md)).

- **The first player wins by force.** The full story of pit 1's free-turn chain: how Minimax found it, how long the
  chain is, and how much the edge is worth in other openings.
- **Progress and entropy over a game.** How evenly the seeds are spread, and how fast they're banked, from opening to
  end, and whether strong bots keep the board more or less even than weak ones.
- **Relays, free turns and captures by stage.** The relay model against real games: how long turns are early and late,
  and when captures take over.
- **Do the house rules change the game?** 3 to 15 seeds a pit, captures from either side, and playing to the last seed
  instead of a clinched majority. Does the first-move edge survive each one?
- **Fixing the first-move edge.** The pie rule, no relays on the first turn, or a simultaneous start, as in congkak.
  Which one makes the game fairest, measured over thousands of bot games?
- **Opening statistics.** Each opening pit's result, average chain length, seeds per relay and game length.
- **Small boards, solved.** 3 pits × 3 seeds and 4 × 4, solved backwards from the end, against what Minimax plays.
- **What the fitted evaluation learned.** Once the weights are fitted from games (#15): which features matter, and how
  their weights change from opening to endgame.

### Building it

How the project was made, for readers who code.

- **Ohvalhugondi and its cousins.** The Maldivian game beside kalah, congkak and oware: the rules that differ (relays,
  captures, the clinch) and what each does to play.
- **Writing games down.** MGN, the notation for the game: why a notation, how a game reads, and how it's checked against
  the engine both ways. From [NOTATION.md](../docs/NOTATION.md).
- **Making the tournament faster.** Workers, fitting once, sowing without a Map, copying less: what the profiler showed
  and what each change saved (a 4-round run went from 37 s to 10 s, the fit from 55 s to under 1 s), with the same games
  before and after.
- **Testing a game engine.** Three thousand random games checking that no seed is ever lost, a snapshot that keeps the
  ratings repeatable, and getting coverage to 100%. From [TESTING.md](../docs/TESTING.md).
- **From Deno to Node.** What moving a TypeScript project to Node 24 took, now that Node runs TypeScript directly.

## Writing a post

- One file per post, in `research/posts/`, named `YYYY-MM-DD-short-title.md`.
- Open with the question in a sentence, then the answer, then how it was measured. Include the commands that reproduce
  it (`npm run rate …`, `npm run positions …`) and the bots and games used.
- Charts go in `research/images/`, drawn by a script in `lab/diagrams/`, so they can be redrawn.
- Add the post to the list above, and tick its item in [PLAN.md](PLAN.md).
- A post is a snapshot: don't rewrite it when things change. Write a new post and link back.

For now posts live in the repo, where GitHub renders them. Publishing them on the game's site, under `/mancala/`, is on
the plan.
