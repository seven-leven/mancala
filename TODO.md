# To do

What's left, and what was decided. Done items stay ticked for a release or two, then go.

## Still to do

- [ ] Ideas: a perfect-play endgame table (the one place WebAssembly would earn its keep); more bots between Average and
      Tricky, which would also firm up the ratings in that gap.

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
- [x] Elo for the bots (`deno task tournament`, with ranges), and for you, from games saved in the browser.
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
