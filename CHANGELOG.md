# Changelog

Versions are `MAJOR.MINOR.PATCH`, set by hand in `deno.json`, and the live game shows the version in its footer. Each
release has a section here; work since the last one sits under _Unreleased_.

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
- **The ladder as a chart**: `deno task ladder` draws [docs/ladder.svg](docs/ladder.svg) from the ratings, marking
  neighbours too close to call; the README shows it.
- `deno task profile` shows where a tournament round spends its time; TODO.md's v2.5 lists what to speed up.
- **Fairer ratings.** The tournament plays matched pairs (each opening once from each seat), can deal symmetric random
  boards (`--openings symmetric`), stops on a time budget (`--time 10m`), saves after every round and resumes
  (`--resume`), and shows its progress on one line that fits the terminal. All the ratings changed; see the README.
- **A bot standard.** [BOTS.md](BOTS.md) and TypeScript contracts every bot follows; the existing bots were rewritten
  against them and play exactly as before.
- **Game notation.** [NOTATION.md](NOTATION.md): a game as text, like chess's PGN. The tournament can record every game
  (`--record`), and `deno task positions` turns them into training data for the evaluation.
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
- A new interface built to [DESIGN.md](DESIGN.md), which borrows the [folio](https://seven-leven.github.io/folio/)'s
  design language: paper and ink themes, a wooden board with drawn seeds, who plays each side and who goes first, undo,
  hint, skip, a move log, keyboard play and a phone layout.
- Built with esbuild (as WebAssembly) by Deno; CI checks every push and deploys `main` to the `gh-pages` branch;
  `deno task release` ships `dev` to `main`.

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
