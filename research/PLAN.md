# Research plan

What we want to find out about ohvalhugondi (7 pits a side, 7 seeds a pit, two stores), how we'll find it out, and
what's left to do. Findings go out as posts (see [the index](README.md)); this page is the plan they come from.

## 1. Two numbers that describe a board

**Progress**: how far the game has gone. Let S be the seeds still in pits (98 minus both stores). Progress is `π = 1 − S
/ 98`: 0 at the start and 1 when every seed is banked. With house rules it's `1 − S / (14 × seeds)`. Under the clinch
rule a game can end early, at `π` well below 1.

**Entropy**: how evenly the seeds in play are spread. With `p_i = s_i / S` for the 14 pits, take Shannon entropy `H = −Σ
p_i log₂ p_i`, normalised by its maximum, `H* = H / log₂ 14`, so it runs from 0 to 1:

- `H* = 1`: every pit holds the same, as at the start.
- `H* = 0`: all the seeds in play sit in one pit.
- When `S = 0` (the game is over), define `H* = 0`.

Also worth keeping beside it:

- **Entropy per side** (`H₁*`, `H₂*`, over 7 pits), because one side can be even while the other is lopsided.
- **Empty pits per side**. Simpler than entropy, and probably what actually drives relays and captures (see 2).

Entropy ignores _where_ the seeds are, but sowing depends on position. So test whether it adds anything over the
empty-pit count before relying on it.

## 2. A heuristic argument: relays, free turns, entropy and progress

The rules, as `src/game/engine.ts` plays them:

- Each sowing segment ends where its last seed lands.
- In a pit that already had seeds, you pick them all up and sow again (a **relay**).
- In your own store, you get a **free turn**: you choose any pit and play again.
- In an empty pit, the turn ends, with a capture if that pit is yours.

One lap for a player is 15 drops: 14 pits plus their own store.

**Model a turn as a chain of segments.** Treat each landing as random, with three outcomes:

- your store, with chance about `1/15` (more when you aim for it; see below);
- an empty pit, with chance about `e`, the share of empty pits among the 15 landing places;
- otherwise, a pit with seeds (a relay).

The number of segments in a turn is then roughly geometric, with mean about `1 / (e + 1/15)`. This gives three
predictions:

- **Early (low progress, high entropy, few empty pits):** `e ≈ 0`, so turns are long relay chains. Each turn moves many
  seeds and the outcome is hard to see ahead: the board is **volatile**.
- **Late (high progress, low entropy, many empty pits):** turns end after one or two segments. Captures become the main
  event, and play is calculable.
- **Free turns you choose** don't depend on chance: a pit with exactly as many seeds as it is far from your store
  (`freeTurnsReady` in `evaluate.ts`) is a free turn on demand. Relays can also end in your store, but that's luck,
  likelier when the chain is long.

What would make this an argument rather than a guess:

- Measure on recorded games: segments per turn against `e`, `H*` and `π`. Does the geometric prediction hold?
- Find where it breaks. Landings aren't independent: a relay empties the pit it picks up, which raises `e` during the
  turn.
- Sowing tends to raise entropy (it spreads seeds one a pit). Pick-ups, captures and banking lower `S`. Work out which
  wins at each stage of the game.

**Why it matters for the bots:** volatility tells a search where to look deeper. A volatile position is one where a
static evaluation is least trustworthy, so it's the natural trigger for extending the search (compare the capture
extension, #13) and for spending more time on a move.

## 3. One evaluation for every bot

Today each bot blends a few pieces from `src/bots/judges/evaluate.ts` (lead, free turns ready, threats, exposure,
mobility) by hand. The idea:

- **One evaluation**: a weighted sum of features. The features are the five pieces plus progress, entropy (overall and
  per side), empty pits and volatility.
- **Weights that change with the stage of the game**: blend an opening set and an endgame set by progress, `w(π) = (1 −
  π)·w_open + π·w_end`, as chess engines taper between middlegame and endgame.
- **A bot is then a recipe**: a search (none, two-move, alpha-beta), a depth or time, a weight set (its personality:
  Turtle weighs exposure, Striker threats), and how much randomness it adds.
- **Strength as a dial**: pick moves by softmax over the evaluation, with a temperature `T`. High `T` is near Random; `T
  → 0` plays its best. One bot could then fill any gap in the ladder by tuning `T`, instead of a new hand-made bot.
- **Fit the weights from games** (Texel's method, #15): `npm run positions` already writes the training data. Keep a
  weight set only if it wins a matched-pair match (SPRT) against the old one.

## 4. A numbered registry of bots

Bots get permanent numbers, in the order they're made:

- **`#0000` is Random**: the benchmark, already the Elo anchor at 1000.
- **The next bot takes the next number**: `#0001`, `#0002`, and so on. Numbers are never reused.
- **A change in how a bot plays is a new bot**, with a new number and its parent noted ("#0019, from #0017"). The test
  for "plays differently" is the one we already have: if the harness snapshot changes, it's a new number. A speed-up
  that plays the same games keeps its number.
- **Every bot has a status**: _active_ (in the menus), _dormant_ (in the code and rated, but not offered), or _archived_
  (code gone, kept as a record with its last rating).
- **Names stay for people.** "Minimax" and "Expert" are what players see. The menu shows the latest active bot of a
  line, and the number says exactly which one played.
- **Saved games and ratings key on the number**, so a re-tuned Minimax starts its own record. Today's string ids
  (`random`, `minimax`…) map to numbers once, in order of creation from the CHANGELOG, and old saved games migrate
  through that map.

This replaces the parked "numeric bot IDs" item in TODO.md. There are now 20 bots, past the twenty the parked note asked
for.

## To do

- [ ] `progress`, `entropy` (overall and per side), `emptyPits` and an estimated `volatility` as Evaluator pieces, with
      tests.
- [ ] Record games from a full rating run (`npm run rate -- 40 --record`) and turn them into positions with these
      features added (`npm run positions`).
- [ ] Post 1: what progress and entropy look like over a typical game, by bot strength.
- [ ] Post 2: the relay model: predicted against measured segments per turn; free-turn and capture rates by stage.
- [ ] Try a volatility-triggered search extension in Minimax; keep it only if it wins an SPRT.
- [ ] A tapered evaluation with fitted weights (#15); post the weights and what they say about the game.
- [ ] A softmax bot with a temperature dial; rate it at a few temperatures and see if it fills the ladder smoothly.
- [ ] The numbered registry: a design note in BOTS.md, the id map, the saved-game migration, then the code.
- [ ] Publish posts on the site, not just in the repo (see [README.md](README.md)).
