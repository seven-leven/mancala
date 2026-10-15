# Changelog

Versions are `MAJOR.MINOR.PATCH`, set by hand in `deno.json`, and the live game shows the version in its footer. Each
release has a section here; work since the last one sits under _Unreleased_.

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
