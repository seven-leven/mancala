# Rating the bots

How the bots get their Elo, how to run a rating, and how to read what it prints. This is the one place for it: the
README shows the ratings, [BOTS.md](BOTS.md) says how to build a bot, and this says how to rate one.

Two harnesses, two words. The **test harness** (`npm test`, `tests/`) checks the code is correct and runs on every push.
The **rating harness** (`npm run rate`, `tools/tournament/`) plays the bots against each other to set their Elo, and
runs by hand. A test run, a rating run.

![A rating session in five steps: decide, place, rate, read, publish](images/rating-session.svg)

## Commands

| Command                                                           | What it does                                                                   |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `npm run rate`                                                    | Every bot in `BOTS`, 40 games a pairing. Prints the ratings, doesn't save      |
| `npm run --silent rate -- 240 --write \| tee data/ratings-240.md` | The full rating for the menus, kept as a table in `data/` (git-ignored)        |
| `npm run rate -- 40 --bots random,greedy,newBot`                  | A placement run: only these bots. Random is always needed: it's the anchor     |
| `npm run rate -- 240 --write --resume`                            | Carries on after Ctrl+C or `--time`: repeat the run's own games and flags      |
| `npm run ladder`                                                  | Redraws [docs/images/ladder.svg](images/ladder.svg) from `src/bots/ratings.ts` |
| `npm run profile`                                                 | Where a short rating run spends its time (`data/profile/`)                     |

Flags:

- `[games]` or `--games N`: games per pairing, even (each opening is played twice). Default 40.
- `--write`: saves `src/bots/ratings.ts`, which the menus, the picker and your own rating read. Only with every bot in
  `BOTS` together, so leave out `--bots`.
