# Mancala

**Ohvalhugondi, the Maldivian mancala, in the browser.** Seven pits a side, seven seeds in each, and relay sowing. Play
a friend on the same screen, or one of eighteen bots from Hopeless to Expert, and keep an Elo rating of your own.

**Play: [seven-leven.github.io/mancala](https://seven-leven.github.io/mancala/)**

![The game in its paper theme, a few moves in](docs/screenshot-light.png)

I started this in December 2022 to build a bot that could beat my grandmother at ohvalhugondi. The command-line game
came first; the bot (the DFS one below) came in August 2024; the web version in 2025; and this TypeScript rewrite in
October 2026. [The full story](https://seven-leven.github.io/folio/code-mancala.html) is on my folio.

## How to play

- Pick one of your pits. Its seeds are sown one by one, counter-clockwise, past your store but never into your
  opponent's.
- **Relay:** if the last seed lands in a pit that already had seeds, pick them all up and keep sowing.
- **Free turn:** if the last seed lands in your own store, play again.
- **Capture:** if the last seed lands in an empty pit on your side, bank everything in the pit opposite. The seed that
  landed stays put.
- The game ends when a side runs out of seeds, or as soon as a store holds more than half of all 98. Each player banks
  what's left on their side, and the fuller store wins.

House rules in Settings change the seeds per pit (3–15), let captures happen on either side, or turn off the early
finish. Keys: `1`–`7` play your pits (counted from your own left), `N` new game, `U` undo, `H` hint, `S` skip, `?` the
rules.

### Going first decides a lot

Relay sowing and free turns make long chains, and one good chain can end the game. With the standard rules the Minimax
bot proves that **the first player wins by force: opening with pit 1 starts a chain of free turns that clinches the
majority before the other side ever moves.** Minimax against itself ends 94–4. With the early finish turned off, pit 1
still leaves the first player about 77 seeds ahead with best play, and every other opening leaves them behind. That's
why Settings lets you choose who goes first.

## The bots

![The bots' Elo ladder, each with its 90% range](docs/ladder.svg)

| Level      | Bot                |  Elo | 90% range | How it plays                                                               |
| ---------- | ------------------ | ---: | :-------: | -------------------------------------------------------------------------- |
| Expert     | Minimax            | 2048 | 2028–2070 | Alpha-beta search with a transposition table; follows free-turn chains     |
| Hard       | DFS                | 1970 | 1948–1994 | Chains its own free turns as far as they go (the original 2024 bot)        |
| Sharp      | Shrewd             | 1911 | 1890–1933 | Lookahead's method, three moves deep instead of two                        |
| Tricky     | Lookahead          | 1725 | 1706–1744 | Two moves deep, and picks one of its better moves, not always the best     |
| Thoughtful | Planner            | 1696 | 1679–1716 | Two moves deep, weighing free turns set up, captures threatened, open pits |
| Clever     | Sometimes planner  | 1566 | 1548–1587 | Planner's move most of the time; otherwise like Greedy                     |
| Keen       | Chainer            | 1482 | 1465–1501 | Usually takes a free turn or two before banking; otherwise like Greedy     |
| Crafty     | Spoiler            | 1460 | 1442–1480 | Often plays to leave your best reply weakest; otherwise like Greedy        |
| Average    | Greedy             | 1311 | 1296–1331 | Takes whatever banks the most seeds this turn                              |
| Careful    | Turtle             | 1298 | 1282–1315 | Banks what it can, but won't leave a loaded pit open to capture            |
| Relaxed    | Sometimes greedy   | 1197 | 1179–1214 | Greedy's move half the time, any legal pit the rest                        |
| Bold       | Striker            | 1139 | 1123–1157 | Banks what it can, but would rather line up a capture for next turn        |
| Easy       | Random             | 1000 |  anchor   | Any legal pit                                                              |
| Thrifty    | Hoarder            |  926 |  907–946  | Keeps its seeds on its own side, banking only a little                     |
| Mild       | Fickle             |  831 |  812–849  | Sometimes keeps its seeds at home like Hoarder; more often gives them away |
| Gentle     | Sometimes generous |  742 |  722–761  | Generous's move most of the time, any legal pit the rest                   |
| Very easy  | Generous           |  570 |  548–594  | Greedy's opposite: banks as little as it can                               |
| Hopeless   | Pushover           |  502 |  481–522  | Searches ahead like Minimax, but to lose by as much as it can              |

Every bot played every other 240 times, in matched pairs, with Random pinned at 1000. Read the ratings as a ladder: the
bars are 90% ranges, and red marks neighbours whose order is less than 90% sure (today none: every bot is above the next
one down in at least 91% of resampled fits). [RATING.md](docs/RATING.md) explains how they're made and how to read them;
[BOTS.md](docs/BOTS.md) has the standard every bot follows.

**Your rating.** Your own Elo is worked out in your browser from your finished games against the bots (everyone starts
at 1000, level with Random); see [RATING.md](docs/RATING.md#your-rating) for which games count. "Your games" shows the
rating, its trend, your record against each bot, a backup, and your games as text (MGN).

## How it's built

TypeScript on [Node](https://nodejs.org) 24, which runs the `.ts` files directly (it strips the types; no compile step).
esbuild bundles the game for the browser, with no runtime dependencies.

```
src/game/    the rules: one pure engine, playTurn(), that returns the new state and an event log;
             and MGN, the game notation (notation.ts, see docs/NOTATION.md)
src/bots/    the bot list the game uses (bots.ts), the ratings, and the Web Worker they run in
  players/   the bots, by family: basic, one-move, chain, search and mixed (see docs/BOTS.md)
  search/    the Minimax search, and the scoring pieces bots share (evaluate.ts)
src/ui/      the board, the stats dialog, sound
src/app/     the turn loop (game.ts), settings, saved games and your rating
public/      the page and its styles
tests/       the rules, the bots, the rating maths
tools/       build, release, bench, design sheet, the ladder chart (ladder.ts), bot-against-bot games (match.ts)
  tournament/  rates the bots: the games (main.ts), openings, checkpoints and the Elo fit (elo.ts)
  positions.ts  recorded games to training data for the evaluation
```

**The screen never re-implements the rules.** `playTurn()` records every pickup, drop, capture and sweep as it plays a
move; the animation only replays that log, so what you see is what the engine did. Bots run in a Web Worker, so a long
search never freezes the page.

**The design** follows [DESIGN.md](docs/DESIGN.md), which borrows the folio's paper, ink, type and pills so the two read
as one body of work. Here it is on one sheet ([docs/design-guide.png](docs/design-guide.png)):

![The design guide as one sheet](docs/design-guide.png)

### Working on it

```sh
npm install                    # once: esbuild, TypeScript, the formatter and linter
npm run dev                    # build, watch, and serve at http://localhost:8010/
npm test                       # the test harness: rules, bots and ratings, files in parallel
npm run check                  # type check (also: npm run lint, npm run fmt)
npm run rate -- 240 --write    # the rating harness: rate the bots and update the menus
npm run bench                  # how deep and fast Minimax searches
npm run ladder                 # redraw docs/ladder.svg from the ratings
npm run profile                # where a rating run spends its time (data/profile/)
npm run release                # from dev: check everything, then ship to main
```

The **test harness** (`npm test`) checks the code is correct and runs on every push. The **rating harness** (`npm run
rate`) sets the bots' Elo and runs by hand: see [RATING.md](docs/RATING.md).

Every push runs the same checks on GitHub. A push to `main` builds the site and publishes `dist/` to the `gh-pages`
branch, which GitHub Pages serves. Work happens on `dev`. `main` is protected: it only takes a pull request whose checks
passed, never a direct push or a force-push. `npm run release` opens that pull request from `dev` (or uses the open
one), waits for its checks, merges it, and waits for the deploy.

To add a bot, follow [BOTS.md](docs/BOTS.md) to write it and [RATING.md](docs/RATING.md) to place and rate it.

## Changes

See [CHANGELOG.md](CHANGELOG.md).

## Licence

All rights reserved: see [LICENSE](LICENSE). You're welcome to read the code and play the game.
