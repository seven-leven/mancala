# Mancala

A browser-based Mancala game in vanilla JavaScript — no build step, no dependencies. Play against another person or one
of several bots.

**Live:** https://seven-leven.github.io/mancala/

## Features

- **Player vs Player** on a single screen.
- **Three bots** of increasing strength: Random, Greedy, and DFS.
- Animated stone-by-stone sowing driven by the same rules the game logic uses, so what you see always matches the real
  state.
- Multi-lap sowing, free turns, captures, and end-of-game sweeps.

## Running locally

Because it uses ES modules, open it through a web server rather than the `file://` protocol:

```bash
# from the project root
python -m http.server 8000
# then visit http://localhost:8000
```

Any static server works (e.g. `npx serve`).

## Rules

This is a 7-per-pit variant on a standard 6-pit board (7 playable pits per side):

- Each player has 7 pits and one store (mancala) to their right.
- On your turn, pick up all stones from one of your pits and sow them one by one counter-clockwise, **skipping your
  opponent's store**.
- **Free turn** — if your last stone lands in your own store, you go again.
- **Capture** — if your last stone lands in one of your _own_ empty pits, you capture that stone plus all stones in the
  opposite pit, into your store.
- **Multi-lap** — if the last stone lands in a non-empty pit, scoop it up and keep sowing (relay sowing).
- **Game over** — when either player's pits are all empty, each player sweeps their remaining stones into their own
  store. Most stones wins.

## Architecture

The code is split so that **game rules live in exactly one place** and everything else reacts to them.

```
index.html          Static shell (board, controls, status bar)
css/style.css       Styling
js/
  main.js               Wires everything together and starts the game
  state.js              MancalaState — pure data (pits, current player, gameOver)
  logic.js              The rules. playTurn() is the single source of truth
  bots.js               Bot implementations + the bot registry
  animation-handler.js  Replays a turn's event log as animation
  ui.js                 All DOM reading/rendering
  game-controller.js    Orchestrates the turn flow
```

### Data flow of a move

```
click / bot pick
      │
      ▼
GameController.playMove(i)
      │   playTurn(state, i)  ── pure: clones state, applies rules,
      │                            returns { newState, events, freeTurn, … }
      ▼
AnimationHandler.animate(events)  ── replays pickup/drop/capture/sweep visually
      │
      ▼
state.copyFrom(newState)  ── the live state adopts the simulated result
      │
      ▼
GameController.afterMove()  ── free turn? game over? trigger the bot?
```

`playTurn()` records an ordered **event log** (`pickup`, `drop`, `capture`, `sweep`) while it computes the outcome. The
animator simply plays that log back, so the rules are never re-implemented for display — the old duplication between
logic and animation is gone.

## Bots

Bots are stateless and play for whichever side is to move (`state.current`), so a bot class could drive either player.
Each exposes:

```js
{
  thinkDelay, // ms to pause before moving, so the move is watchable
    choose(state); // -> pit index to play, or null if no move
}
```

| Bot    | Strategy                                                             |
| ------ | -------------------------------------------------------------------- |
| Random | Picks a uniformly random legal move.                                 |
| Greedy | One-ply: the move that maximises its own store right now.            |
| DFS    | Follows its own free-turn chains to maximise its store (no minimax). |

### Adding a bot

1. Implement a class with `thinkDelay` and `choose(state)` in `js/bots.js`.
2. Add one line to `BOT_REGISTRY`:

   ```js
   ["mybot", { label: "My Bot", create: () => new MyBot() }],
   ```

The opponent dropdown fills itself from the registry, so there's nothing else to change.
