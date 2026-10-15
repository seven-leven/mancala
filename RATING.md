# Rating the bots

How the bots get their Elo, how to run a rating, and how to read what it prints. This is the one place for it: the
README shows the ratings, [BOTS.md](BOTS.md) says how to build a bot, and this says how to rate one.

Two harnesses, two words. The **test harness** (`deno task test`, `tests/`) checks the code is correct and runs on every
push. The **rating harness** (`deno task rate`, `tools/tournament/`) plays the bots against each other to set their Elo,
and runs by hand. A test run, a rating run.

![A rating session in five steps: decide, place, rate, read, publish](docs/rating-session.svg)

## Commands

| Command                                                 | What it does                                                               |
| ------------------------------------------------------- | -------------------------------------------------------------------------- |
| `deno task rate`                                        | Every bot in `BOTS`, 40 games a pairing. Prints the ratings, doesn't save  |
| `deno task rate 240 --write \| tee data/ratings-240.md` | The full rating for the menus, kept as a table in `data/` (git-ignored)    |
| `deno task rate 40 --bots random,greedy,newBot`         | A placement run: only these bots. Random is always needed: it's the anchor |
| `deno task rate 240 --write --resume`                   | Carries on after Ctrl+C or `--time`: repeat the run's own games and flags  |
| `deno task ladder`                                      | Redraws [docs/ladder.svg](docs/ladder.svg) from `src/bots/ratings.ts`      |
| `deno task profile`                                     | Where a short rating run spends its time (`data/profile/`)                 |

Flags:

- `[games]` or `--games N`: games per pairing, even (each opening is played twice). Default 40.
- `--write`: saves `src/bots/ratings.ts`, which the menus, the picker and your own rating read. Only with every bot in
  `BOTS` together, so leave out `--bots`.
- `--bots a,b,c`: rate just these. They may name dormant bots (see [BOTS.md](BOTS.md#dormant-bots)).
- `--openings random-moves|symmetric|standard`: how each pair of games starts (below). Default `random-moves`.
- `--time 10m` (or `90s`, `1h`): stop after the round that crosses the budget.
- `--record games.mgn`: append every game in [MGN](NOTATION.md), for `deno task positions`.
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
replacement, a matched pair at a time. The range runs from the 5th to the 95th of those 300 values.

## Reading the results

![Three ways two ratings can sit, and what a game is worth by the Elo gap](docs/rating-reading.svg)

The run prints a table (Elo, 90% range, the share of all its games each bot won), then a head-to-head table: each bot's
win rate against each other bot.

- **Read the ratings as a ladder, not exact numbers.** A 100% pairing only says one bot is much stronger, not how much.
  Those gaps are set by the closer pairings in between.
- **Too close to call:** neighbours whose 90% ranges overlap. The ladder chart draws them in red. Today: Chainer and
  Spoiler, Greedy and Turtle, Random and First.
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
2. Place it: `deno task rate 40 --bots random,<neighbours>,<newBot>`, with the bots either side of the gap you're
   filling. Tune the knob until it lands in the gap.
3. Rate everything with `--write` (step 3 of the session above), then publish.

If it lands on top of another bot instead, see [BOTS.md](BOTS.md#dormant-bots).

## After `--write`

1. `deno task ladder` redraws the chart.
2. Check the **levels** still read weakest to strongest. When the ladder reorders, the level names move with it (see
   [BOTS.md](BOTS.md#names)). The opponent picker's bands (Strong 1600+, Club 1250–1600, Learner 900–1250, Starter under
   900) follow the ratings by themselves.
3. Update the README's bot table and its line on which pairs are too close to call.
4. Add a CHANGELOG line: what changed, the games a pairing, the widest range.
5. `deno task test`, then commit `src/bots/ratings.ts`, `docs/ladder.svg`, the README and the CHANGELOG together.

## Your rating

Players have an Elo too, worked out in the browser from their saved games (`src/app/history.ts`). Everyone starts at
1000, level with Random, and each rated game moves it by up to 32 points (K = 32) against the bot's rating. A game is
rated when it's one person against one bot, played to the end under the standard rules, with no Undo or Hint and no
change of opponent. Each saved game keeps the bot's rating from the day it was played, so a re-rating never rewrites
anyone's history.
