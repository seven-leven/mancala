# Intuition (`intuition`)

Names a pit at a glance: a neural network that learned Minimax's moves, with no search at all.

- **Decides:** `nothing`; **judges:** `net`
- **Status:** candidate: Waiting for a full rating: a 120-game placement run put it near 1200, between Striker and
  Greedy.
- **Level:** Instinctive

## Speed

| Where                                   | ms a move |
| --------------------------------------- | --------: |
| Early in the game (the first ten moves) |      0.02 |
| Later (the positions below)             |      0.01 |

## Against perfect play (100 solved positions, standard board)

Perfect: its move keeps the position's value. Gives up: final-margin seeds lost against perfect play, on average.

| Bot              | Perfect | Gives up |
| ---------------- | ------: | -------: |
| **Intuition**    |   48.0% |     5.56 |
| Minimax (Expert) |   84.0% |     0.52 |
| Greedy           |   39.0% |     6.86 |

## Placement (60 games a pairing, Random and bots across the ladder)

**1144** (90% range 1102–1194), between Random and Greedy.

| Bot              |      Elo | 90% range |
| ---------------- | -------: | :-------: |
| Minimax          |     2057 | 1966–2161 |
| Monte Carlo      |     1769 | 1704–1845 |
| Greedy           |     1274 | 1228–1337 |
| **Intuition**    | **1144** | 1102–1194 |
| Random           |     1000 |  anchor   |
| Hoarder          |      952 | 901–1005  |
| Learned pushover |      487 |  405–554  |

_`npm run eval -- intuition`, 2026-10-23._
