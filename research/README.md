# Research

Notes on the game itself: what the numbers say about ohvalhugondi, published as findings come in. The plan behind them,
and what's still to do, is in [PLAN.md](PLAN.md).

## Posts

Newest first.

- _None yet._ The first is planned: what progress and entropy look like over a game.

Earlier finding, from the README: [the first player wins by force](../README.md), opening with pit 1.

## Writing a post

- One file per post, in `research/posts/`, named `YYYY-MM-DD-short-title.md`.
- Open with the question in a sentence, then the answer, then how it was measured. Include the commands that reproduce
  it (`npm run rate …`, `npm run positions …`) and the bots and games used.
- Charts go in `research/images/`, drawn by a script in `tools/`, so they can be redrawn.
- Add the post to the list above, and tick its item in [PLAN.md](PLAN.md).
- A post is a snapshot: don't rewrite it when things change. Write a new post and link back.

For now posts live in the repo, where GitHub renders them. Publishing them on the game's site, under `/mancala/`, is on
the plan.