- `--bots a,b,c`: rate just these. They may name dormant bots (see [BOTS.md](BOTS.md#dormant-bots)).
- `--openings random-moves|symmetric|standard`: how each pair of games starts (below). Default `random-moves`.
- `--time 10m` (or `90s`, `1h`): stop after the round that crosses the budget.
- `--record games.mgn`: append every game in [MGN](NOTATION.md), for `npm run positions`.
- `--workers N`: worker threads. Default one per CPU core; results are the same for any number.

## When to re-rate

Re-rate with `--write` when the games themselves change:

- a bot is added, retired, made dormant, or plays differently;
- the engine changes a rule or the move order a bot sees;
- the harness changes the openings or the seeds (as the parallel pairings did in v2.2.2).

A change that only makes things faster, with the same games, doesn't need one: check it by running the same rating
before and after and comparing the tables, which must match exactly. Seeds come from each bot's position in the list, so
adding or removing a bot changes every pairing's games: re-rate everything, not just the new bot.

## How many games

Ranges shrink with the square root of the games, so four times the games halves them.

| Games a pairing | 90% ranges, 17 bots | Time on 16 cores | Use it for                                              |
| --------------: | ------------------: | ---------------: | ------------------------------------------------------- |
|              40 |           about ±50 |      about 1 min | Placing a new bot, quick checks                         |
|              60 |           about ±40 |     about 1¼ min | (The v2.2 ratings)                                      |
|             240 |           about ±25 |      about 5 min | The ratings in the menus                                |
|             960 |           about ±12 |     about 20 min | Settling a pair that's too close to call, if it matters |

Minimax pairings are most of the time. A placement run with only a few bots is much quicker.

### Adaptive allocation

`npm run rate -- 240 --adaptive` spends the games where they tell you something. A game between bots that win p and 1 −
p of the time carries p(1 − p) of information: a quarter at 50/50, almost nothing at 99/1. So each pairing gets max(10,
round(240 × 4p(1 − p))) games, p from the ratings in `src/bots/ratings.ts`: 240 for an even pairing, a few dozen for a
clear one, and the floor of 10 for a mismatch, which keeps every bot linked to Random and still shows a bot that isn't
transitive. The lopsided games are mostly the slow searchers', so they're the costliest to skip playing.

Rules it keeps:

- **The plan is fixed before the run**, from the last ratings, never from results as they come in, which would bias the
  fit and its ranges. A bot with no rating yet plays every pairing in full.
- **One queue, no rounds.** Every planned pair goes on one queue, the costliest pairings first; a checkpoint every 50
  pairs, so `--resume` and `--time` work as before. Results are put back in plan order, so a run repeats exactly.
- **Counts in the tables:** "Won" shows the games each bot played, and each head-to-head cell its game count.
- **The virtual draw scales with the games.** The fit's virtual draw per pairing (which keeps a 100% pairing finite) is
  weighted by the pairing's share of the most games any pairing played. A whole draw on a 10-game pairing pulled the
  ends of the ladder about 50 Elo toward the middle; scaled, the ends sit where a plain run puts them. A plain run,
  where every pairing plays the same, fits exactly as before.

**How it compares** (18 bots, 16 cores, October 2026): the plain 240-game run took 220 s for 36,720 games. Adaptive from
240 took 28 s (12,516 games), ranges up to ±38 at the ends; adaptive from 480 took 49 s (24,610 games), ranges up to
±27. Both put 16 of 18 bots inside the plain run's ranges; DFS and Lookahead came out 5–30 Elo higher, consistent with
the one pairing the plain run's model check flags (Striker scores 5% against DFS where the ratings say 1%), which
adaptive plays only 10 times. So: `--adaptive` for a quick re-rate after a change (about a minute), a plain run for the
ratings in the menus.

## How a run works

**Matched pairs.** Each opening is set up once, then played twice, the bots swapping seats. A board that favours the
first player comes out 1–1, so a bot only gains by outplaying the other from the same start. The first player still wins
about 53% of decided games, so this matters.

**Openings.** `random-moves` (the default): the standard board after two random moves. `symmetric`: a random deal, 3 to
10 seeds a pit, the same on both sides seen from each seat. `standard`: the plain starting board (every pair is the same
game twice, so only useful for checking).

**Rounds.** One round is one matched pair for every pairing. Pairings run in parallel on a pool of workers, slowest
first (by the last round's times), so a round doesn't end with one long Minimax pairing while the other cores wait. A
checkpoint (`tools/tournament/checkpoint.json`, git-ignored) is saved after every round. Ctrl+C once stops after the
games in progress and drops the unfinished round; twice stops at once. `--resume` carries on exactly as a straight run
would have.

**Repeatable.** Every pairing has its own seed from the round and the two bots, so it plays the same games whichever
worker runs it and in whatever order. Search bots use a fixed depth here (`mode: "rate"`), not a time limit, so the
results don't depend on the machine either.

**The progress line** (on a terminal only, so piped output stays a clean table) shows the round, games, games a second,
time elapsed and an ETA. The ETA counts rounds, not games: every round plays the same pairings and takes about as long,
while single pairings differ a thousandfold. It says "after round 1" until one round is timed, then uses the median of
the last five rounds plus what's left of this one, weighted by each pairing's last time.

## How the ratings are fitted

All the results are fitted at once (a Bradley–Terry model, read as Elo), so the order games were played in doesn't
matter. One virtual draw per pairing keeps 100–0 pairings finite. Random is the anchor, pinned at 1000.

Each rating's **90% range** comes from re-fitting 300 times, each time resampling every pairing's results with
replacement, a matched pair at a time. The range runs from the 5th to the 95th percentile of those 300 values (the
[formulas](#the-maths)).

## Reading the results

![Three ways two ratings can sit, and what a game is worth by the Elo gap](images/rating-reading.svg)

The run prints a table (Elo, 90% range, the share of all its games each bot won), then a head-to-head table: each bot's
win rate against each other bot.

- **Read the ratings as a ladder, not exact numbers.** A 100% pairing only says one bot is much stronger, not how much.
  Those gaps are set by the closer pairings in between.
- **Too close to call:** neighbours whose 90% ranges overlap. The ladder chart draws them in red. Today: Chainer and
  Spoiler, Greedy and Turtle.
- **Noise, not a change:** a new rating inside the old range. Only a move outside it says the bot really changed.
- **The ends move most.** The strongest and weakest bots are placed only by lopsided pairings, which carry little
  information, so more games move them furthest.

## Placing a new bot

A game tells you most about two ratings when it's close to 50/50, and much less as the gap grows: across a 200 Elo gap a
game carries 73% of the information of an even one, across 400 only 33%, across 700 only 7%. So a new bot earns its
place by landing **within about 200 Elo of a neighbour, in a gap wider than that**. Bots near the middle of the ladder
help most: they play close games against several bots at once and tie both ends to Random.

1. Give the bot one knob that moves its strength smoothly (a probability, a depth, a weight). See
   [BOTS.md](BOTS.md#adding-a-bot) for writing it.
2. Place it: `npm run rate -- 40 --bots random,<neighbours>,<newBot>`, with the bots either side of the gap you're
   filling. Tune the knob until it lands in the gap.
3. Rate everything with `--write` (step 3 of the session above), then publish.

If it lands on top of another bot instead, see [BOTS.md](BOTS.md#dormant-bots).

## After `--write`

1. `npm run ladder` redraws the chart.
2. Check the **levels** still read weakest to strongest. When the ladder reorders, the level names move with it (see
   [BOTS.md](BOTS.md#names)). The opponent picker's bands (Strong 1600+, Club 1250–1600, Learner 900–1250, Starter under
   900) follow the ratings by themselves.
3. Update the README's bot table and its line on which pairs are too close to call.
4. Add a CHANGELOG line: what changed, the games a pairing, the widest range.
5. `npm test`, then commit `src/bots/ratings.ts`, `docs/images/ladder.svg`, the README and the CHANGELOG together.

## Your rating

Players have an Elo too, worked out in the browser from their saved games (`src/app/history.ts`). Everyone starts at
1000, level with Random, and each rated game moves it by up to 32 points (K = 32) against the bot's rating. A game is
rated when it's one person against one bot, played to the end under the standard rules, with no Undo or Hint and no
change of opponent. Each saved game keeps the bot's rating from the day it was played, so a re-rating never rewrites
anyone's history.

## The ladder over time

Each rating so far, from `src/bots/ratings.ts` in git history. "Typical" is the middle bot's half-range. Before the
first rating (v2.0, 14 October 2026) there were four named levels with no numbers behind them: Easy (Random), Medium
(Greedy), Hard (DFS) and Expert (Minimax).

| Ratings                       | Bots | Games a pairing | Openings          | Typical 90% range | Widest |
| ----------------------------- | ---: | --------------: | ----------------- | ----------------: | -----: |
| Difficulty levels only (v2.0) |    4 |               – | –                 |         not rated |      – |
| First Elo ladder (v2.1)       |    8 |              40 | Each game its own |               ±75 |   ±105 |
| Bot standard (v2.2.0)         |   12 |              40 | Matched pairs     |               ±50 |    ±63 |
| Seventeen bots (v2.2.0)       |   17 |              60 | Matched pairs     |               ±36 |    ±41 |
| After the speed-ups (v2.2.2)  |   17 |             240 | Matched pairs     |               ±20 |    ±25 |
| First made dormant (v2.2.3)   |   16 |             240 | Matched pairs     |               ±21 |    ±26 |

What it taught:

- **Three things narrow the ranges:** more rungs, matched pairs, and more games. From 8 to 12 bots (with matched pairs,
  at the same 40 games) took a third off. From 12 to 17 bots took a little more off, beyond what the extra games
  explain. From 60 to 240 games roughly halved them.
- **With seventeen bots, games are the cheaper lever.** Four times the games did more in 5 minutes than five more bots
  would. Giving the games to close pairings (adaptive allocation, in [TODO.md](../TODO.md)) should do better still.

### The ladder's shape, sixteen bots without First

The ladder runs from 516 (Pushover) to 2043 (Minimax), sixteen bots. The average step is about 100 Elo, so each bot
beats the one below it about 64% of the time: each step up is noticeably harder, and none is a wall. Most rungs sit
between 900 and 1750, where people play.

- **Same strength, different style:** Greedy and Turtle (13 apart), Chainer and Spoiler (11). They earn their place as
  styles, not as steps. First, level with Random (1 apart), added no style worth a rung and is now dormant.
- **The widest gaps:** Planner to Chainer (208), Hoarder to Sometimes generous (186), Sometimes generous to Generous
  (172), Shrewd to Lookahead (169). A new bot does most good in the first two: Planner to Chainer is the middle of the
  ladder, where players climb.
- **The ceiling:** nothing is above Minimax, so a strong player runs out of ladder. That's for a stronger Expert (v2.4),
  not for more bots in the middle.

Update this section after each full rating that changes the shape.

## The maths

The formulas behind the sections above, for checking or changing `tools/tournament/elo.ts` and `src/app/history.ts`.
Everything else on this page says the same things in words.

**The model.** Each bot has a strength γ, and bot i beats bot j with probability γᵢ / (γᵢ + γⱼ) (Bradley–Terry). On the
Elo scale, R = 400 · log₁₀ γ, which is the familiar

```
P(i beats j) = 1 / (1 + 10^((Rⱼ − Rᵢ) / 400))
```

A draw counts as half a win. The ratings are shifted so Random is exactly 1000; only differences mean anything.

**The fit.** Maximum likelihood over every result at once, by minorisation–maximisation: 1000 rounds of

```
γᵢ ← Wᵢ / Σⱼ nᵢⱼ / (γᵢ + γⱼ)
```

where Wᵢ is bot i's total score and nᵢⱼ the games between i and j. One virtual draw per pairing (half a win to each
side, one game more) keeps a 100–0 pairing from pushing a rating to infinity.

**The 90% ranges.** A bootstrap: 300 times, redraw every pairing's results with replacement, a matched pair at a time
(the two legs share an opening, so they go together), and re-fit. A bot's range runs from the 5th to the 95th percentile
of its 300 re-fitted ratings. The resampling is seeded (711), so ranges repeat too.

**Too close to call** means the 90% ranges of two ladder neighbours overlap. That's a cautious reading, not a formal
test: two ranges can overlap a little while their difference is still fairly sure.

**What a game is worth.** A game between bots i and j tells you about Rᵢ − Rⱼ in proportion to p(1 − p), with p = P(i
beats j). Relative to an even game that's 4p(1 − p):

| Elo gap |    p | Worth |
| ------: | ---: | ----: |
|       0 | 0.50 |  100% |
|     200 | 0.76 |   73% |
|     400 | 0.91 |   33% |
|     700 | 0.98 |    7% |

**Why √games.** A rating's uncertainty goes as 1 / √(Σ n · p(1 − p)) over its pairings. Four times the games gives half
the range; the same games moved to closer pairings give a narrower range for free. That is the case for adaptive
allocation in [TODO.md](../TODO.md).

**The first-move edge.** The first player wins about 53% of decided games in a rating run. Matched pairs cancel it: each
bot plays every opening from both seats, so the edge adds the same to both sides of every pair.

**Your rating.** Elo's update, replayed over your rated games in order from 1000:

```
expected = 1 / (1 + 10^((R_bot − R_you) / 400))
R_you   ← R_you + 32 · (score − expected)        score: 1 win, ½ draw, 0 loss
```

R_bot is the bot's rating stored with that game. With K = 32 your rating moves fast and settles near the level you beat
about half the time; it's a running estimate, not a fit like the bots'.

**Strength checks in the test harness.** A test like "Lookahead beats Random" needs enough games that the result isn't
luck, and a pass mark the stronger bot clears with room to spare. With n games and w wins, pass when

```
w ≥ n/2 + 3.1 · √n / 2
```

That's the one-sided 0.1% line under "the two bots are equal": 30 of 40, 54 of 80. Tests are seeded, so they don't
flicker from run to run; the rule is there so a broken bot can't pass on a lucky seed, and so changing the seed doesn't
break a sound test. Pick pairings at least 400 Elo apart (about 90% or more): they clear the line with a wide margin.

**Is A stronger than B?** The 300 resampled fits that give the ranges also give a probability: the share of them in
which A rates above B. The results table's "Above next" column is that share for each bot against the next one down, and
`--write` saves it as `above` in `src/bots/ratings.ts`. The ladder chart marks a pair red when it's under 90%. Two
ranges can overlap while the order is still fairly sure (say 85%), so this says more than the overlap alone.

**Does the model fit?** For each pairing, A's score against B is set beside what the ratings predict, 1 / (1 + 10^((R_B
− R_A)/400)), and flagged when they're more than 3 standard errors apart, the error counted over matched pairs (the two
legs of a pair go together), with p(1 − p) floored at 1% so a 100% pairing still has one. A bot that isn't transitive,
that beats strong bots and loses to weak ones, shows up as a flagged pairing. The output ends with "Model check": either
"every pairing's score is within chance", or the pairings that aren't. With 120 pairings, a 3-error limit should flag
none by chance about 3 times in 4.
