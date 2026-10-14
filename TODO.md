# To do

What's left after the v2 rewrite (TypeScript, the design guide, four bots, gh-pages deploys), roughly in order.

## Before calling v2 finished

- [ ] **Rewrite the README.** `readme.md` still describes v1 (plain JS in `js/`, "no build step"). It needs: what the
      game is, a screenshot (`docs/screenshot-light.png` / `-dark.png`), the rules and house-rule options, the keys, the
      bot table from `deno task tournament`, the architecture (engine → events → animation; bots in a Web Worker),
      development (`deno task dev`, `test`, `build`, `release`) and how deploys work (main → Actions → `gh-pages`).
      Rename it to `README.md`.
- [ ] **Add a CHANGELOG.md**, like the folio's: v1.0 (Aug 2025, first web version), v1.1 (Jul 2026, unified game logic
      and the bot registry), v2.0 (this rewrite).
- [ ] **Seed spacing:** a few seeds in a big cup sit off to one side (one seed in a store lands near its edge). Scale
      the spiral's spread with the count: `spread = 0.42 * min(1, sqrt(shown / 7))` in `seedsHtml()` (`src/ui/board.ts`)
      and in `docs/design-guide.html`, then `deno task design-sheet`.
- [ ] **Retake the screenshots** as full-page shots with margins, mid-game, light and dark (the current ones are cropped
      to the content's edge).
- [ ] **Prune `deno.lock`.** It was copied from the folio so puppeteer could install offline, so it carries the folio's
      extra entries.

## The folio

- [ ] Link the Aug 2024 "The mancala bot, finally" entry to the game and the repo ("Play it" →
      seven-leven.github.io/mancala, "Source" → github.com/seven-leven/mancala), like the Wildlife entry's links.
- [ ] Bring the folio's own mancala engine (`site/assets/js/coding/mancala.js`) in line with the game's default rules:
      capture only from your own side, the landing seed is banked too, and the game ends on a clinched majority. It
      currently captures from either side and doesn't bank the landing seed.
- [ ] Mention in the entry's text that the web version became a TypeScript rewrite with an alpha-beta bot (with AI's
      help), keeping the existing story.

## The game

- [ ] **Minimax is close to unbeatable.** With relay sowing and free turns, one good chain ends the game: after your
      first move it often chains 9–10 free turns and wins 78–20. Consider weaker Minimax levels (a shorter time budget,
      or a little randomness among near-best moves) so "Expert" isn't the only search bot.
- [ ] **Tell players about the first-move edge.** From the opening, Minimax proves the first player can force a win in 9
      plies (open with pit 1). The new "Who goes first" setting lets people play with it; the rules dialog or README
      could say why it matters.
- [ ] Speed up the search in plain TypeScript before considering WebAssembly: a transposition table, and the board as a
      typed array instead of cloned objects. WASM only makes sense for a perfect-play endgame table.
- [ ] Show the bot's thinking (the depth reached and its evaluation) in the move log.
- [ ] An option to replay a finished game move by move from the log.
- [ ] Sound for sowing, captures and free turns, off by default.

## Housekeeping

- [ ] Add a LICENSE (none yet; choose one).
- [ ] Set the repo's description, website and topics on GitHub.
- [ ] Cache `.cache/esbuild-*.wasm` in the Actions workflow so CI doesn't download esbuild on every run.
